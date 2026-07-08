"""
Per-chat uploaded document store.

Documents uploaded into a chat are chunked, embedded with the same
embedding model as the main index (bge-base-en-v1.5 via EmbeddingClient),
persisted to disk, and merged into the retrieval pool at query time so
they participate in retrieval alongside the pre-built corpus without
touching the main joblib indices.

Design notes:
- Chunk ids are namespaced "upload::{doc_id}_chunk_{n}" so they can never
  collide with corpus chunk ids and are easy to recognise downstream.
- Embeddings are stored as plain lists (JSON-safe) and normalised at load;
  per-chat corpora are small (a handful of documents), so brute-force
  cosine against the query embedding is more than fast enough.
- Persistence is one joblib file per chat under storage/chat_uploads/,
  so restarts don't lose session documents.
"""

from __future__ import annotations

import logging
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np

from app.adapters.llm_client import EmbeddingClient
from app.services.document_service import chunk_text

logger = logging.getLogger(__name__)

STORAGE_DIR = Path("storage") / "chat_uploads"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

_embedder = EmbeddingClient()
_lock = threading.Lock()

# chat_id -> {"documents": {doc_id: meta}, "chunks": [chunk dicts w/ emb]}
_cache: Dict[str, Dict[str, Any]] = {}


def _safe_chat_key(chat_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", chat_id)


def _path_for(chat_id: str) -> Path:
    return STORAGE_DIR / f"{_safe_chat_key(chat_id)}.joblib"


def _load(chat_id: str) -> Dict[str, Any]:
    if chat_id in _cache:
        return _cache[chat_id]

    path = _path_for(chat_id)
    if path.exists():
        try:
            data = joblib.load(path)
        except Exception:
            logger.exception("Failed to load chat uploads for %s", chat_id)
            data = {"documents": {}, "chunks": []}
    else:
        data = {"documents": {}, "chunks": []}

    _cache[chat_id] = data
    return data


def _save(chat_id: str) -> None:
    joblib.dump(_cache[chat_id], _path_for(chat_id))


def add_document(chat_id: str, name: str, text: str) -> Dict[str, Any]:
    """Chunk + embed an uploaded document and persist it for this chat."""
    text = (text or "").strip()
    if not text:
        raise ValueError("Document contains no extractable text")

    doc_id = f"upload-{uuid.uuid4().hex[:10]}"
    chunks = [c for c in chunk_text(text) if c.strip()]

    embeddings = _embedder.embed_batch(chunks)

    chunk_records: List[Dict[str, Any]] = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        chunk_records.append(
            {
                "chunk_id": f"upload::{doc_id}_chunk_{i}",
                "document_id": doc_id,
                "chunk_text": chunk,
                "embedding": emb,
            }
        )

    meta = {
        "id": doc_id,
        "name": name,
        "chat_id": chat_id,
        "num_chunks": len(chunk_records),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    with _lock:
        data = _load(chat_id)
        data["documents"][doc_id] = meta
        data["chunks"].extend(chunk_records)
        # Store the full text so the document viewer can render it.
        data.setdefault("texts", {})[doc_id] = text
        _save(chat_id)

    logger.info(
        "Chat %s: uploaded document %s (%s) -> %d chunks",
        chat_id, doc_id, name, len(chunk_records),
    )
    return meta


def list_documents(chat_id: str) -> List[Dict[str, Any]]:
    return list(_load(chat_id)["documents"].values())


def get_document_text(doc_id: str) -> Optional[str]:
    """Look up the raw text for an uploaded document across cached and
    persisted chats (doc ids are globally unique)."""
    for data in _cache.values():
        text = data.get("texts", {}).get(doc_id)
        if text is not None:
            return text

    for path in STORAGE_DIR.glob("*.joblib"):
        try:
            data = joblib.load(path)
        except Exception:
            continue
        text = data.get("texts", {}).get(doc_id)
        if text is not None:
            return text

    return None


def get_document_name(doc_id: str) -> Optional[str]:
    for data in _cache.values():
        meta = data.get("documents", {}).get(doc_id)
        if meta:
            return meta.get("name")
    for path in STORAGE_DIR.glob("*.joblib"):
        try:
            data = joblib.load(path)
        except Exception:
            continue
        meta = data.get("documents", {}).get(doc_id)
        if meta:
            return meta.get("name")
    return None


def retrieve(chat_id: str, q_emb, top_k: int = 6) -> List[Dict[str, Any]]:
    """Return this chat's uploaded chunks scored against the query
    embedding, shaped exactly like ChunkRetriever pool entries so they
    can be merged into the pipeline pool before reranking."""
    data = _load(chat_id)
    chunks = data["chunks"]
    if not chunks:
        return []

    q = np.asarray(
        q_emb.detach().cpu().numpy() if hasattr(q_emb, "detach") else q_emb,
        dtype=np.float32,
    ).reshape(-1)
    q = q / (np.linalg.norm(q) + 1e-8)

    mat = np.asarray([c["embedding"] for c in chunks], dtype=np.float32)
    mat = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-8)

    sims = mat @ q
    order = np.argsort(-sims)[:top_k]

    results = []
    for i in order:
        c = chunks[int(i)]
        results.append(
            {
                "chunk_id": c["chunk_id"],
                "chunk_text": c["chunk_text"],
                "entity_score": 0.0,
                "vector_score": float(sims[int(i)]),
                "combined_score": float(sims[int(i)]),
                "is_adjacent": False,
                "source": "chat_upload",
            }
        )
    return results
