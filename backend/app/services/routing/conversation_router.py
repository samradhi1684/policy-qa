import json
import logging

from pydantic import ValidationError

from app.services.routing.schemas import RouterDecision, VALID_CATEGORIES

logger = logging.getLogger(__name__)


ROUTER_PROMPT = """You are a message router for a Renewable Energy Policy assistant.
Classify the user's LATEST message into exactly one category. Do not answer it.

Categories:
- "general"      -> greetings, small talk, thanks, acknowledgements ("ok", "got it",
                     "cool", "sounds good"), identity questions ("who are you",
                     "what can you do"), goodbyes
- "domain"       -> anything that requires looking up policy documents, or the user's
                     own uploaded document(s), or reasoning about their content,
                     including follow-ups referencing earlier answers ("what about
                     2025", "explain that more", "compare it to X")
- "out_of_scope" -> clearly unrelated to renewable energy policy AND not general chat
                     (e.g. "write me a poem about cats", "what's 2+2", "tell me a joke")
- "clarify"      -> too vague or ambiguous to route confidently even with the history
                     given (e.g. "tell me more" with no prior topic, a message that's
                     just "?", a single word with no context)

{document_context}
Rules:
- If there is any reasonable reading under which the message needs policy documents
  or the user's uploaded document(s), choose "domain" rather than "clarify" or
  "general". When unsure between "domain" and anything else, prefer "domain".
- If the user has uploaded a document in this chat, treat phrases like "this
  document", "the document", "this file", or "it" as referring to that upload —
  route these to "domain", never "clarify", even with no prior conversation history.
- A short reply like "thanks" or "ok" right after a policy answer is still "general" -
  it does not need another retrieval.

--------------------------------------------

Conversation history (most recent last):

{history}

--------------------------------------------

Latest user message:

{message}

--------------------------------------------

Return ONLY this JSON, nothing else, no explanation:

{{"category": "general" | "domain" | "out_of_scope" | "clarify", "confidence": 0.0-1.0}}
"""


class ConversationRouter:
    """
    Fast, cheap pre-classifier that runs on every message before any
    planning or retrieval happens. This is what lets general conversation
    (greetings, thanks, identity questions) skip the vector database
    entirely instead of always going through full RAG.
    """

    def __init__(self, llm):
        self.llm = llm

    def route(
        self,
        message: str,
        memory_context: str,
        has_uploaded_documents: bool = False,
    ) -> RouterDecision:
        document_context = (
            "The user has uploaded one or more documents into this chat; "
            "questions about \"this document\"/\"the document\"/\"it\" refer to "
            "those uploads and should route to \"domain\".\n"
            if has_uploaded_documents
            else ""
        )

        prompt = ROUTER_PROMPT.format(
            history=memory_context or "(none)",
            message=message,
            document_context=document_context,
        )

        raw = self.llm.generate(
            prompt,
            temperature=0.0,
            max_tokens=60,
        )

        raw = getattr(raw, "content", raw)
        raw = str(raw).strip()

        cleaned = (
            raw.replace("```json", "")
            .replace("```", "")
            .strip()
        )

        try:
            data = json.loads(cleaned)
            decision = RouterDecision.model_validate(data)

        except (json.JSONDecodeError, ValidationError, TypeError) as exc:
            logger.warning(
                "Router JSON parse failed (%s), falling back to 'domain'. Raw: %r",
                exc,
                raw,
            )
            # Fail toward retrieval, not away from it: a parse failure that
            # skips retrieval risks a confidently wrong non-answer to a real
            # policy question. A parse failure that still retrieves just
            # costs some extra latency. Same bias as the existing Planner's
            # fallback (needs_retrieval=True).
            return RouterDecision(category="domain", confidence=0.0)

        if decision.category not in VALID_CATEGORIES:
            logger.warning(
                "Router returned unknown category %r, falling back to 'domain'.",
                decision.category,
            )
            decision.category = "domain"

        return decision