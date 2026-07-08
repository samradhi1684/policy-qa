"""
Step 6 — retrieval consolidation.

Before this file: /query and /{chat_id}/query (RAGPipeline) used
adapters/retriever.py — a brute-force numpy cosine-similarity search over
storage/embeddings.npy + storage/chunks.json, no entity matching, no
reranking. /{chat_id}/query/stream (new_pipeline.Pipeline) used a
completely separate hybrid engine — entity-pool + semantic-pool fusion,
adjacent-chunk expansion, then cross-encoder reranking over a joblib
index. Two engines meant two places to tune retrieval quality, two sets
of scores on different scales, and drift risk every time one got improved
without the other.

This module makes RAGPipeline use the SAME hybrid engine new_pipeline
already uses, instead of the brute-force one. adapters/retriever.py is
kept in place (nothing deletes it) so any direct callers or tests
referencing it don't break, but RAGPipeline no longer imports it —
see the updated rag_pipeline.py.

PolicyRetriever.retrieve() returns the exact shape RAGPipeline's
downstream code already expects (chunk_id, document_id, chunk_text,
token_start, token_end, score) so nothing else in rag_pipeline.py needs
to change to consume it. `score` is populated from the cross-encoder
rerank_score, so RAGPipeline's existing assess_confidence() check
(services/confidence.py) is now comparing rerank scores rather than raw
cosine similarity — LOW_CONFIDENCE_THRESHOLD should be re-tuned against
this new scale (see confidence.py's docstring).
"""

import logging

logger = logging.getLogger(__name__)


class PolicyRetriever:
    """
    Thin adapter over new_pipeline's already-loaded Index + ChunkRetriever
    + EntityExtractor + Reranker, exposing the same .retrieve(question,
    top_k) interface adapters/retriever.Retriever used to provide.

    Import of new_pipeline.pipeline is deferred to __init__ (not module
    level) because that module loads real joblib index files and spins up
    LLM/embedding/reranker clients at import time. Deferring means this
    file can still be imported (e.g. for tests, or by tooling that scans
    the package) without requiring those artifacts to be present.
    """

    def __init__(self):
        from app.services.new_pipeline.pipeline import (
            index,
            EntityExtractor,
            ChunkRetriever,
            Reranker,
            embed,
        )

        self._embed = embed
        self._extractor = EntityExtractor()
        self._chunk_retriever = ChunkRetriever(index)
        self._reranker = Reranker()

    def retrieve(self, question: str, top_k: int = 5):
        query_entities = self._extractor.extract(question)
        q_emb = self._embed(question)

        pool = self._chunk_retriever.retrieve(question, query_entities, q_emb)

        if not pool:
            return []

        ranked = self._reranker.rerank(question, pool)

        results = []
        for chunk in ranked[:top_k]:
            results.append(
                {
                    "chunk_id": chunk["chunk_id"],
                    "document_id": chunk["chunk_id"].split("_chunk_")[0],
                    "chunk_text": chunk["chunk_text"],
                    "token_start": 0,
                    "token_end": 0,
                    # Cross-encoder rerank score, NOT raw cosine similarity.
                    # See confidence.py — LOW_CONFIDENCE_THRESHOLD must be
                    # tuned against this scale now that RAGPipeline reads
                    # rerank scores through this adapter.
                    "score": float(chunk.get("rerank_score", 0.0)),
                }
            )

        return results
