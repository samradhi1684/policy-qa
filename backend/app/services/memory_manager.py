"""
Conversation memory for the router/planner/generator prompts.

v1 (17 lines): chat_history[-6:], string-joined. No token budget.
v2 (this file, previous pass): walks history newest-first, stops on a
token budget instead of a fixed turn count. Added summarize_if_needed()
but nothing called it yet.

v3 (this pass — Step 5b): wires summarization in. build_context_with_summary()
is the single entrypoint both pipelines should call now: it collapses
anything older than `threshold_turns` into a short rolling summary via the
LLM, then prepends that summary to the token-budgeted recent window from
build_context(). Long chats now degrade gracefully (older context survives
as a compressed summary) instead of just falling off the token budget.

Token counting uses tiktoken if it's installed (matches how most LLM
tokenizers actually split text); if it isn't available in this
environment, falls back to a conservative word-count estimate so this
class never hard-fails on import.
"""

try:
    import tiktoken
    _ENCODER = tiktoken.get_encoding("cl100k_base")
except Exception:  # tiktoken not installed, or encoding fetch failed offline
    _ENCODER = None


def _count_tokens(text: str) -> int:
    if _ENCODER is not None:
        return len(_ENCODER.encode(text))
    # Rough fallback: ~1.3 tokens per word for English text. Deliberately
    # over-counts slightly (conservative) so the budget isn't exceeded.
    return int(len(text.split()) * 1.3) + 1


class MemoryManager:

    def __init__(self, max_tokens: int = 1500, summary_threshold_turns: int = 20):
        self.max_tokens = max_tokens
        self.summary_threshold_turns = summary_threshold_turns
        # Per-instance cache so repeated calls within the same chat/turn
        # (router uses memory context, then planner/generator uses it again)
        # don't re-summarize the same older-turns slice twice with an extra
        # LLM round trip. Keyed on (id of chat_history object, len(older)).
        self._summary_cache: dict = {}

    def build_context(self, chat_history: list) -> str:
        """
        Returns the most recent turns that fit inside max_tokens.
        Walks newest -> oldest so recency is preserved and only the
        oldest turns are dropped once the budget runs out.
        """

        if not chat_history:
            return ""

        lines = []
        used_tokens = 0

        for msg in reversed(chat_history):
            line = f"{msg.role}: {msg.content}"
            line_tokens = _count_tokens(line)

            if used_tokens + line_tokens > self.max_tokens:
                break

            lines.append(line)
            used_tokens += line_tokens

        return "\n".join(reversed(lines))

    def summarize_if_needed(
        self,
        chat_history: list,
        llm,
        threshold_turns: int | None = None,
    ):
        """
        For long conversations, collapse everything older than
        threshold_turns into a short running summary instead of just
        letting build_context() truncate it away permanently.

        Returns a summary string, or None if the conversation is short
        enough that no summarization is needed yet. Callers should
        prepend the summary (if any) to build_context()'s output — or
        just call build_context_with_summary() below, which does both.
        """

        threshold_turns = threshold_turns or self.summary_threshold_turns

        if not chat_history or len(chat_history) < threshold_turns:
            return None

        older = chat_history[:-threshold_turns]

        if not older:
            return None

        cache_key = (id(chat_history), len(older))
        cached = self._summary_cache.get(cache_key)
        if cached is not None:
            return cached

        text = "\n".join(f"{m.role}: {m.content}" for m in older)

        prompt = (
            "Summarize this conversation in 4-6 bullet points, preserving "
            "any facts, decisions, or open questions:\n\n"
            f"{text}"
        )

        raw = llm.generate(prompt, temperature=0.1, max_tokens=250)
        summary = str(getattr(raw, "content", raw)).strip()

        # Cache size is naturally bounded: one entry per (chat_history
        # object, older-slice length) pair seen in this process's
        # lifetime for a given chat turn. Not persisted across requests —
        # if this needs to survive process restarts, move it to Redis
        # keyed on chat_id instead of id(chat_history).
        self._summary_cache[cache_key] = summary
        return summary

    def build_context_with_summary(
        self,
        chat_history: list,
        llm,
        threshold_turns: int | None = None,
    ) -> str:
        """
        Single entrypoint pipelines should call instead of build_context()
        directly. For short conversations this is identical to
        build_context(). Once a conversation crosses threshold_turns,
        the older turns are compressed into a summary block (via
        summarize_if_needed) and prepended to the token-budgeted recent
        window, so context isn't just silently dropped as chats grow.
        """

        recent = self.build_context(chat_history)
        summary = self.summarize_if_needed(chat_history, llm, threshold_turns)

        if not summary:
            return recent

        return (
            "Summary of earlier conversation:\n"
            f"{summary}\n\n"
            "Most recent turns:\n"
            f"{recent}"
        )
