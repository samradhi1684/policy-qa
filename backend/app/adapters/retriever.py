import json

import numpy as np

from .embedder import Embedder


class Retriever:

    def __init__(self):

        self.embedder = Embedder()

        self.embeddings = np.load(
            "storage/embeddings.npy"
        )

        with open(
            "storage/chunks.json",
            "r",
            encoding="utf-8"
        ) as f:

            self.chunks = json.load(f)

        # Precompute norms once
        self.embedding_norms = np.linalg.norm(
            self.embeddings,
            axis=1
        )

    def retrieve(
        self,
        question: str,
        top_k: int = 5
    ):

        query_embedding = self.embedder.encode(
            question
        )

        query_norm = np.linalg.norm(
            query_embedding
        )

        similarities = (
            self.embeddings @ query_embedding
        ) / (
            self.embedding_norms * query_norm
        )

        indices = np.argsort(
            similarities
        )[::-1][:top_k]

        results = []

        for idx in indices:

            chunk = self.chunks[idx]

            results.append(
                {
                    "chunk_id": chunk["chunk_id"],
                    "document_id": chunk["document_id"],
                    "chunk_text": chunk["chunk_text"],
                    "token_start": chunk["token_start"],
                    "token_end": chunk["token_end"],
                    "score": float(
                        similarities[idx]
                    )
                }
            )

        return results