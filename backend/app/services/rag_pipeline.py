import re
import json
import logging
from rapidfuzz import fuzz

from app.adapters.llm_client import LLMClient
from app.services.retrieval.policy_retriever import PolicyRetriever
from app.services.prompt_builder import PromptBuilder
from app.services.memory_manager import MemoryManager
from app.services.planner import Planner
from app.services.routing.conversation_router import ConversationRouter
from app.services.confidence import assess_confidence

logger = logging.getLogger(__name__)



class RAGPipeline:

    def __init__(self):
        self.retriever = PolicyRetriever()
        self.llm = LLMClient()
 
        self.prompt_builder = PromptBuilder()
        self.memory = MemoryManager()
        self.planner = Planner(self.llm)
        self.router = ConversationRouter(self.llm)
    

    def generate_chat_title(
        self,
        question: str
    ) -> str:

        prompt = f"""
    You generate conversation titles.

    Rules:
    - 2 to 6 words
    - No quotation marks
    - No explanations
    - Return ONLY the title

    Question:
    {question}
    
    

    Title:
    """

        raw = self.llm.generate(
            prompt,
            temperature=0.1
        )

        if hasattr(raw, "content"):
            raw = raw.content

        return str(raw).strip()[:60]


    def answer(
        self,
        question: str,
        chat_history=None,
        top_k: int = 5,
        retrieved_override=None,
        temperature=0.2,
        web_search=False,
    ):

        if web_search:
            logger.info(
                "web_search=True was passed but web search is not part of "
                "this pipeline; ignoring."
            )

        # Step 5b: summary-aware memory context. Below ~20 turns this
        # is identical to build_context(); past that, older turns
        # collapse into a short LLM summary instead of falling off
        # the token budget.
        memory_context = self.memory.build_context_with_summary(
            chat_history,
            self.llm,
        )

        # ------------------------------------------------------------
        # Route BEFORE doing anything expensive. Only "domain" messages
        # go on to the planner + retrieval + generation below. Everything
        # else short-circuits with a lightweight, tool-free response.
        # ------------------------------------------------------------
        route = self.router.route(question, memory_context)

        print("\n--- ROUTER ---")
        print(json.dumps(
            {"category": route.category, "confidence": route.confidence},
            indent=2,
        ))
        print("--------------------")

        if route.is_general():
            raw = self.llm.generate(
                self.prompt_builder.build_conversational(question, memory_context),
                temperature=0.4,
                max_tokens=200,
            )
            return self._finalize(question, raw)

        if route.is_out_of_scope():
            raw = self.llm.generate(
                self.prompt_builder.build_out_of_scope(question),
                temperature=0.3,
                max_tokens=150,
            )
            return self._finalize(question, raw)

        if route.is_clarify():
            raw = self.llm.generate(
                self.prompt_builder.build_clarification(question, memory_context),
                temperature=0.3,
                max_tokens=150,
            )
            return self._finalize(question, raw, needs_clarification=True)

        # ------------------------------------------------------------
        # route.category == "domain" from here on — existing planner +
        # retrieval + generation flow, unchanged apart from web search
        # having been removed.
        # ------------------------------------------------------------
        decision = self.planner.plan(
            question,
            memory_context
        )

        print("\n--- PLANNER ---")
        print(json.dumps(
            decision,
            indent=2
        ))
        print("--------------------")
        print(
            "PLANNER DECISION:",
            decision
        )
        search_question = decision.get(
            "standalone_query"
        )

        if not isinstance(
            search_question,
            str
        ):
            print(
                "Invalid standalone_query from orchestrator"
            )

            search_question = question

        if retrieved_override is not None:

            retrieved = retrieved_override

        else:
      
       
            print(
                "REWRITTEN:",
                search_question
            )
            retrieved = []

            if decision["needs_retrieval"]:

                retrieved = self.retriever.retrieve(
                    search_question,
                    top_k=top_k
                )

        # ------------------------------------------------------------
        # Confidence gate: retrieval ran but nothing usable came back.
        # Don't let the LLM try to force an answer out of weak evidence —
        # be honest instead. Only applies when retrieval actually ran for
        # this intent (retrieved_override bypasses this, same as it
        # already bypasses the retrieval decision above).
        # ------------------------------------------------------------
        if (
            retrieved_override is None
            and decision["needs_retrieval"]
            and assess_confidence(retrieved) == "low"
        ):
            print("LOW CONFIDENCE RETRIEVAL — routing to fallback response")

            raw = self.llm.generate(
                self.prompt_builder.build_fallback(question, memory_context),
                temperature=0.3,
                max_tokens=200,
            )
            return self._finalize(question, raw, low_confidence=True)

        evidence_map = {}
        evidence_lines = []
        sentence_idx = 0

        for item_idx, item in enumerate(
            retrieved
        ):

            sentences = _split_sentences(
                item["chunk_text"]
            )

            for sent in sentences:

                sid = f"S{sentence_idx}"

                evidence_map[sid] = {
                    "sentence": sent,
                    "item_idx": item_idx,
                }

                evidence_lines.append(
                    f"[{sid}] {sent}"
                )

                sentence_idx += 1

        numbered_context = "\n".join(
            evidence_lines
        )
        prompt = self.prompt_builder.build(
            intent=decision["intent"],

            question=search_question,

            history=memory_context,

            policy_context=numbered_context,

            web_context="",

            response_mode=decision[
                "response_mode"
            ]
        )
        
 
        raw = self.llm.generate(
            prompt,
            temperature=temperature
        )

        if hasattr(raw, "content"):
            raw = raw.content

        raw = str(raw).strip()

        try:

            parsed = json.loads(raw)

        except Exception:

            cleaned = (
                raw.replace(
                    "```json",
                    ""
                )
                .replace(
                    "```",
                    ""
                )
                .strip()
            )

            try:

                parsed = json.loads(
                    cleaned
                )

            except Exception:

                parsed = {
                    "answer": cleaned,
                    "citations": [],
                }

        if isinstance(parsed, str):

            try:

                parsed = json.loads(
                    parsed
                )

            except Exception:

                parsed = {
                    "answer": parsed,
                    "citations": [],
                }

        answer = parsed.get(
            "answer",
            ""
        )

        citations = parsed.get(
            "citations",
            []
        )

        if (
            isinstance(answer, str)
            and answer.strip().startswith("{")
            and '"citations"' in answer
        ):

            try:

                nested = json.loads(
                    answer
                )

                answer = nested.get(
                    "answer",
                    answer
                )

                citations = nested.get(
                    "citations",
                    citations
                )

            except Exception:
                pass

        sources = []

        for idx, item in enumerate(
            retrieved
        ):

            spans = []
            cited_sentences = []

            for cid in citations:

                if cid not in evidence_map:
                    continue

                ev = evidence_map[cid]

                if ev["item_idx"] != idx:
                    continue

                sent = ev["sentence"]

                start = item[
                    "chunk_text"
                ].lower().find(
                    sent.lower()
                )

                if start == -1:

                    best_score = 0
                    best_start = -1
                    sent_len = len(sent)

                    for i in range(
                        len(item["chunk_text"])
                    ):

                        window = item[
                            "chunk_text"
                        ][
                            i:i + sent_len + 30
                        ]

                        score = fuzz.partial_ratio(
                            sent.lower(),
                            window.lower()
                        )

                        if score > best_score:

                            best_score = score
                            best_start = i

                    if best_score >= 75:
                        start = best_start

                if start == -1:
                    continue

                spans.append({
                    "start": start,
                    "end": start + len(sent)
                })

                cited_sentences.append(
                    sent
                )

            sources.append({
                **item,
                "evidence":
                    " ".join(
                        cited_sentences
                    ),
                "highlight_spans":
                    spans,
            })

        sources = sorted(
            sources,
            key=lambda x: x["score"],
            reverse=True
        )[:3]

        return {
            "question": question,
            "answer": answer,
            "sources": sources,
            "web_sources": []
         
        }

    def _finalize(
        self,
        question: str,
        raw_answer,
        needs_clarification: bool = False,
        low_confidence: bool = False,
    ):
        """
        Shared return-shape builder for the router short-circuit paths
        (general / out_of_scope / clarify) and the confidence-gated
        fallback path. Keeps the response dict consistent with the
        domain path's shape so the API layer and frontend don't need
        to special-case these routes.
        """

        answer = getattr(raw_answer, "content", raw_answer)
        answer = str(answer).strip()

        result = {
            "question": question,
            "answer": answer,
            "sources": [],
            "web_sources": [],
        }

        if needs_clarification:
            result["needs_clarification"] = True

        if low_confidence:
            result["low_confidence"] = True

        return result


# Helpers

def _split_sentences(text: str) -> list[str]:

    parts = re.split(
        r'(?<=[.!?])\s+',
        text.strip()
    )

    sentences = []

    for part in parts:

        sub = re.split(
            r'\n+|(?<=\w)\s*[-·•]\s*(?=[A-Z])',
            part
        )

        sentences.extend(sub)

    return [
        s.strip()
        for s in sentences
        if len(s.strip()) > 15
    ]