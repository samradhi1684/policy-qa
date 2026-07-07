"""
build_index.py
==============
Builds a flat retrieval index from triplets_zeroshot.json.

Outputs
-------
Z_chunk_index.joblib      — chunk texts, embeddings, TF-IDF, file/position metadata
Z_entity_index.joblib     — entity→chunk inverted index + entity embeddings
Z_tfidf_data.joblib       — entity-level TF-IDF (for legacy compat if needed)

No knowledge graph, no NetworkX, no ghost nodes.
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections import defaultdict
from typing import Any, Dict, List, Set, Tuple

import joblib
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
INPUT_FILE             = "triplets_zeroshot.json"
OUTPUT_CHUNK_INDEX     = "Z_chunk_index.joblib"
OUTPUT_ENTITY_INDEX    = "Z_entity_index.joblib"
OUTPUT_TFIDF_FILE      = "Z_tfidf_data.joblib"

EMBEDDING_MODEL        = "BAAI/bge-base-en-v1.5"
EMBEDDING_DIM          = 768
BATCH_SIZE             = 128

CHUNK_TFIDF_MAX_FEAT   = 20_000
CHUNK_TFIDF_NGRAM      = (1, 2)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("build_index.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Embedding model
# ---------------------------------------------------------------------------
logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
_model = SentenceTransformer(EMBEDDING_MODEL)
_model.max_seq_length = 512


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def encode_batch(texts: List[str]) -> np.ndarray:
    """Encode a list of texts → (N, DIM) float32 array."""
    if not texts:
        return np.empty((0, EMBEDDING_DIM), dtype=np.float32)
    return _model.encode(
        texts,
        batch_size=BATCH_SIZE,
        show_progress_bar=False,
        normalize_embeddings=False,
        convert_to_numpy=True,
    ).astype(np.float32)


def _chunk_num(chunk_id: str) -> int:
    """Extract trailing integer from IDs like 'doc_abc_chunk_7'."""
    m = re.search(r"_chunk_(\d+)$", chunk_id)
    return int(m.group(1)) if m else 0


# ---------------------------------------------------------------------------
# Step 1: Parse records
# ---------------------------------------------------------------------------

def parse_records(records: List[Dict]) -> Tuple[
    List[Dict],            # chunk_records: {chunk_id, file_id, chunk_text, chunk_number}
    Dict[str, Set[str]],   # chunk_id → set of normalised entity strings
    Dict[str, List[str]],  # entity_string → [triplet_str, ...] (for TF-IDF)
]:
    first = records[0] if records else {}
    is_chunked = "triplets" in first and isinstance(first["triplets"], list)
    logger.info(f"Format: {'chunked' if is_chunked else 'flat'}")

    chunk_meta: Dict[str, Dict] = {}          # chunk_id → {file_id, chunk_text}
    chunk_entities: Dict[str, Set[str]] = defaultdict(set)
    entity_triplets: Dict[str, List[str]] = defaultdict(list)

    if is_chunked:
        file_chunk_order: Dict[str, List[str]] = defaultdict(list)

        for rec in tqdm(records, desc="Parsing"):
            cid  = rec.get("chunk_id",   "unknown")
            fid  = rec.get("file_id",    "unknown")
            text = rec.get("chunk_text", "").strip()

            if text and cid not in chunk_meta:
                chunk_meta[cid] = {"file_id": fid, "chunk_text": text}
                file_chunk_order[fid].append(cid)

            for t in rec.get("triplets", []):
                subj = t["subject"].strip()
                obj  = t["object"].strip()
                pred = t["predicate"].strip()

                # Store normalised for lookup, raw for display
                chunk_entities[cid].add(subj.lower())
                chunk_entities[cid].add(obj.lower())

                trip_str = f"{subj} {pred} {obj}"
                entity_triplets[subj].append(trip_str)
                entity_triplets[obj].append(trip_str)

        # Assign stable position within each file
        chunk_number_map: Dict[str, int] = {}
        for fid, cids in file_chunk_order.items():
            for pos, cid in enumerate(sorted(cids, key=_chunk_num)):
                chunk_number_map[cid] = pos

        chunk_records = [
            {
                "chunk_id":     cid,
                "file_id":      v["file_id"],
                "chunk_text":   v["chunk_text"],
                "chunk_number": chunk_number_map.get(cid, 0),
            }
            for cid, v in chunk_meta.items()
        ]

    else:
        # Flat format: one triplet per record, file_id is the chunk key
        file_texts: Dict[str, str] = {}
        for t in tqdm(records, desc="Parsing (flat)"):
            subj = t["subject"].strip()
            obj  = t["object"].strip()
            pred = t["predicate"].strip()
            fid  = t.get("file_id", "unknown")

            chunk_entities[fid].add(subj.lower())
            chunk_entities[fid].add(obj.lower())

            trip_str = f"{subj} {pred} {obj}"
            entity_triplets[subj].append(trip_str)
            entity_triplets[obj].append(trip_str)
            file_texts.setdefault(fid, "")

        chunk_records = [
            {"chunk_id": fid, "file_id": fid, "chunk_text": "", "chunk_number": 0}
            for fid in file_texts
        ]

    logger.info(
        f"Parsed {len(chunk_records):,} chunks, "
        f"{len(chunk_entities):,} chunks with entities, "
        f"{len(entity_triplets):,} unique entities"
    )
    return chunk_records, chunk_entities, entity_triplets


# ---------------------------------------------------------------------------
# Step 2: Build chunk index
# ---------------------------------------------------------------------------

def build_chunk_index(chunk_records: List[Dict]) -> Dict[str, Any]:
    """Dense embeddings + TF-IDF for every chunk."""
    texts     = [r["chunk_text"] for r in chunk_records]
    chunk_ids = [r["chunk_id"]   for r in chunk_records]
    file_ids  = [r["file_id"]    for r in chunk_records]
    positions = [r["chunk_number"] for r in chunk_records]

    logger.info(f"Embedding {len(texts):,} chunks …")
    all_embs: List[np.ndarray] = []
    for i in tqdm(range(0, len(texts), BATCH_SIZE), desc="Chunk embeddings"):
        all_embs.append(encode_batch(texts[i : i + BATCH_SIZE]))
    chunk_embeddings = np.vstack(all_embs) if all_embs else np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    logger.info("Building chunk TF-IDF …")
    tfidf_vec = TfidfVectorizer(
        stop_words="english",
        max_features=CHUNK_TFIDF_MAX_FEAT,
        ngram_range=CHUNK_TFIDF_NGRAM,
        sublinear_tf=True,
    )
    tfidf_matrix = tfidf_vec.fit_transform(texts) if texts else None

    # File-level navigation maps (for adjacent expansion)
    file_to_chunks: Dict[str, List[str]] = defaultdict(list)
    for cid, fid, pos in zip(chunk_ids, file_ids, positions):
        file_to_chunks[fid].append((pos, cid))
    # Sort by position, keep only ids
    file_to_ordered_chunks: Dict[str, List[str]] = {
        fid: [cid for _, cid in sorted(pairs)]
        for fid, pairs in file_to_chunks.items()
    }

    chunk_id_to_file: Dict[str, str] = dict(zip(chunk_ids, file_ids))
    chunk_id_to_pos:  Dict[str, int] = dict(zip(chunk_ids, positions))

    logger.info(
        f"Chunk index: {chunk_embeddings.shape}, "
        f"TF-IDF: {tfidf_matrix.shape if tfidf_matrix is not None else 'none'}"
    )
    return {
        "chunk_ids":              chunk_ids,
        "file_ids":               file_ids,
        "chunk_texts":            texts,
        "chunk_numbers":          positions,
        "chunk_embeddings":       chunk_embeddings,
        "chunk_tfidf_vectorizer": tfidf_vec,
        "chunk_tfidf_matrix":     tfidf_matrix,
        # Navigation
        "file_to_ordered_chunks": file_to_ordered_chunks,
        "chunk_id_to_file":       chunk_id_to_file,
        "chunk_id_to_pos":        chunk_id_to_pos,
    }


# ---------------------------------------------------------------------------
# Step 3: Build entity index
# ---------------------------------------------------------------------------

def build_entity_index(
    chunk_entities: Dict[str, Set[str]],
    entity_triplets: Dict[str, List[str]],
) -> Dict[str, Any]:
    """
    Inverted index: normalised_entity → {chunk_ids}
    Entity embeddings: embed the raw (non-lowered) entity surface form once.
    """
    # Collect unique entities (raw casing, for embedding quality)
    raw_entity_set: Set[str] = set()
    for trips in entity_triplets:
        raw_entity_set.add(trips)          # key is already the entity string

    # Build inverted index
    entity_to_chunks: Dict[str, Set[str]] = defaultdict(set)
    for cid, ents in chunk_entities.items():
        for ent in ents:
            entity_to_chunks[ent].add(cid)

    # Embed every unique entity (use raw casing for better embedding)
    entity_list = list(entity_triplets.keys())
    logger.info(f"Embedding {len(entity_list):,} unique entities …")
    all_embs: List[np.ndarray] = []
    for i in tqdm(range(0, len(entity_list), BATCH_SIZE), desc="Entity embeddings"):
        all_embs.append(encode_batch(entity_list[i : i + BATCH_SIZE]))
    entity_embeddings = np.vstack(all_embs) if all_embs else np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    # Entity-level TF-IDF (entity name × 3 + its triplets as document)
    logger.info("Building entity TF-IDF …")
    docs = [
        ((e + " ") * 3) + " ".join(entity_triplets.get(e, []))
        for e in entity_list
    ]
    ent_tfidf_vec = TfidfVectorizer(
        stop_words="english",
        max_features=15_000,
        ngram_range=(1, 2),
        sublinear_tf=True,
        min_df=2,
    )
    ent_tfidf_matrix = ent_tfidf_vec.fit_transform(docs) if docs else None

    logger.info(
        f"Entity index: {len(entity_to_chunks):,} entity keys, "
        f"embeddings: {entity_embeddings.shape}"
    )
    return {
        "entity_list":        entity_list,
        "entity_embeddings":  entity_embeddings,
        "entity_to_chunks":   {k: list(v) for k, v in entity_to_chunks.items()},
        "ent_tfidf_vec":      ent_tfidf_vec,
        "ent_tfidf_matrix":   ent_tfidf_matrix,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    logger.info("=" * 70)
    logger.info("Index Builder  —  flat chunk + entity index (no KG)")
    logger.info(f"Model : {EMBEDDING_MODEL}  |  batch: {BATCH_SIZE}")
    logger.info("=" * 70)

    if not os.path.exists(INPUT_FILE):
        logger.error(f"Input not found: {INPUT_FILE}")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        records = json.load(f)
    logger.info(f"Loaded {len(records):,} records")

    chunk_records, chunk_entities, entity_triplets = parse_records(records)

    chunk_index  = build_chunk_index(chunk_records)
    entity_index = build_entity_index(chunk_entities, entity_triplets)

    # Legacy-compat TF-IDF file (entity vectorizer + matrix)
    tfidf_compat = {
        "vectorizer":   entity_index["ent_tfidf_vec"],
        "tfidf_matrix": entity_index["ent_tfidf_matrix"],
        "entity_list":  entity_index["entity_list"],
    }

    logger.info("Saving …")
    joblib.dump(chunk_index,  OUTPUT_CHUNK_INDEX,  compress=3)
    logger.info(f"  → {OUTPUT_CHUNK_INDEX}")
    joblib.dump(entity_index, OUTPUT_ENTITY_INDEX, compress=3)
    logger.info(f"  → {OUTPUT_ENTITY_INDEX}")
    joblib.dump(tfidf_compat, OUTPUT_TFIDF_FILE,   compress=3)
    logger.info(f"  → {OUTPUT_TFIDF_FILE}")

    # Stats
    logger.info("=" * 70)
    logger.info(f"Chunks          : {len(chunk_records):,}")
    logger.info(f"Unique entities : {len(entity_index['entity_list']):,}")
    logger.info(f"Entity→chunk keys: {len(entity_index['entity_to_chunks']):,}")
    emb = chunk_index["chunk_embeddings"]
    logger.info(f"Chunk emb shape : {emb.shape}")
    logger.info("=" * 70)
    logger.info("Done.")


if __name__ == "__main__":
    main()