"""
PostgreSQL-backed uploaded document store.

Replaces the joblib/in-memory session_document.py implementation.
The public API surface (add_document, list_documents, get_document_text,
get_document_name, retrieve) is identical so callers need only change
their import.

Design:
- add_document       — sync, uses SessionLocal (called via run_in_threadpool)
- list_documents     — sync, uses SessionLocal (called via run_in_threadpool)
- get_document_text  — sync, uses SessionLocal
- get_document_name  — sync, uses SessionLocal
- retrieve           — sync, uses SessionLocal (called via run_in_threadpool
                       or directly inside Pipeline which already runs in a
                       worker thread via run_in_threadpool in the FastAPI layer)

Security: every query that fetches chunks or document metadata filters on
chat_id (which in turn is owned by a single user).  No cross-chat data
leaks are possible at the query level.

No joblib, no _cache, no storage/chat_uploads directory.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.llm_client import EmbeddingClient
from app.core.database import SessionLocal
from app.models.uploaded_chunk import UploadedChunk
from app.models.uploaded_document import UploadedDocument
from app.services.document_service import chunk_text

logger = logging.getLogger(__name__)

_embedder = EmbeddingClient()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _db() -> Session:
    """Return a new synchronous SQLAlchemy session (caller must close it)."""
    return SessionLocal()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def add_document(chat_id: str, name: str, text: str) -> Dict[str, Any]:
    """
    Chunk + embed an uploaded document and persist it for this chat.

    Returns a metadata dict that mirrors the old joblib schema so the
    existing /{chat_id}/documents endpoint response is unchanged.
    """
    text = (text or "").strip()
    if not text:
        raise ValueError("Document contains no extractable text")

    chunks = [c for c in chunk_text(text) if c.strip()]
    if not chunks:
        raise ValueError("Document produced no usable chunks")

    embeddings = _embedder.embed_batch(chunks)

    doc_id = uuid.uuid4()

    def _to_flat_list(emb) -> list:
        """Guarantee a 1-D plain Python float list regardless of whether
        embed_batch returned a list, a 1-D numpy array, or a 2-D array/tensor
        (shape [1, DIM]) that some client implementations produce."""
        arr = np.asarray(emb, dtype=np.float32).reshape(-1)
        return arr.tolist()

    # Namespace chunk_id strings so they remain distinguishable from corpus
    # chunk ids downstream (pipeline._doc_id_from_chunk_id relies on this).
    chunk_records = [
        UploadedChunk(
            id=uuid.uuid4(),
            document_id=doc_id,
            chunk_index=i,
            chunk_text=chunk,
            embedding=_to_flat_list(emb),
            chunk_id=f"upload::{doc_id}_chunk_{i}",
        )
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
    ]

    doc = UploadedDocument(
        id=doc_id,
        chat_id=chat_id,
        filename=name,
        raw_text=text,
        created_at=datetime.now(timezone.utc),
    )

    with _db() as db:
        # No relationship() is declared between UploadedDocument and
        # UploadedChunk (only raw FK columns), so the unit-of-work has no
        # way to infer that chunks depend on the document and may flush
        # them in either order. Flush the parent first so the FK the
        # chunks reference is guaranteed to exist before they're inserted.
        db.add(doc)
        db.flush()
        db.add_all(chunk_records)
        db.commit()
        # Read attributes before the session (and thus this instance) is
        # detached on __exit__ — commit() expires instance state, so any
        # attribute access after the `with` block triggers a lazy refresh
        # against a closed session (DetachedInstanceError).
        created_at = doc.created_at

    logger.info(
        "Chat %s: stored document %s (%s) → %d chunks",
        chat_id, doc_id, name, len(chunk_records),
    )

    return {
        "id": str(doc_id),
        "name": name,
        "chat_id": chat_id,
        "num_chunks": len(chunk_records),
        "created_at": created_at.isoformat(),
    }


def list_documents(chat_id: str) -> List[Dict[str, Any]]:
    """Return metadata for all documents uploaded into this chat."""
    with _db() as db:
        rows = db.execute(
            select(UploadedDocument)
            .where(UploadedDocument.chat_id == chat_id)
            .order_by(UploadedDocument.created_at)
        ).scalars().all()
        
        logger.info(
                "list_documents(%s): returning %d document(s)",
                chat_id,
                len(rows),
            )

    return [
        {
            "id": str(r.id),
            "name": r.filename,
            "chat_id": r.chat_id,
            # num_chunks is reconstructed on the fly; inexpensive for the
            # small per-chat corpora this feature targets.
            "num_chunks": _count_chunks(str(r.id)),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


def get_document_text(doc_id: str) -> Optional[str]:
    """Return the raw text of an uploaded document, or None if not found."""
    with _db() as db:
        row = db.execute(
            select(UploadedDocument.raw_text)
            .where(UploadedDocument.id == doc_id)
        ).scalar_one_or_none()
    return row


def get_document_name(doc_id: str) -> Optional[str]:
    """Return the filename of an uploaded document, or None if not found."""
    with _db() as db:
        row = db.execute(
            select(UploadedDocument.filename)
            .where(UploadedDocument.id == doc_id)
        ).scalar_one_or_none()
    return row


def retrieve(chat_id: str, q_emb, top_k: int = 6) -> List[Dict[str, Any]]:
    """
    Return this chat's uploaded chunks scored against the query embedding.

    Output shape is identical to the old joblib implementation so it can be
    merged directly into the pipeline pool before reranking.

    Security: only chunks whose parent document belongs to `chat_id` are
    ever loaded, enforced at the JOIN level.
    """
    with _db() as db:
        rows = db.execute(
            select(UploadedChunk)
            .join(
                UploadedDocument,
                UploadedChunk.document_id == UploadedDocument.id,
            )
            .where(UploadedDocument.chat_id == chat_id)
        ).scalars().all()

    if not rows:
        logger.warning("retrieve(): no chunks found in DB for chat_id=%r", chat_id)
        return []

    logger.info("retrieve(): found %d chunks for chat_id=%r", len(rows), chat_id)

    # Normalise the query vector.
    # embed() returns a (1, DIM) tensor — detach → numpy → flatten to (DIM,).
    # Guard against nested arrays ([[...]]) from any embedding client variant.
    raw_q = q_emb.detach().cpu().numpy() if hasattr(q_emb, "detach") else np.asarray(q_emb)
    q = raw_q.reshape(-1).astype(np.float32)
    q = q / (np.linalg.norm(q) + 1e-8)

    # Stack stored embeddings.
    # JSON column returns plain Python lists per row. Each embedding may be
    # stored as a flat list [f0, f1, ...] or, if embed_batch returned nested
    # arrays, as [[f0, f1, ...]]. Flatten each row to (DIM,) before stacking.
    def _flat(emb) -> np.ndarray:
        return np.asarray(emb, dtype=np.float32).reshape(-1)

    try:
        mat = np.stack([_flat(r.embedding) for r in rows])  # (N, DIM)
    except ValueError as e:
        logger.error(
            "retrieve(): could not stack chunk embeddings for chat_id=%r — "
            "embedding shape mismatch? error=%s", chat_id, e
        )
        return []

    # Sanity-check dimension alignment before the dot product.
    if mat.shape[1] != q.shape[0]:
        logger.error(
            "retrieve(): embedding dimension mismatch — "
            "stored=%d query=%d for chat_id=%r",
            mat.shape[1], q.shape[0], chat_id,
        )
        return []

    mat = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-8)

    sims = mat @ q
    order = np.argsort(-sims)[:top_k]

    logger.info(
        "retrieve(): top-%d scores for chat_id=%r: %s",
        top_k, chat_id,
        [round(float(sims[int(i)]), 4) for i in order],
    )

    return [
        {
            "chunk_id": rows[int(i)].chunk_id,
            "chunk_text": rows[int(i)].chunk_text,
            "entity_score": 0.0,
            "vector_score": float(sims[int(i)]),
            "combined_score": float(sims[int(i)]),
            "is_adjacent": False,
            "source": "chat_upload",
        }
        for i in order
    ]


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _count_chunks(doc_id: str) -> int:
    with _db() as db:
        rows = db.execute(
            select(UploadedChunk.id)
            .where(UploadedChunk.document_id == doc_id)
        ).all()
    return len(rows)