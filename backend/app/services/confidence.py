"""
Confidence gating for retrieval results.

Three retrieval paths now share this module's gating pattern:
  1. RAGPipeline, via services/retrieval/policy_retriever.py — reads
     "score" (cross-encoder rerank_score, since Step 6 consolidation).
  2. new_pipeline.Pipeline's hybrid retriever — reads "rerank_score"
     directly off its own chunk dicts.
  3. The file-upload fuzzy-match path (services/document_retriever.py,
     used from api/chats.py's DOCUMENT MODE branch) — reads "score" on a
     0-100 rapidfuzz partial_ratio scale, NOT comparable to the other two.

Each gets its own threshold constant because the score distributions are
on genuinely different scales (cosine similarity vs. cross-encoder logits
vs. fuzzy string-match ratio) — sharing one threshold across them would be
wrong on at least two of the three.
"""

# Threshold for services/retrieval/policy_retriever.py's rerank_score
# (used by RAGPipeline after Step 6 consolidation onto the hybrid engine).
# Tune against real score distributions from your traffic: log
# retrieved[0]["score"] for a week, then set the threshold at roughly the
# point that separates "this chunk is actually about the question" from
# "this chunk shares a few keywords."
LOW_CONFIDENCE_THRESHOLD = 0.35


def assess_confidence(retrieved: list, threshold: float = LOW_CONFIDENCE_THRESHOLD) -> str:
    """
    Returns "low" or "high" based on the top retrieved item's score.

    "low"  -> nothing was retrieved, or the best match is below threshold.
              Callers should NOT attempt to generate a grounded answer
              from this evidence; route to a fallback/honest-uncertainty
              response instead.
    "high" -> at least one result cleared the bar.
    """

    if not retrieved:
        return "low"

    top_score = retrieved[0].get("score", 0.0)

    return "low" if top_score < threshold else "high"


# Separate threshold for the new_pipeline hybrid retriever's own dicts,
# which carry "rerank_score" rather than "score" pre-consolidation. Kept
# distinct from LOW_CONFIDENCE_THRESHOLD above even though both are now
# cross-encoder scores, since new_pipeline's pooling/expansion differs
# slightly from policy_retriever's and the two may need to diverge again
# later.
LOW_CONFIDENCE_RERANK_THRESHOLD = 0.35


def assess_rerank_confidence(
    ranked_chunks: list,
    threshold: float = LOW_CONFIDENCE_RERANK_THRESHOLD,
) -> str:
    """
    Same idea as assess_confidence(), but reads "rerank_score" instead of
    "score" — the field new_pipeline.Reranker.rerank() attaches to each
    chunk after cross-encoder scoring.
    """

    if not ranked_chunks:
        return "low"

    top_score = ranked_chunks[0].get("rerank_score", 0.0)

    return "low" if top_score < threshold else "high"


# Threshold for services/document_retriever.py's rapidfuzz partial_ratio
# scores (0-100 scale, not 0-1 — do not reuse the constants above here).
# This path previously had no confidence gate at all: the file-upload
# branch in api/chats.py would generate an answer from the top-5 fuzzy
# matches even when none of them actually related to the question.
LOW_CONFIDENCE_FUZZ_THRESHOLD = 45.0


def assess_fuzzy_confidence(
    retrieved: list,
    threshold: float = LOW_CONFIDENCE_FUZZ_THRESHOLD,
) -> str:
    """
    Gate for services/document_retriever.retrieve_chunks() output. Same
    "low"/"high" contract as the other two assess_* functions above.
    """

    if not retrieved:
        return "low"

    top_score = retrieved[0].get("score", 0.0)

    return "low" if top_score < threshold else "high"
