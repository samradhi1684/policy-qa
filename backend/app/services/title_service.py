from app.adapters.llm_client import LLMClient

llm = LLMClient()


def generate_title(
    question: str,
    answer: str,
) -> str:

    prompt = f"""
Generate a very short chat title.

Rules:
- 3 to 6 words
- No quotes
- No punctuation
- Return only the title

Question:
{question}

Answer:
{answer[:500]}
"""

    try:
        title = llm.generate(
            prompt,
            temperature=0.2,
        ).strip()

        if not title:
            return question[:50]

        return title[:80]

    except Exception:
        return question[:50]