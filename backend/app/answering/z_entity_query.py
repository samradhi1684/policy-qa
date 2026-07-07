from __future__ import annotations

import csv
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple

import joblib
import numpy as np
import torch
from openai import OpenAI
from sentence_transformers import CrossEncoder, SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
INPUT_QA_FILE        = "train_data_150_stratified.json"
OUTPUT_RESULT_FILE   = "Z_retrieval_results_1.json"
ANSWERS_MD_FILE      = "Z_answers_1.md"
INPUT_CHUNK_INDEX    = "Z_chunk_index.joblib"
INPUT_ENTITY_INDEX   = "Z_entity_index.joblib"
INPUT_TFIDF_FILE     = "Z_tfidf_data.joblib"   # legacy-compat entity TF-IDF; used as fallback

# ---------------------------------------------------------------------------
# Tuning
# ---------------------------------------------------------------------------
PROCESS_FIRST_N          = 1000
MAX_QUERY_ENTITIES       = 5
TOP_K_SEMANTIC           = 50    # semantic pool size
ADJACENT_WINDOW          = 1     # ±N chunks around every matched chunk
TOP_K_AFTER_RERANK       = 10    # final chunks sent to LLM
ENTITY_EMB_CANDIDATES    = 30    # nearest entity-embedding neighbours to map
ENTITY_BM25_TOP_K        = 3     # nearest entities per query entity via TF-IDF

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
EMBEDDING_MODEL      = "BAAI/bge-base-en-v1.5"
CROSSENCODER_MODEL   = "BAAI/bge-reranker-v2-m3"
LLM_MODEL            = "gpt-4o-mini"

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info(f"Device: {device}")

logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
_embed_model = SentenceTransformer(EMBEDDING_MODEL)
_embed_model.max_seq_length = 512

logger.info(f"Loading cross-encoder: {CROSSENCODER_MODEL}")
_cross_encoder = CrossEncoder(CROSSENCODER_MODEL, device=str(device))

_openai = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------

def llm(prompt: str, max_tokens: int = 512, temperature: float = 0.0) -> str:
    resp = _openai.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content.strip()


# ---------------------------------------------------------------------------
# Embedding helper
# ---------------------------------------------------------------------------

def embed(text: str) -> torch.Tensor:
    """Return a normalised (1, DIM) float32 tensor on device."""
    v = torch.tensor(
        _embed_model.encode(text, normalize_embeddings=False, convert_to_numpy=True),
        dtype=torch.float32, device=device,
    )
    return (v / (v.norm() + 1e-8)).unsqueeze(0)


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

        # Entity lexical (TF-IDF / BM25-style) data
        # ent_tfidf_vec transforms raw text → sparse (1, V) vector.
        # ent_tfidf_matrix rows are aligned 1:1 with self.entity_list (and
        # with self.entity_emb rows) — row i always refers to entity_list[i].
        self.ent_tfidf_vec    = None
        self.ent_tfidf_matrix = None

    def load(self):
        self._load_chunks()
        self._load_entities()
        logger.info("Index ready.")

    def _load_chunks(self):
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

        # --- Entity TF-IDF (BM25-style lexical matching) ---
        # Prefer the copy bundled inside the entity index itself; fall back
        # to the standalone legacy-compat file if the entity index predates
        # that change.
        if "ent_tfidf_vec" in d and "ent_tfidf_matrix" in d and d["ent_tfidf_matrix"] is not None:
            self.ent_tfidf_vec    = d["ent_tfidf_vec"]
            self.ent_tfidf_matrix = d["ent_tfidf_matrix"]
            logger.info(f"Entity TF-IDF loaded from entity index: {self.ent_tfidf_matrix.shape}")
        elif os.path.exists(INPUT_TFIDF_FILE):
            td = joblib.load(INPUT_TFIDF_FILE)
            self.ent_tfidf_vec    = td.get("vectorizer")
            self.ent_tfidf_matrix = td.get("tfidf_matrix")
            tfidf_entity_list     = td.get("entity_list")
            if tfidf_entity_list is not None and tfidf_entity_list != self.entity_list:
                logger.warning(
                    "entity_list order in Z_tfidf_data.joblib does not match "
                    "entity_list in the entity index — entity BM25 matching "
                    "may be misaligned. Rebuild the index to fix this."
                )
            if self.ent_tfidf_matrix is not None:
                logger.info(f"Entity TF-IDF loaded from legacy file: {self.ent_tfidf_matrix.shape}")
        else:
            logger.warning("No entity TF-IDF data found — BM25 entity matching disabled")


# ===========================================================================
# Query entity extractor
# ===========================================================================

class EntityExtractor:
    def extract(self, query: str) -> List[str]:
        prompt = f"""Extract the {MAX_QUERY_ENTITIES} most important entities or concepts needed to answer the question below.

Include: named programs/policies/regulations, documents/plans/forms, processes/procedures/deadlines, organisations/agencies/roles, specific technical/domain terms.
Exclude: filler phrases, generic words like "information"/"details", vague qualifiers.

Output ONLY entities, one per line, no numbering or punctuation.

Question:
{query}""".strip()

        try:
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
            return result
        except Exception as ex:
            logger.warning(f"Entity extraction failed: {ex}")
            return re.findall(r'\b[A-Z][a-zA-Z]{3,}(?:\s+[A-Z][a-zA-Z]{3,})*\b', query)[:3]


# ===========================================================================
# Chunk retriever
# ===========================================================================

class ChunkRetriever:
    """
    Builds a candidate pool from two signals, then expands with neighbours.

    Signal A — entity pool (three sub-signals, merged by max per chunk)
      1. Exact match in entity_to_chunks inverted index (count-based score)
      2. Top-ENTITY_BM25_TOP_K nearest entities per query entity via TF-IDF
         cosine similarity over entity_name×3 + triplet text → their chunks
      3. Top-ENTITY_EMB_CANDIDATES nearest entities by dense embedding → their chunks

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

        scores: Dict[str, Dict[str, float]] = {}

        self._entity_pool(query_entities, q_emb, scores)
        self._semantic_pool(q_emb, scores)

        # Fuse & sort
        candidates = self._fuse(scores)
        candidates.sort(key=lambda x: x["combined_score"], reverse=True)

        # Adjacent expansion on the entire pool
        expanded = self._expand(candidates)

        # Attach text
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
    def _bm25_entity_match(self, query_entities: List[str]) -> Dict[str, float]:
        """
        For each query entity, find the top-ENTITY_BM25_TOP_K nearest
        entities in the index by TF-IDF cosine similarity (lexical match
        over entity_name×3 + associated triplet text), then map those
        entities to their chunks via entity_to_chunks.

        Returns chunk_id → best TF-IDF cosine score across all query entities.
        """
        hit: Dict[str, float] = {}
        if self.idx.ent_tfidf_vec is None or self.idx.ent_tfidf_matrix is None:
            return hit

        for ent in query_entities:
            ent = ent.strip()
            if not ent:
                continue
            try:
                q_vec = self.idx.ent_tfidf_vec.transform([ent])  # (1, V) sparse
            except Exception as ex:
                logger.warning(f"TF-IDF transform failed for entity '{ent}': {ex}")
                continue

            if q_vec.nnz == 0:
                # Query entity shares no vocabulary with the fitted TF-IDF
                # vocabulary (e.g. purely out-of-vocabulary terms) — skip.
                continue

            sims = cosine_similarity(q_vec, self.idx.ent_tfidf_matrix).ravel()  # (M,)
            k = min(ENTITY_BM25_TOP_K, sims.shape[0])
            if k == 0:
                continue
            top_idxs = np.argpartition(-sims, k - 1)[:k]
            top_idxs = top_idxs[np.argsort(-sims[top_idxs])]

            for i in top_idxs:
                sc = float(sims[i])
                if sc <= 0:
                    continue
                ent_str = self.idx.entity_list[i].lower()
                for cid in self.idx.entity_to_chunks.get(ent_str, []):
                    hit[cid] = max(hit.get(cid, 0.0), sc)

        return hit

    # ------------------------------------------------------------------
    def _entity_pool(
        self,
        query_entities: List[str],
        q_emb: torch.Tensor,
        scores: Dict[str, Dict[str, float]],
    ):
        """Exact match + BM25/TF-IDF lexical match + embedding-nearest entities."""
        hit_count: Dict[str, float] = {}

        # --- exact match ---
        for ent in query_entities:
            key = ent.lower().strip()
            matched: Set[str] = set(self.idx.entity_to_chunks.get(key, []))
            for cid in matched:
                hit_count[cid] = hit_count.get(cid, 0.0) + 1.0

        for cid, sc in hit_count.items():
            s = scores.setdefault(cid, {"entity": 0.0, "vector": 0.0})
            s["entity"] = sc
            s.setdefault("source", "entity_exact")

        logger.info(f"Exact entity match: {len(hit_count)} chunks")

        # --- BM25/TF-IDF lexical match (replaces old substring-scan fallback) ---
        bm25_hit = self._bm25_entity_match(query_entities)
        for cid, sc in bm25_hit.items():
            s = scores.setdefault(cid, {"entity": 0.0, "vector": 0.0})
            s["entity"] = max(s["entity"], sc)
            if "source" not in s:
                s["source"] = "entity_bm25"
            elif "bm25" not in s["source"]:
                s["source"] = s["source"] + "+bm25"

        logger.info(f"BM25 entity match: {len(bm25_hit)} chunks")

        # --- embedding-nearest entities → their chunks ---
        if self.idx.entity_emb is None:
            return

        k = min(ENTITY_EMB_CANDIDATES, len(self.idx.entity_list))
        with torch.no_grad():
            sims = torch.mm(q_emb, self.idx.entity_emb.T).squeeze(0)
        top_scores, top_idxs = torch.topk(sims, k=k)

        emb_hit: Dict[str, float] = {}
        for sc_t, idx_t in zip(top_scores, top_idxs):
            ent = self.idx.entity_list[idx_t.item()].lower()
            escore = float(sc_t.item())
            for cid in self.idx.entity_to_chunks.get(ent, []):
                emb_hit[cid] = max(emb_hit.get(cid, 0.0), escore * 0.5)

        for cid, sc in emb_hit.items():
            s = scores.setdefault(cid, {"entity": 0.0, "vector": 0.0})
            s["entity"] = max(s["entity"], sc)
            if "source" not in s:
                s["source"] = "entity_emb"
            elif "emb" not in s["source"]:
                s["source"] = s["source"] + "+emb"

        logger.info(f"Entity-emb match: {len(emb_hit)} chunks")

    # ------------------------------------------------------------------
    def _semantic_pool(
        self,
        q_emb: torch.Tensor,
        scores: Dict[str, Dict[str, float]],
    ):
        """Top-K chunks by cosine similarity."""
        if self.idx.chunk_emb is None:
            return
        k = min(TOP_K_SEMANTIC, len(self.idx.chunk_ids))
        with torch.no_grad():
            sims = torch.mm(q_emb, self.idx.chunk_emb.T).squeeze(0)
        top_scores, top_idxs = torch.topk(sims, k=k)

        for sc_t, idx_t in zip(top_scores, top_idxs):
            cid = self.idx.chunk_ids[idx_t.item()]
            vscore = float(sc_t.item())
            s = scores.setdefault(cid, {"entity": 0.0, "vector": 0.0})
            s["vector"] = max(s.get("vector", 0.0), vscore)
            if "source" not in s:
                s["source"] = "vector"
            elif "vector" not in s["source"]:
                s["source"] = s["source"] + "+vector"

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

class Reranker:
    def rerank(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        top_k: int = TOP_K_AFTER_RERANK,
    ) -> List[Dict[str, Any]]:
        if not chunks:
            return []

        pairs = [[query, c["chunk_text"]] for c in chunks]
        try:
            ce_scores = _cross_encoder.predict(pairs)
        except Exception as e:
            logger.error(f"Cross-encoder failed: {e}; using combined_score fallback")
            for c in chunks:
                c["rerank_score"] = c["combined_score"]
            return sorted(chunks, key=lambda x: x["rerank_score"], reverse=True)[:top_k]

        ranked = sorted(
            [{**c, "rerank_score": float(sc)} for c, sc in zip(chunks, ce_scores)],
            key=lambda x: x["rerank_score"],
            reverse=True,
        )[:top_k]

        logger.info(
            f"Reranker: {len(chunks)} → {len(ranked)}  "
            f"scores: {[round(c['rerank_score'], 3) for c in ranked]}"
        )
        return ranked


# ===========================================================================
# Answer generator
# ===========================================================================

class AnswerGenerator:

    @staticmethod
    def _build_context(chunks: List[Dict[str, Any]]) -> str:
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
        return "\n\n".join(blocks)

    def generate(
        self,
        query: str,
        top_chunks: List[Dict[str, Any]],
        question_type: str = "Descriptive",
        conditions: str = "N/A",
    ) -> Tuple[str, str]:
        is_yes_no = question_type.lower().startswith("yes")
        context   = self._build_context(top_chunks)

        if not context:
            return ("No — No relevant information found." if is_yes_no
                    else "No relevant information found."), ""

        cond_block = (
            f"\nConditions:\n{conditions}\n"
            if is_yes_no and conditions and conditions != "N/A" else ""
        )

        if is_yes_no:
            prompt = f"""Answer the yes/no question using ONLY the information below.

Question:
{query}
{cond_block}
--- Supporting Text ---
{context}

Respond ONLY as "Yes — <one-sentence reason>" or "No — <one-sentence reason>".
If evidence is absent: No — No explicit supporting evidence found.

Output:""".strip()
        else:
            prompt = f"""Answer using ONLY the context below.

Question:
{query}

--- Supporting Text ---
{context}

Direct, factual answer (1-5 sentences). Do not speculate or mention sources.

Answer:""".strip()

        try:
            max_tok = 300 if is_yes_no else 3000
            raw = llm(prompt, max_tokens=max_tok)

            if is_yes_no:
                m = re.match(
                    r"^(Yes|No)\s*(?:—|–|--|-)?\s*(.+)$",
                    raw, re.IGNORECASE | re.DOTALL,
                )
                answer = (
                    f"{m.group(1).capitalize()} — {m.group(2).strip()}" if m
                    else "No — No explicit supporting evidence found."
                )
            else:
                answer = raw

            logger.info(f"Answer: {answer[:120]}")
            return answer, prompt

        except Exception as e:
            logger.error(f"Answer generation failed: {e}")
            return (
                "No — Error during generation" if is_yes_no
                else "Unable to generate answer.",
                "",
            )


# ===========================================================================
# Pipeline
# ===========================================================================

class Pipeline:
    def __init__(self, index: Index):
        self.extractor  = EntityExtractor()
        self.retriever  = ChunkRetriever(index)
        self.reranker   = Reranker()
        self.generator  = AnswerGenerator()

    def run(
        self,
        query: str,
        question_type: str = "Descriptive",
        conditions: str = "N/A",
    ) -> Dict[str, Any]:
        logger.info(f"\n{'='*70}\nQUERY: {query}\n{'='*70}")

        q_emb = embed(query)

        # 1. Extract query entities
        query_entities = self.extractor.extract(query)

        # 2. Build candidate pool (entity + semantic, then adjacent expand)
        pool = self.retriever.retrieve(query, query_entities, q_emb)

        if not pool:
            is_yn = question_type.lower().startswith("yes")
            return {
                "predicted_answer": "No — No relevant information found." if is_yn
                                    else "No relevant information found.",
                "prompt":           "",
                "query_entities":   query_entities,
                "top_chunks":       [],
            }

        # 3. Rerank
        top_chunks = self.reranker.rerank(query, pool)

        # 4. Generate answer
        answer, prompt = self.generator.generate(
            query, top_chunks, question_type, conditions
        )

        return {
            "predicted_answer": answer,
            "prompt":           prompt,
            "query_entities":   query_entities,
            "top_chunks":       top_chunks,
        }


# ===========================================================================
# Markdown report
# ===========================================================================

def _md_entry(idx: int, item: Dict, result: Dict) -> List[str]:
    lines = [
        f"\n## Question {idx}: {item['question']}\n",
        "### Ground truth", item["answer"].strip() + "\n",
        "### Retrieved answer", result["predicted_answer"].strip() + "\n",
        "### Prompt", result["prompt"] or "(none)", "\n---\n",
        "### Query entities",
    ]
    for e in result["query_entities"] or ["(none)"]:
        lines.append(f"- {e}")
    lines.append(f"\n### Top chunks ({len(result['top_chunks'])})")
    for c in result["top_chunks"]:
        adj = "  [ADJ]" if c.get("is_adjacent") else ""
        lines.append(
            f"- {c['chunk_id']}  "
            f"entity={c.get('entity_score', 0):.3f}  "
            f"vector={c.get('vector_score', 0):.3f}  "
            f"rerank={c.get('rerank_score', 0):.4f}  "
            f"src={c.get('source', '')}{adj}"
        )
    lines.append("\n---\n")
    return lines


# ===========================================================================
# Entry point
# ===========================================================================

if __name__ == "__main__":
    logger.info("=" * 70)
    logger.info("GraphRAG Retrieval  —  entity (exact + BM25 + semantic) + chunk semantic pool, adjacent expand")
    logger.info(f"Embedding : {EMBEDDING_MODEL}")
    logger.info(f"Reranker  : {CROSSENCODER_MODEL}")
    logger.info(f"Semantic K: {TOP_K_SEMANTIC}  |  Final K: {TOP_K_AFTER_RERANK}")
    logger.info(f"Adj window: ±{ADJACENT_WINDOW}")
    logger.info("=" * 70)

    # Load index
    index = Index()
    index.load()

    # Load QA data
    if not os.path.exists(INPUT_QA_FILE):
        logger.error(f"QA file not found: {INPUT_QA_FILE}")
        exit(1)
    with open(INPUT_QA_FILE, "r", encoding="utf-8") as f:
        qa_data = json.load(f)
    logger.info(f"Loaded {len(qa_data):,} questions")

    pipeline = Pipeline(index)
    items = qa_data[:PROCESS_FIRST_N] if PROCESS_FIRST_N else qa_data

    results:     List[Dict] = []
    md_lines:    List[str]  = ["# Retrieval Report\n"]
    csv_rows:    List[Dict] = []

    for i, item in enumerate(items, start=1):
        query   = item["question"]
        qtype   = item.get("question_type", "Descriptive")
        conds   = item.get("conditions",    "N/A")
        qid     = item.get("document_id",   i)

        res = pipeline.run(query=query, question_type=qtype, conditions=conds)

        results.append({
            "question_id":      qid,
            "question":         query,
            "ground_truth":     item["answer"],
            "predicted_answer": res["predicted_answer"],
            "question_type":    qtype,
            "conditions":       conds,
        })

        md_lines.extend(_md_entry(i, item, res))

        for rank, c in enumerate(res["top_chunks"], 1):
            csv_rows.append({
                "question_id":   qid,
                "question_index": i,
                "question":      query,
                "rank":          rank,
                "chunk_id":      c["chunk_id"],
                "rerank_score":  c.get("rerank_score", 0.0),
                "entity_score":  c.get("entity_score", 0.0),
                "vector_score":  c.get("vector_score", 0.0),
                "is_adjacent":   c.get("is_adjacent", False),
                "source":        c.get("source", ""),
            })

    # Save results
    with open(OUTPUT_RESULT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    logger.info(f"Results → {OUTPUT_RESULT_FILE}")

    with open("retrieval_scores.csv", "w", newline="", encoding="utf-8") as f:
        fields = ["question_id","question_index","question","rank","chunk_id",
                  "rerank_score","entity_score","vector_score","is_adjacent","source"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(sorted(csv_rows, key=lambda x: (x["question_index"], x["rank"])))
    logger.info("Scores → retrieval_scores.csv")

    with open(ANSWERS_MD_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))
    logger.info(f"Report → {ANSWERS_MD_FILE}")

    logger.info("Done.")