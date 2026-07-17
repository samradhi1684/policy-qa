from __future__ import annotations

import csv
import json
import logging
import os
import re
import time
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor  # OPTIMIZATION: needed to run embed() and entity extraction concurrently
from functools import lru_cache  # OPTIMIZATION: needed for query-level caching
from typing import Any, Dict, List, Optional, Set, Tuple

import joblib
import numpy as np
import torch
from app.adapters.llm_client import (
    LLMClient,
    RerankerClient,
    EmbeddingClient,
)

# Routing / reference-resolution / memory — same components RAGPipeline
# (services/rag_pipeline.py) used, wired in here so new_pipeline gets the
# same behaviour: general/small-talk/out-of-scope/ambiguous messages are
# classified BEFORE retrieval and short-circuit without touching the
# index, and domain follow-ups ("what about it", "how many rounds were
# involved in it") get their pronouns/references resolved into a
# standalone query before that query is embedded/retrieved against.
# Previously this pipeline always retrieved for every message and always
# embedded the raw follow-up text as-is, which is why pronoun follow-ups
# failed to retrieve anything relevant.
from app.services.routing.conversation_router import ConversationRouter
from app.services.planner import Planner
from app.services.memory_manager import MemoryManager
from app.services.prompt_builder import PromptBuilder

llm_client = LLMClient()
reranker_client = RerankerClient(

)
embedding_client = EmbeddingClient(

)


def llm(
    prompt: str,
    max_tokens: int = 512,
    temperature: float = 0.1,
):
    return llm_client.generate(
        prompt=prompt,
        max_tokens=max_tokens,
        temperature=temperature,
    )


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Timing helper
# ---------------------------------------------------------------------------

@contextmanager
def Timer(label: str):
    """Context manager that prints elapsed wall-clock time for a code block."""
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        print(f"[TIMING] {label}: {elapsed:.3f}s")
        logger.info(f"[TIMING] {label}: {elapsed:.3f}s")


def timed(label: str):
    """Decorator version of Timer, for wrapping whole methods."""
    def deco(fn):
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            result = fn(*args, **kwargs)
            elapsed = time.perf_counter() - start
            print(f"[TIMING] {label}: {elapsed:.3f}s")
            logger.info(f"[TIMING] {label}: {elapsed:.3f}s")
            return result
        return wrapper
    return deco


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# After:
INPUT_CHUNK_INDEX    = os.getenv("CHUNK_INDEX_PATH", "/app/app/answering/indices/Z_chunk_index.joblib")
INPUT_ENTITY_INDEX   = os.getenv("ENTITY_INDEX_PATH", "/app/app/answering/indices/Z_entity_index.joblib")

# ---------------------------------------------------------------------------
# Tuning
# ---------------------------------------------------------------------------
MAX_QUERY_ENTITIES       = 7
TOP_K_SEMANTIC           = 50    # semantic pool size
ADJACENT_WINDOW          = 0    # ±N chunks around every matched chunk
TOP_K_AFTER_RERANK       = 10    # final chunks sent to LLM
ENTITY_EMB_CANDIDATES    = 10    # nearest entity-embedding neighbours to map

# OPTIMIZATION: tunable batch size for the cross-encoder forward pass.
# Larger batches amortize CUDA kernel-launch overhead across more pairs.
# Safe to raise/lower based on your GPU's VRAM headroom (32-64 is typical
# for a 7-13B-param-equivalent reranker on a single modern GPU).
CROSS_ENCODER_BATCH_SIZE = 32

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
EMBEDDING_MODEL      = "BAAI/bge-base-en-v1.5"
CROSSENCODER_MODEL   = "BAAI/bge-reranker-v2-m3"


device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

logger.info(f"CUDA available: {torch.cuda.is_available()}")

if torch.cuda.is_available():
    logger.info(f"GPU: {torch.cuda.get_device_name(0)}")

logger.info(f"Device: {device}")

# with Timer("Load embedding model"):
#     logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
#     _embed_model = SentenceTransformer(EMBEDDING_MODEL)
#     _embed_model.max_seq_length = 512
#     # OPTIMIZATION: cast the embedding model to fp16 on GPU. BGE models tolerate
#     # half precision well (this is purely a numeric-precision change in the
#     # forward pass, not an algorithm change) and roughly halves compute time
#     # and memory bandwidth use for the encode() call.
#     if device.type == "cuda":
#         _embed_model = _embed_model.half()

# with Timer("Load cross-encoder model"):
#     logger.info(f"Loading cross-encoder: {CROSSENCODER_MODEL}")
#     _cross_encoder = CrossEncoder(CROSSENCODER_MODEL, device=str(device))
#     # OPTIMIZATION: same fp16 cast for the cross-encoder. This is the most
#     # expensive model in the pipeline per-token (reranker forward pass over
#     # up to ~60 query/chunk pairs), so this has the largest fp16 payoff.
#     if device.type == "cuda":
#         _cross_encoder.model.half()
#     print("CrossEncoder device:")
#     print(next(_cross_encoder.model.parameters()).device)


# ---------------------------------------------------------------------------
# Embedding helper
# ---------------------------------------------------------------------------

# OPTIMIZATION: cache embeddings for repeated/identical queries (common in QA
# chat UIs when users re-ask or refine slightly-edited questions verbatim, or
# when retries happen). lru_cache is safe here because embed() is a pure
# function of `text` given a fixed model. Cache size capped to avoid
# unbounded memory growth. NOTE: this returns the same tensor object on
# cache hits — callers must not mutate it in place (none currently do).
@lru_cache(maxsize=512)
def _embed_cached(text: str) -> torch.Tensor:
    with Timer("embed() — query embedding (remote)"):
        vec = embedding_client.embed(text)
        v = torch.tensor(vec, dtype=torch.float32, device=device)
        result = (v / (v.norm() + 1e-8)).unsqueeze(0)
    return result


def embed(text: str) -> torch.Tensor:
    """Return a normalised (1, DIM) float32 tensor on device."""
    # Routes through the cached version — exact string repeats hit the
    # cache and skip the network round-trip entirely.
    return _embed_cached(text)


# ===========================================================================
# Index  (loaded once at startup)
# ===========================================================================

class Index:
    """
    Holds all pre-built retrieval data in memory.
    Populated by Index.load() before the pipeline runs.
    """

    def __init__(self):
        # Chunk data
        self.chunk_ids:     List[str]  = []
        self.chunk_texts:   List[str]  = []
        self.chunk_id_to_idx: Dict[str, int] = {}
        self.chunk_emb:     Optional[torch.Tensor] = None  # (N, D) normalised

        # Navigation
        self.file_to_chunks: Dict[str, List[str]] = {}   # file_id → ordered chunk ids
        self.chunk_to_file:  Dict[str, str]        = {}
        self.chunk_to_pos:   Dict[str, int]        = {}

        # Entity data
        self.entity_list:    List[str]  = []
        self.entity_emb:     Optional[torch.Tensor] = None  # (M, D) normalised
        self.entity_to_chunks: Dict[str, List[str]] = {}    # normalised → [chunk_id]

    def load(self):
        with Timer("Index.load() — TOTAL"):
            self._load_chunks()
            self._load_entities()
        logger.info("Index ready.")

    def _load_chunks(self):
        with Timer("Index._load_chunks()"):
            if not os.path.exists(INPUT_CHUNK_INDEX):
                raise FileNotFoundError(INPUT_CHUNK_INDEX)

            logger.info("Loading chunk index …")
            d = joblib.load(INPUT_CHUNK_INDEX)

            self.chunk_ids   = d["chunk_ids"]
            self.chunk_texts = d["chunk_texts"]
            self.chunk_id_to_idx = {cid: i for i, cid in enumerate(self.chunk_ids)}

            raw = d["chunk_embeddings"]
            t = torch.tensor(raw, dtype=torch.float32, device=device)
            self.chunk_emb = t / (t.norm(dim=1, keepdim=True) + 1e-8)

            self.file_to_chunks = d["file_to_ordered_chunks"]
            self.chunk_to_file  = d["chunk_id_to_file"]
            self.chunk_to_pos   = d["chunk_id_to_pos"]

            logger.info(
                f"Chunks: {len(self.chunk_ids):,}  "
                f"emb: {self.chunk_emb.shape}  "
                f"files: {len(self.file_to_chunks):,}"
            )

    def _load_entities(self):
        with Timer("Index._load_entities()"):
            if not os.path.exists(INPUT_ENTITY_INDEX):
                logger.warning(f"Entity index not found: {INPUT_ENTITY_INDEX} — entity retrieval disabled")
                return

            logger.info("Loading entity index …")
            d = joblib.load(INPUT_ENTITY_INDEX)

            self.entity_list      = d["entity_list"]
            self.entity_to_chunks = d["entity_to_chunks"]   # already str→list

            raw = d["entity_embeddings"]
            t = torch.tensor(raw, dtype=torch.float32, device=device)
            self.entity_emb = t / (t.norm(dim=1, keepdim=True) + 1e-8)

            logger.info(
                f"Entities: {len(self.entity_list):,}  "
                f"emb: {self.entity_emb.shape}  "
                f"index keys: {len(self.entity_to_chunks):,}"
            )


# ===========================================================================
# Query entity extractor
# ===========================================================================

class EntityExtractor:
    # OPTIMIZATION: cache entity extraction per query string. This is an LLM
    # round-trip (network/inference bound), so repeated/retried queries skip
    # it entirely on cache hit. Same determinism caveat as embed() — only
    # exact repeats hit the cache, so this never changes results for new text.
    @lru_cache(maxsize=512)
    def _extract_cached(self, query: str) -> Tuple[str, ...]:
        with Timer("EntityExtractor.extract() — TOTAL (incl. LLM call)"):
            prompt = f"""Extract the {MAX_QUERY_ENTITIES} most important entities or concepts needed to answer the question below.

Include: named programs/policies/regulations, documents/plans/forms, processes/procedures/deadlines, organisations/agencies/roles, specific technical/domain terms.
Exclude: filler phrases, generic words like "information"/"details", vague qualifiers.

Output ONLY entities, one per line, no numbering or punctuation.

Question:
{query}""".strip()

            try:
                with Timer("EntityExtractor — LLM call"):
                    raw = llm(prompt, max_tokens=80)
                seen: Set[str] = set()
                entities: List[str] = []
                for line in raw.splitlines():
                    e = line.strip(" -•\t")
                    if len(e) >= 3 and not e.isdigit() and e.lower() not in seen:
                        seen.add(e.lower())
                        entities.append(e)
                result = entities[:MAX_QUERY_ENTITIES]
                logger.info(f"Query entities: {result}")
                return tuple(result)  # tuple so it's hashable for lru_cache return-path consistency
            except Exception as ex:
                logger.warning(f"Entity extraction failed: {ex}")
                fallback = re.findall(r'\b[A-Z][a-zA-Z]{3,}(?:\s+[A-Z][a-zA-Z]{3,})*\b', query)[:3]
                return tuple(fallback)

    def extract(self, query: str) -> List[str]:
        return list(self._extract_cached(query))


# ===========================================================================
# Chunk retriever
# ===========================================================================

class ChunkRetriever:
    """
    Builds a candidate pool from two signals, then expands with neighbours.

    Signal A — entity pool
      1. Exact/prefix match in entity_to_chunks inverted index
      2. Top-ENTITY_EMB_CANDIDATES nearest entities by embedding → their chunks

    Signal B — semantic pool
      Top-TOP_K_SEMANTIC chunks by cosine similarity to query embedding

    Merge → deduplicate → adjacent expand → return pool with scores.
    """

    def __init__(self, index: Index):
        self.idx = index

    def retrieve(
        self,
        query: str,
        query_entities: List[str],
        q_emb: torch.Tensor,
    ) -> List[Dict[str, Any]]:

        with Timer("ChunkRetriever.retrieve() — TOTAL"):
            scores: Dict[str, Dict[str, float]] = {}

            self._entity_pool(query_entities, q_emb, scores)
            self._semantic_pool(q_emb, scores)

            # Fuse & sort
            with Timer("ChunkRetriever — fuse + sort"):
                candidates = self._fuse(scores)
                candidates.sort(key=lambda x: x["combined_score"], reverse=True)

            # Adjacent expansion on the entire pool
            expanded = self._expand(candidates)

            # Attach text
            with Timer("ChunkRetriever — attach text + dedupe"):
                result: List[Dict[str, Any]] = []
                seen: Set[str] = set()
                for item in expanded:
                    cid = item["chunk_id"]
                    if cid in seen or cid not in self.idx.chunk_id_to_idx:
                        continue
                    seen.add(cid)
                    idx = self.idx.chunk_id_to_idx[cid]
                    result.append({
                        **item,
                        "chunk_text": self.idx.chunk_texts[idx],
                    })

            logger.info(
                f"Pool: {len(scores)} raw → {len(candidates)} fused → "
                f"{len(result)} after expansion"
            )
        return result

    # ------------------------------------------------------------------
    def _entity_pool(
        self,
        query_entities: List[str],
        q_emb: torch.Tensor,
        scores: Dict[str, Dict[str, float]],
    ):
        """Exact + prefix entity match, then embedding-nearest entities."""
        # NOTE: per your request, the prefix/substring fallback matching logic
        # below is left untouched (no indexing optimization applied here).
        with Timer("ChunkRetriever._entity_pool() — TOTAL"):
            hit_count: Dict[str, float] = {}

            # --- exact / prefix match ---
            with Timer("  _entity_pool — exact/prefix match"):
                for ent in query_entities:
                    key = ent.lower().strip()
                    matched: Set[str] = set(self.idx.entity_to_chunks.get(key, []))

                    # prefix/substring fallback for short entities
                    if not matched and len(key) >= 4:
                        for idx_key, cids in self.idx.entity_to_chunks.items():
                            if key in idx_key or idx_key in key:
                                matched.update(cids)

                    for cid in matched:
                        hit_count[cid] = hit_count.get(cid, 0.0) + 1.0

                for cid, sc in hit_count.items():
                    s = scores.setdefault(cid, {"entity": 0.0, "vector": 0.0})
                    s["entity"] = sc
                    s.setdefault("source", "entity_exact")

            logger.info(f"Exact entity match: {len(hit_count)} chunks")

            # --- embedding-nearest entities → their chunks ---
            if self.idx.entity_emb is None:
                return

            with Timer("  _entity_pool — embedding-nearest entities"):
                k = min(ENTITY_EMB_CANDIDATES, len(self.idx.entity_list))
                with torch.no_grad():
                    sims = torch.mm(q_emb, self.idx.entity_emb.T).squeeze(0)
                top_scores, top_idxs = torch.topk(sims, k=k)

                # OPTIMIZATION: move topk results to CPU/numpy in ONE transfer
                # instead of calling .item() inside the loop. Each .item() call
                # forces an individual CUDA device→host sync; doing it once for
                # the whole tensor avoids k separate synchronization stalls.
                top_scores_np = top_scores.detach().cpu().numpy()
                top_idxs_np = top_idxs.detach().cpu().numpy()

                emb_hit: Dict[str, float] = {}
                for sc_val, idx_val in zip(top_scores_np, top_idxs_np):
                    ent = self.idx.entity_list[int(idx_val)].lower()
                    escore = float(sc_val)
                    for cid in self.idx.entity_to_chunks.get(ent, []):
                        emb_hit[cid] = max(emb_hit.get(cid, 0.0), escore * 0.5)

                for cid, sc in emb_hit.items():
                    s = scores.setdefault(cid, {"entity": 0.0, "vector": 0.0})
                    s["entity"] = max(s["entity"], sc)
                    s.setdefault("source", "entity_emb")

            logger.info(f"Entity-emb match: {len(emb_hit)} chunks")

    # ------------------------------------------------------------------
    def _semantic_pool(
        self,
        q_emb: torch.Tensor,
        scores: Dict[str, Dict[str, float]],
    ):
        """Top-K chunks by cosine similarity."""
        with Timer("ChunkRetriever._semantic_pool()"):
            if self.idx.chunk_emb is None:
                return
            k = min(TOP_K_SEMANTIC, len(self.idx.chunk_ids))
            with torch.no_grad():
                sims = torch.mm(q_emb, self.idx.chunk_emb.T).squeeze(0)
            top_scores, top_idxs = torch.topk(sims, k=k)

            # OPTIMIZATION: same single-transfer pattern as above — avoids
            # TOP_K_SEMANTIC (50) individual .item() device syncs per query.
            top_scores_np = top_scores.detach().cpu().numpy()
            top_idxs_np = top_idxs.detach().cpu().numpy()

            for sc_val, idx_val in zip(top_scores_np, top_idxs_np):
                cid = self.idx.chunk_ids[int(idx_val)]
                vscore = float(sc_val)
                s = scores.setdefault(cid, {"entity": 0.0, "vector": 0.0})
                s["vector"] = max(s.get("vector", 0.0), vscore)
                if "source" not in s:
                    s["source"] = "vector"
                elif s["source"] != "vector":
                    s["source"] = "entity+vector"

            logger.info(f"Semantic pool: top-{k} chunks")

    # ------------------------------------------------------------------
    @staticmethod
    def _fuse(scores: Dict[str, Dict[str, float]]) -> List[Dict[str, Any]]:
        if not scores:
            return []
        max_entity = max((v["entity"] for v in scores.values()), default=1.0) or 1.0
        result = []
        for cid, v in scores.items():
            es = v["entity"] / max_entity
            vs = v["vector"]
            result.append({
                "chunk_id":       cid,
                "entity_score":   v["entity"],
                "vector_score":   vs,
                "combined_score": 0.5 * es + 0.5 * vs,
                "is_adjacent":    False,
                "source":         v.get("source", "unknown"),
            })
        return result

    # ------------------------------------------------------------------
    def _expand(self, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Add ±ADJACENT_WINDOW neighbours for every candidate."""
        with Timer("ChunkRetriever._expand() — adjacent expansion"):
            expanded = list(candidates)
            seen = {c["chunk_id"] for c in candidates}

            for cand in candidates:
                cid = cand["chunk_id"]
                fid = self.idx.chunk_to_file.get(cid)
                pos = self.idx.chunk_to_pos.get(cid)
                if fid is None or pos is None:
                    continue
                file_chunks = self.idx.file_to_chunks.get(fid, [])
                for delta in range(-ADJACENT_WINDOW, ADJACENT_WINDOW + 1):
                    if delta == 0:
                        continue
                    nb_pos = pos + delta
                    if 0 <= nb_pos < len(file_chunks):
                        nb_cid = file_chunks[nb_pos]
                        if nb_cid not in seen:
                            seen.add(nb_cid)
                            expanded.append({
                                "chunk_id":       nb_cid,
                                "entity_score":   cand["entity_score"] * 0.5,
                                "vector_score":   cand["vector_score"]  * 0.5,
                                "combined_score": cand["combined_score"] * 0.6,
                                "is_adjacent":    True,
                                "source":         "adjacent",
                            })

            logger.info(f"Adjacent expansion: {len(candidates)} → {len(expanded)}")
        return expanded


# ===========================================================================
# Cross-encoder reranker
# ===========================================================================

from app.services.confidence import LOW_CONFIDENCE_RERANK_THRESHOLD


class Reranker:
    def rerank(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        top_k: int = TOP_K_AFTER_RERANK,
    ) -> List[Dict[str, Any]]:
        with Timer(f"Reranker.rerank() — TOTAL ({len(chunks)} chunks)"):
            if not chunks:
                return []

            pairs = [[query, c["chunk_text"]] for c in chunks]

            try:
                with Timer("Remote CrossEncoder.predict()"):
                    ce_scores = reranker_client.predict(pairs)

            except Exception as e:
                logger.exception("Remote reranker API failed")
                raise

            ranked = sorted(
                [
                    {
                        **c,
                        "rerank_score": float(score),
                    }
                    for c, score in zip(chunks, ce_scores)
                ],
                key=lambda x: x["rerank_score"],
                reverse=True,
            )

            ranked = [
                chunk
                for chunk in ranked
                if chunk["rerank_score"] >= LOW_CONFIDENCE_RERANK_THRESHOLD
            ]

            # fallback so retrieval never becomes empty
            if not ranked:
                ranked = sorted(
                    [
                        {
                            **c,
                            "rerank_score": float(score),
                        }
                        for c, score in zip(chunks, ce_scores)
                    ],
                    key=lambda x: x["rerank_score"],
                    reverse=True,
                )[:1]

            ranked = ranked[:top_k]

            logger.info(
                f"Reranker: {len(chunks)} → {len(ranked)} "
                f"(threshold={LOW_CONFIDENCE_RERANK_THRESHOLD}) "
                f"scores: {[round(c['rerank_score'], 3) for c in ranked]}"
            )

        return ranked


# ===========================================================================
# Citation helpers (evidence numbering + highlight-span lookup)
# ===========================================================================

from rapidfuzz import fuzz  # OPTIMIZATION note: same lib already used elsewhere in the codebase


def _split_sentences(text: str) -> List[str]:
    """Break a chunk's text into citable sentence-ish units (same heuristic
    used by the legacy RAGPipeline, kept identical so behaviour is familiar)."""
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    sentences: List[str] = []
    for part in parts:
        sub = re.split(r'\n+|(?<=\w)\s*[-·•]\s*(?=[A-Z])', part)
        sentences.extend(sub)
    return [s.strip() for s in sentences if len(s.strip()) > 15]


def _locate_span(chunk_text: str, sentence: str) -> Optional[Tuple[int, int]]:
    """Find the (start, end) character offset of `sentence` inside
    `chunk_text`. Tries an exact case-insensitive match first, then falls
    back to a fuzzy sliding-window match for minor whitespace differences.

    Key fix: the fuzzy pass now finds the BEST scoring window across the
    entire chunk (not the first window that exceeds the threshold) and
    raises the threshold to 85 to avoid loose matches that caused large
    irrelevant spans to be highlighted."""
    sent_lower = sentence.lower().strip()
    chunk_lower = chunk_text.lower()

    # 1. Exact match (fastest path)
    start = chunk_lower.find(sent_lower)
    if start != -1:
        return start, start + len(sentence)

    # 2. Fuzzy sliding-window — find the BEST scoring position, not the first
    sent_len = len(sentence)
    window_size = sent_len + 20  # small overrun to absorb whitespace diffs
    best_score = 0
    best_start = -1

    step = max(1, sent_len // 4)  # stride to keep it fast on long chunks
    for i in range(0, max(1, len(chunk_text) - sent_len + 1), step):
        window = chunk_lower[i:i + window_size]
        score = fuzz.ratio(sent_lower, window)  # ratio not partial_ratio for tighter match
        if score > best_score:
            best_score = score
            best_start = i

    # Higher threshold (85 vs 75) to avoid spurious matches
    if best_score >= 85 and best_start != -1:
        return best_start, min(best_start + sent_len, len(chunk_text))

    return None


# ===========================================================================
# Answer generator
# ===========================================================================

class AnswerGenerator:

    @staticmethod
    def _build_context(chunks: List[Dict[str, Any]]) -> str:
        with Timer("AnswerGenerator._build_context()"):
            """Group by document, sort within group, render as labelled blocks."""
            groups: Dict[str, List[Dict]] = {}
            order: List[str] = []
            for c in chunks:
                m = re.match(r"^(.+)_chunk_\d+$", c["chunk_id"])
                prefix = m.group(1) if m else c["chunk_id"]
                if prefix not in groups:
                    groups[prefix] = []
                    order.append(prefix)
                groups[prefix].append(c)

            def _num(c: Dict) -> int:
                mm = re.search(r"_chunk_(\d+)$", c["chunk_id"])
                return int(mm.group(1)) if mm else 0

            blocks = []
            for rank, prefix in enumerate(order, 1):
                grp = sorted(groups[prefix], key=_num)
                parts = [f"[Document {rank}: {prefix}]"]
                for c in grp:
                    tag = " | ADJACENT" if c.get("is_adjacent") else ""
                    parts.append(
                        f"  [chunk: {c['chunk_id']} | score: {c.get('rerank_score', 'N/A')}{tag}]\n"
                        f"  {c['chunk_text']}"
                    )
                blocks.append("\n".join(parts))
            result = "\n\n".join(blocks)
        return result

    @staticmethod
    def _build_numbered_evidence(
        chunks: List[Dict[str, Any]]
    ) -> Tuple[str, Dict[str, Dict[str, Any]]]:
        """Split every chunk into sentences and number them [S0], [S1], ...
        so the LLM can cite exactly which sentences it used.

        Returns (numbered_context_str, evidence_map) where evidence_map maps
        a sentence id -> {"sentence": str, "chunk_idx": index into `chunks`}.
        """
        evidence_map: Dict[str, Dict[str, Any]] = {}
        lines: List[str] = []
        sid_counter = 0

        for chunk_idx, chunk in enumerate(chunks):
            lines.append(f"[Source {chunk_idx}: {chunk['chunk_id']}]")
            for sentence in _split_sentences(chunk["chunk_text"]):
                sid = f"S{sid_counter}"
                evidence_map[sid] = {
                    "sentence": sentence,
                    "chunk_idx": chunk_idx,
                }
                lines.append(f"  [{sid}] {sentence}")
                sid_counter += 1

        return "\n".join(lines), evidence_map

    def generate(
        self,
        query: str,
        top_chunks: List[Dict[str, Any]],
        question_type: str = "Descriptive",
        conditions: str = "N/A",
    ) -> Tuple[str, str, List[str], Dict[str, Dict[str, Any]]]:
        """Returns (answer, prompt, citations, evidence_map).

        `citations` is the list of sentence ids (e.g. ["S0", "S4"]) the model
        says it actually used. `evidence_map` lets the caller trace each id
        back to the chunk it came from, so highlight spans can be computed.
        """
        with Timer("AnswerGenerator.generate() — TOTAL (incl. LLM call)"):
            is_yes_no = question_type.lower().startswith("yes")

            prompt, evidence_map = self.build_prompt(
                query,
                top_chunks,
                question_type,
                conditions,
            )

            if not prompt:
                fallback = (
                    "No — No relevant information found."
                    if is_yes_no
                    else "No relevant information found."
                )

                return fallback, "", [], {}
            try:
                max_tok = 300 if is_yes_no else 3000
                with Timer("  AnswerGenerator — LLM call"):
                    raw = llm(prompt, max_tokens=max_tok, temperature=0.1)

                answer, citations = self._parse_response(raw, is_yes_no)

                logger.info(f"Answer: {answer[:120]}  citations={citations}")
                return answer, prompt, citations, evidence_map

            except Exception as e:
                logger.error(f"Answer generation failed: {e}")
                return (
                    "No — Error during generation" if is_yes_no
                    else "Unable to generate answer.",
                    "", [], evidence_map,
                )

    def build_prompt(
        self,
        query: str,
        top_chunks: List[Dict[str, Any]],
        question_type: str = "Descriptive",
        conditions: str = "N/A",
    ):
        numbered_context, evidence_map = self._build_numbered_evidence(top_chunks)

        if not numbered_context:
            return "", {}

        prompt = f"""
Answer the question using ONLY the evidence below.

Question:
{query}

Evidence:
{numbered_context}

Instructions:
- Use only the supplied evidence.
- If the evidence does not answer the question, say so.
- Return ONLY valid JSON.
- Format exactly as:

{{
  "answer": "<your answer>",
  "citations": ["S0","S2"]
}}

Answer:
""".strip()

        return prompt, evidence_map



    def build_stream_prompt(
        self,
        query: str,
        top_chunks: List[Dict[str, Any]],
    ):
        numbered_context, evidence_map = self._build_numbered_evidence(top_chunks)

        if not numbered_context:
            return "", {}

        prompt = f"""
    Answer the question using ONLY the evidence below.

    Question:
    {query}

    Evidence:
    {numbered_context}

    Instructions:
    - Answer only using the evidence.
    - Write a clear factual answer.
    - Do NOT output JSON.
    - Do NOT output citations.
    - Do NOT mention source ids such as S0 or S1.
    - Return plain text only.

    Answer:
    """.strip()

        return prompt, evidence_map

        


    @staticmethod
    def _parse_response(raw: str, is_yes_no: bool) -> Tuple[str, List[str]]:
        """Robustly parse the {"answer": ..., "citations": [...]} JSON the
        model was asked for, with graceful fallbacks if it didn't comply."""
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.replace("```json", "").replace("```", "").strip()

        parsed: Any = None
        try:
            parsed = json.loads(cleaned)
        except Exception:
            # Model may have added prose around the JSON object — grab the
            # outermost {...} block and retry.
            m = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if m:
                try:
                    parsed = json.loads(m.group(0))
                except Exception:
                    parsed = None

        if isinstance(parsed, dict):
            answer = parsed.get("answer", cleaned)
            citations = parsed.get("citations", []) or []
            if not isinstance(citations, list):
                citations = []
            citations = [c for c in citations if isinstance(c, str)]
        else:
            # Model ignored the JSON instruction entirely — treat the raw
            # text as the answer with no citations rather than failing.
            answer = cleaned
            citations = []

        if is_yes_no:
            m = re.match(r"^(Yes|No)\s*(?:—|–|--|-)?\s*(.+)$", str(answer),
                         re.IGNORECASE | re.DOTALL)
            answer = (f"{m.group(1).capitalize()} — {m.group(2).strip()}" if m
                      else "No — No explicit supporting evidence found.")

        return str(answer), citations


def _doc_id_from_chunk_id(chunk_id: str) -> str:
    """Corpus ids look like '22260_chunk_3'; uploads look like
    'upload::upload-abc123_chunk_0'. Both map back to their document id."""
    cid = chunk_id.split("::", 1)[1] if chunk_id.startswith("upload::") else chunk_id
    return cid.split("_chunk_")[0]


# ===========================================================================
# Pipeline
# ===========================================================================

class Pipeline:
    def __init__(self, index: Index):
        self.extractor  = EntityExtractor()
        self.retriever  = ChunkRetriever(index)
        self.reranker   = Reranker()
        self.generator  = AnswerGenerator()
        # OPTIMIZATION: small dedicated thread pool to run embed() and
        # extractor.extract() concurrently — they are independent given only
        # the raw query string, but were previously run sequentially even
        # though one is a local GPU encode and the other is a network/LLM
        # round-trip. Overlapping them removes the smaller of the two
        # durations from the critical path almost for free.
        self._io_pool = ThreadPoolExecutor(max_workers=2)

        # Step: routing + reference resolution, ported over from
        # RAGPipeline so this pipeline gets the same conversational
        # short-circuiting and follow-up handling.
        self.router = ConversationRouter(llm_client)
        self.planner = Planner(llm_client)
        self.memory = MemoryManager()
        self.prompt_builder = PromptBuilder()

    def _plan(
        self,
        question: str,
        chat_history=None,
        chat_id: Optional[str] = None,
        has_document: bool = False,
    ):
        """
        Classify the message and, for anything that actually needs the
        policy index, resolve references ("it", "that", "how many rounds
        were involved in it") into a standalone query using conversation
        history.

        Returns (memory_context, route, resolved_query, short_circuit):
          - short_circuit is a finished answer string for "general",
            "out_of_scope" and "clarify" routes — callers should return
            it directly without running retrieval.
          - short_circuit is None for "domain" routes — callers should
            proceed to retrieval using `resolved_query` (the reference-
            resolved standalone query) instead of the raw `question`.

        When has_document=True the router's general/out_of_scope/clarify
        short-circuits are suppressed entirely — we skip the wasted LLM
        call and return a sentinel that prepare_for_stream() will discard,
        saving ~1-2s per query when an uploaded document is present.
        """
        memory_context = self.memory.build_context_with_summary(
            chat_history,
            llm_client,
        )

        has_uploaded_documents = self._has_uploaded_documents(chat_id)

        route = self.router.route(question, memory_context, has_uploaded_documents)
        logger.info(f"[ROUTER] category={route.category} confidence={route.confidence}")

        if route.is_general():
            # When a document is attached, skip the generic LLM call —
            # prepare_for_stream() will null out short_circuit and route
            # to document retrieval anyway. Returning a sentinel avoids the
            # wasted network round-trip (~1-2s).
            if has_document:
                return memory_context, route, question, "__has_document_skip__"
            raw = llm_client.generate(
                self.prompt_builder.build_conversational(question, memory_context),
                temperature=0.4,
                max_tokens=200,
            )
            return memory_context, route, question, str(getattr(raw, "content", raw)).strip()

        if route.is_out_of_scope():
            if has_document:
                return memory_context, route, question, "__has_document_skip__"
            raw = llm_client.generate(
                self.prompt_builder.build_out_of_scope(question),
                temperature=0.3,
                max_tokens=150,
            )
            return memory_context, route, question, str(getattr(raw, "content", raw)).strip()

        if route.is_clarify():
            if has_document:
                return memory_context, route, question, "__has_document_skip__"
            raw = llm_client.generate(
                self.prompt_builder.build_clarification(question, memory_context),
                temperature=0.3,
                max_tokens=150,
            )
            return memory_context, route, question, str(getattr(raw, "content", raw)).strip()

        # route.category == "domain" — resolve references into a
        # standalone query before retrieval/embedding touches it.
        decision = self.planner.plan(question, memory_context)
        logger.info(f"[PLANNER] {decision}")

        resolved_query = decision.get("standalone_query")
        if not isinstance(resolved_query, str) or not resolved_query.strip():
            resolved_query = question

        return memory_context, route, resolved_query, None

    def run(
        self,
        query: str,
        question_type: str = "Descriptive",
        conditions: str = "N/A",
        generate_answer: bool = True,
        extra_chunks: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        logger.info(f"\n{'='*70}\nQUERY: {query}\n{'='*70}")
        print(f"\n{'='*70}\n[TIMING] PIPELINE RUN START — QUERY: {query}\n{'='*70}")

        pipeline_start = time.perf_counter()

        # OPTIMIZATION: launch embedding (GPU-bound) and entity extraction
        # (LLM round-trip, network-bound) concurrently instead of sequentially.
        # Previously: embed() then extractor.extract() — durations added.
        # Now: both run in parallel — total wait ≈ max(embed, extract) instead
        # of embed + extract. This is a pure scheduling change; neither
        # function's internal logic or output is modified.
        # ------------------------------------------------------
        # DOCUMENT MODE
        # ------------------------------------------------------

        if extra_chunks:

            logger.info("Document mode enabled - using uploaded documents only")

            query_entities = []

            pool = extra_chunks

        # ------------------------------------------------------
        # NORMAL CORPUS MODE
        # ------------------------------------------------------

        else:

            with Timer("Pipeline — concurrent embed() + extract()"):

                emb_future = self._io_pool.submit(embed, query)

                entities_future = self._io_pool.submit(
                    self.extractor.extract,
                    query,
                )

                q_emb = emb_future.result()

                query_entities = entities_future.result()

            pool = self.retriever.retrieve(
                query,
                query_entities,
                q_emb,
            )

        if not pool:
            is_yn = question_type.lower().startswith("yes")
            total = time.perf_counter() - pipeline_start
            print(f"[TIMING] PIPELINE RUN TOTAL (empty pool): {total:.3f}s")
            return {
                "predicted_answer": "No — No relevant information found." if is_yn
                                    else "No relevant information found.",
                "prompt":           "",
                "query_entities":   query_entities,
                "top_chunks":       [],
                "citations":        [],
                "evidence_map":     {},
            }

        # 3. Rerank
        if extra_chunks:

            logger.info("Skipping reranker for uploaded documents")

            top_chunks = pool

        else:

            top_chunks = self.reranker.rerank(
                query,
                pool,
            )

        # 4. Generate answer (+ which evidence sentences it actually cited)
        if generate_answer:

            answer, prompt, citations, evidence_map = self.generator.generate(
                query,
                top_chunks,
                question_type,
                conditions,
            )

        
        else:

            prompt, evidence_map = self.generator.build_stream_prompt(
                query,
                top_chunks,
            )

            # Fast citation-only LLM call to populate highlight_spans before
            # streaming begins. Asks for minimum necessary sentences only.
            citations = []
            if evidence_map:
                evidence_lines = "\n".join(
                    f"  [{sid}] {ev['sentence']}"
                    for sid, ev in evidence_map.items()
                )
                citation_prompt = f"""You are a precise evidence highlighter.

Question: {query}

Evidence:
{evidence_lines}

Task: Return ONLY the sentence IDs that contain the direct factual answer to the question.
Rules:
- Select the MINIMUM number of sentences needed
- Exclude headings, labels, or metadata (lines starting with #)
- Only include sentences with specific facts that directly answer the question
- Output ONLY a JSON array of strings, e.g. ["S2","S5"]

Answer:""".strip()

                try:
                    with Timer("run() — citation extraction LLM call"):
                        raw_cites = llm(citation_prompt, max_tokens=80, temperature=0.0)
                    raw_cites = raw_cites.strip()
                    if raw_cites.startswith("```"):
                        raw_cites = raw_cites.replace("```json", "").replace("```", "").strip()
                    parsed_cites = json.loads(raw_cites)
                    if isinstance(parsed_cites, list):
                        citations = [c for c in parsed_cites if isinstance(c, str)]
                except Exception:
                    logger.warning("Citation extraction failed for streaming path — highlights will be empty")
                    citations = []

            answer = None

        total = time.perf_counter() - pipeline_start
        print(f"[TIMING] PIPELINE RUN TOTAL: {total:.3f}s")
        print(f"{'='*70}\n")

        return {
            "predicted_answer": answer,
            "prompt":           prompt,
            "query_entities":   query_entities,
            "top_chunks":       top_chunks,
            "citations":        citations,
            "evidence_map":     evidence_map,
        }


    def answer(
        self,
        question: str,
        chat_history=None,
        web_search: bool = False,
        retrieved_override=None,
        temperature: float = 0.2,
        chat_id: Optional[str] = None,
        country: Optional[str] = None,
    ):
        """
        Wrapper so the new pipeline behaves like the old RAGPipeline.
        chat_history, web_search and retrieved_override are accepted
        for compatibility with the existing API.
        """
        with Timer("Pipeline.answer() — TOTAL (incl. run + source formatting)"):
            memory_context, route, resolved_query, short_circuit = self._plan(
                question,
                chat_history,
                chat_id,
            )

            if short_circuit is not None:
                return {
                    "answer": short_circuit,
                    "sources": [],
                    "used_source_count": 0,
                    "route": route.category,
                }

            extra = self._session_chunks(resolved_query, chat_id)
            result = self.run(query=resolved_query, extra_chunks=extra)

            citations    = result.get("citations", [])
            evidence_map = result.get("evidence_map", {})

            # Group cited sentences by which chunk they came from.
            cited_by_chunk_idx: Dict[int, List[str]] = {}
            for cid in citations:
                ev = evidence_map.get(cid)
                if not ev:
                    continue
                cited_by_chunk_idx.setdefault(ev["chunk_idx"], []).append(ev["sentence"])

            sources = []

            for chunk_idx, chunk in enumerate(result["top_chunks"]):
                cited_sentences = cited_by_chunk_idx.get(chunk_idx, [])

                spans = []
                for sentence in cited_sentences:
                    span = _locate_span(chunk["chunk_text"], sentence)
                    if span:
                        spans.append({"start": span[0], "end": span[1]})

                sources.append(
                    {
                        "chunk_id": chunk["chunk_id"],
                        "document_id": _doc_id_from_chunk_id(chunk["chunk_id"]),
                        "chunk_text": chunk["chunk_text"],
                        "score": chunk.get("rerank_score", 0),
                        "token_start": 0,
                        "token_end": 0,
                        "evidence": " ".join(cited_sentences),
                        "highlight_spans": spans,
                        # True only if the model actually cited a sentence
                        # from this chunk AND we located it in the text.
                        "used": bool(spans),
                    }
                )

            # Used sources first (in original rerank order), then the rest —
            # the frontend shows "used" by default and hides the rest behind
            # a "View N more sources" toggle instead of us discarding them.
            sources.sort(key=lambda s: (not s["used"],), )

            # Edge case: model returned no (locatable) citations at all —
            # fall back to marking the single top-ranked chunk as "used" so
            # the UI always has at least one highlighted source to show.
            if sources and not any(s["used"] for s in sources):
                sources[0]["used"] = True

            result_out = {
                "answer": result["predicted_answer"],
                "sources": sources,
                "used_source_count": sum(1 for s in sources if s["used"]),
            }
        return result_out
        

    def prepare_for_stream(
        self,
        question: str,
        chat_history=None,
        chat_id: Optional[str] = None,
        country: Optional[str] = None,
        has_document: bool = False,
    ):
        """
        Performs routing + (for domain messages) reference resolution and
        retrieval/reranking exactly like answer(), but stops before
        generation so the caller can stream tokens.

        Returns:
            prompt,
            sources,
            fallback   -> already-finished text for "general"/"out_of_scope"/
                          "clarify" routes, or when retrieval found nothing.
                          Non-None means the caller should NOT stream from
                          the LLM and should just emit this text as-is.
        """

        _memory_context, route, resolved_query, short_circuit = self._plan(
            question,
            chat_history,
            chat_id,
            has_document=has_document,
        )
                
        logger.info("=" * 60)
        logger.info("prepare_for_stream()")
        logger.info("chat_id = %s", chat_id)
        logger.info("has_document = %s", has_document)
        logger.info("question = %s", question)
        logger.info("resolved_query = %s", resolved_query)
        logger.info("=" * 60)

        # If the frontend signals that uploaded documents are present, never
        # short-circuit — always run document retrieval regardless of how the
        # router classified the question (e.g. vague "what is the cgpa" would
        # be classified "general" but should be answered from the uploaded doc).
        # _plan() already returns a cheap sentinel instead of running the LLM
        # for these routes when has_document=True, so this just clears it.
        if has_document and short_circuit is not None:
            short_circuit = None
            resolved_query = question  # use raw question for doc embedding

        if short_circuit is not None:
            return None, [], short_circuit

        # Use the original question as the embedding query when has_document
        # is True — the resolved_query may be stripped/rewritten in ways that
        # hurt similarity against the uploaded doc's chunks.
        session_query = question if has_document else (resolved_query if resolved_query.strip() else question)
        extra_chunks = self._session_chunks(session_query, chat_id)
        
        logger.info(
            "prepare_for_stream(): retrieved %d uploaded chunks",
            len(extra_chunks) if extra_chunks else 0,
        )

        # If the frontend told us a document exists but we got nothing back
        # from the store, return a clear message instead of silently falling
        # through to the corpus index (which knows nothing about the upload).
        if has_document and not extra_chunks:
            logger.warning(
                "prepare_for_stream: has_document=True but _session_chunks "
                "returned empty for chat_id=%r — upload may have failed or "
                "not yet been committed.", chat_id
            )
            return None, [], (
                "I couldn't retrieve your uploaded document. "
                "Please try re-uploading the file and asking again."
            )

        result = self.run(
            query=session_query,
            generate_answer=False,
            extra_chunks=extra_chunks,
        )

        citations = result.get("citations", [])
        evidence_map = result.get("evidence_map", {})

        cited_by_chunk_idx = {}

        for cid in citations:
            ev = evidence_map.get(cid)
            if not ev:
                continue

            cited_by_chunk_idx.setdefault(
                ev["chunk_idx"],
                [],
            ).append(ev["sentence"])

        sources = []

        for chunk_idx, chunk in enumerate(result["top_chunks"]):

            cited_sentences = cited_by_chunk_idx.get(
                chunk_idx,
                [],
            )

            spans = []

            for sentence in cited_sentences:
                span = _locate_span(
                    chunk["chunk_text"],
                    sentence,
                )

                if span:
                    spans.append(
                        {
                            "start": span[0],
                            "end": span[1],
                        }
                    )

            sources.append(
                {
                    "chunk_id": chunk["chunk_id"],
                    "document_id": _doc_id_from_chunk_id(chunk["chunk_id"]),
                    "chunk_text": chunk["chunk_text"],
                    "score": chunk.get("rerank_score", 0),
                    "token_start": 0,
                    "token_end": 0,
                    "evidence": " ".join(cited_sentences),
                    "highlight_spans": spans,
                    "used": bool(spans),
                }
            )

        sources.sort(
            key=lambda s: (not s["used"],)
        )

        if sources and not any(s["used"] for s in sources):
            sources[0]["used"] = True

        if not result["prompt"]:
            return None, sources, result["predicted_answer"]

        return result["prompt"], sources, None



    def _has_uploaded_documents(self, chat_id: Optional[str]) -> bool:
        """Cheap metadata check for whether this chat has any uploads, used
        to tell the router that phrases like "this document" have a real
        referent even with no prior conversation history."""
        if not chat_id or chat_id == "guest":
            return False
        try:
            from app.services import uploaded_document_service
            return bool(uploaded_document_service.list_documents(chat_id))
        except Exception:
            logger.exception("Uploaded-document lookup failed during routing")
            return False

    def _session_chunks(
        self,
        question: str,
        chat_id: Optional[str],
    ) -> Optional[List[Dict[str, Any]]]:
        """Fetch this chat's uploaded-document chunks scored against the
        query embedding, or None when the chat has no uploads."""
        if not chat_id or chat_id == "guest":
            return None
        try:
            from app.services import uploaded_document_service
            
            logger.info("=" * 60)
            logger.info("_session_chunks()")
            logger.info("chat_id = %s", chat_id)
            logger.info("question = %s", question)
            logger.info("=" * 60)            
            
            chunks = uploaded_document_service.retrieve(chat_id, embed(question))
            
            logger.info(
                "_session_chunks(): retrieve() returned %d chunks",
                len(chunks),
            )
            
            if not chunks:
                logger.warning(
                    "_session_chunks: retrieve() returned empty for "
                    "chat_id=%r — no uploaded chunks found in DB.", chat_id
                )
                return None
            logger.info(
                "_session_chunks: %d chunks retrieved for chat_id=%r",
                len(chunks), chat_id,
            )
            return chunks
        except Exception:
            logger.exception("Session-document retrieval failed; continuing without uploads")
            return None

    async def stream_answer(
        self,
        prompt: str,
    ):
        """
        Stream tokens from the LLM asynchronously. This is an async
        generator so iterating it (`async for`) yields control back
        to the FastAPI event loop between tokens instead of blocking
        it — required for multiple users' streams to make progress
        concurrently.
        """
        async for token in llm_client.generate_stream(
            prompt=prompt,
            temperature=0.1,
            max_tokens=3000,
        ):
            yield token


    def generate_chat_title(self, question: str):
        with Timer("Pipeline.generate_chat_title()"):
            prompt = f"""
Generate a short chat title (maximum 5 words).

Question:
{question}

Title:
""".strip()

            result = llm(
                prompt,
                max_tokens=20,
            )
        return result
# ===========================================================
# Global pipeline
# ===========================================================

index = Index()
index.load()

pipeline = Pipeline(index)