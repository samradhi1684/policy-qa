from rapidfuzz import fuzz


def retrieve_chunks(
    question: str,
    chunks: list[str],
    top_k: int = 5,
):
    scored = []

    for i, chunk in enumerate(chunks):

        score = fuzz.partial_ratio(
            question.lower(),
            chunk.lower(),
        )

        scored.append(
            (
                score,
                i,
                chunk,
            )
        )

    scored.sort(
        reverse=True
    )

    results = []

    for score, idx, chunk in scored[:top_k]:

        results.append(
            {
                "chunk_id": str(idx),
                "document_id": "uploaded_document",
                "score": float(score),
                "chunk_text": chunk,
                "evidence": chunk[:300],
                "token_start": 0,
                "token_end": len(chunk),
                "highlight_spans": [],
            }
        )

    return results