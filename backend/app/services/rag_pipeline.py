import re
import json
from rapidfuzz import fuzz

from app.adapters.llm_client import LLMClient
from app.adapters.retriever import Retriever
from app.services.web_search import search_web
from app.services.prompt_builder import PromptBuilder
from app.services.memory_manager import MemoryManager
from app.services.planner import Planner



class RAGPipeline:

    def __init__(self):
        self.retriever = Retriever()
        self.llm = LLMClient()
 
        self.prompt_builder = PromptBuilder()
        self.memory = MemoryManager()
        self.planner = Planner(self.llm)
    

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

        web_context = ""
        web_results = []
        web_sources = []
        
        memory_context = self.memory.build_context(
        chat_history 
        )   
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
        if (
            web_search
            or decision["needs_web_search"]
        ):

            print("RUNNING TAVILY SEARCH")
            try:
    
    
             
                print(
                    "ORIGINAL:",
                    question
                )

                print(
                    "REWRITTEN:",
                    search_question
                )
                web_results = search_web(
                    search_question
                )
               
                web_sources = [
    {
        "title": r["title"],
        "url": r["url"],
        "content": r["content"]
    }
    for r in web_results[:5]
]
                
                print(
                "WEB RESULTS:",
                len(web_results)
            )

                web_context = "\n\n".join(
                    [
                        f"Title: {r['title']}\n"
                        f"Content: {r['content']}"
                        for r in web_results[:5]
                    ]
                )

            except Exception as e:

                print(
                    "Web search failed:",
                    e
                )

                web_context = ""

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

            web_context=web_context,

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
            "web_sources": web_sources
         
        }


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