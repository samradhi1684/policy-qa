import json
from pathlib import Path

import numpy as np
import tiktoken

from app.adapters.embedder import Embedder


DOCUMENTS_DIR = Path("documents")
STORAGE_DIR = Path("storage")

CHUNK_SIZE = 250
OVERLAP = 50


encoding = tiktoken.get_encoding("cl100k_base")


def chunk_text(text: str):
    """
    Fixed-size token chunking.

    chunk_size = 250
    overlap = 50
    stride = 200
    """
    tokens = encoding.encode(text)
    chunks = []
    stride = CHUNK_SIZE - OVERLAP

    for start in range(0, len(tokens), stride):
        end = start + CHUNK_SIZE
        chunk_tokens = tokens[start:end]
        if not chunk_tokens:
            break

        chunk_text = encoding.decode(chunk_tokens)
        chunks.append(
            {
                "token_start": start,
                "token_end": min(end, len(tokens)),
                "chunk_text": chunk_text
            }
        )

        if end >= len(tokens):
            break

    return chunks

def main():
    STORAGE_DIR.mkdir(exist_ok=True)
    embedder = Embedder()

    all_chunks = []
    all_embeddings = []

    total_chunks = 0

    for file_path in sorted(DOCUMENTS_DIR.glob("*.md")):
        document_id = file_path.stem
        print(f"Processing {document_id}")
        text = file_path.read_text(
            encoding="utf-8",
            errors="ignore"
        )
        chunks = chunk_text(text)
        for idx, chunk in enumerate(chunks, start=1):
            chunk_id = f"{document_id}_{idx}"
            embedding = embedder.encode(
                chunk["chunk_text"]
            )
            all_embeddings.append(
                embedding
            )
            all_chunks.append(
                {
                    "chunk_id": chunk_id,
                    "document_id": document_id,
                    "chunk_text": chunk["chunk_text"],
                    "token_start": chunk["token_start"],
                    "token_end": chunk["token_end"]
                }
            )
            total_chunks += 1

    np.save(
        STORAGE_DIR / "embeddings.npy",
        np.array(all_embeddings, dtype=np.float32)
    )

    with open(
        STORAGE_DIR / "chunks.json",
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            all_chunks,
            f,
            ensure_ascii=False,
            indent=2
        )

    print("\nDone.")
    print(f"Documents indexed : {len(list(DOCUMENTS_DIR.glob('*.md')))}")
    print(f"Total chunks      : {total_chunks}")
    print(
        f"Embeddings saved  : {STORAGE_DIR / 'embeddings.npy'}"
    )
    print(
        f"Metadata saved    : {STORAGE_DIR / 'chunks.json'}"
    )


if __name__ == "__main__":
    main()