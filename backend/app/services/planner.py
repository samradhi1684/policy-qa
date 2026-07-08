import json


# Step 7 — tool registry. Adding a new tool later (e.g. a future
# lookup_document_by_id) means adding one entry here and one line in the
# prompt's "Available tools" section — callers read decision["tool_calls"]
# generically instead of a new boolean being added to the schema (and to
# every caller's if-statements) each time.
AVAILABLE_TOOLS = {
    "retrieve_policy_docs": "Search the indexed policy document store for relevant chunks.",
    "web_search": "Search the web for recent/external information not in the policy documents.",
}


class Planner:

    def __init__(
        self,
        llm
    ):
        self.llm = llm


    def plan(
        self,
        question: str,
        memory_context: str
    ):

        prompt = f"""
You are a query planning engine.

You do NOT answer questions.

Your job is to analyze the user query
and return a structured execution plan.

--------------------------------------------

Conversation History:

{memory_context}

--------------------------------------------

Latest User Message:

{question}

--------------------------------------------

Determine:

1. User Intent

Possible intents:

- qa
- follow_up
- summarize
- simplify
- compare
- recent_update
- analysis

--------------------------------------------

2. Reference Resolution

Resolve references such as:

- it
- this
- that
- they
- those
- these
- previous answer
- above
- earlier

Example:

Conversation:

user: Explain Inflation Reduction Act

Question:

What impact did it have in 2025?

Resolved query:

What impact did the Inflation Reduction Act have in 2025?

--------------------------------------------

3. Standalone Query

Generate standalone_query.

Rules:

- MUST always be string

- Never boolean

- Never null

--------------------------------------------

4. Tool Calls

Available tools:

- retrieve_policy_docs: search the indexed policy document store
- web_search: search the web for recent/external information

Decide which tools (zero, one, or both) this query needs. Return each as
an object in a "tool_calls" list:

{{"tool": "retrieve_policy_docs", "reason": "short reason"}}

Use retrieve_policy_docs when intent is:

- qa
- follow_up
- compare
- analysis
- recent_update

Do NOT use retrieve_policy_docs when intent is:

- summarize
- simplify

Use web_search ONLY when the user asks for:

- latest updates
- recent developments
- recent statistics
- current trends
- recent announcements
- current news

Mentioning a year alone does NOT require web_search.

tool_calls can be an empty list if neither tool is needed (e.g. summarize/
simplify acting on context already in the conversation).

--------------------------------------------

5. Response Mode

qa → detailed

follow_up → detailed

summarize → concise

simplify → simple

compare → comparative

recent_update → detailed

analysis → analytical

--------------------------------------------

Return ONLY valid JSON.

Schema:

{{
  "intent": "string",

  "standalone_query": "string",

  "reference_target": "string or null",

  "tool_calls": [
    {{"tool": "retrieve_policy_docs", "reason": "string"}}
  ],

  "response_mode": "string"
}}

No explanation.

Only JSON.
"""

        raw = self.llm.generate(
            prompt,
            temperature=0.1
        )

        if hasattr(
            raw,
            "content"
        ):
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

                # Fail toward retrieval, same bias as before: an unparseable
                # planner response should not silently skip looking things
                # up.
                parsed = {
                    "intent": "qa",
                    "standalone_query":
                        question,
                    "reference_target":
                        None,
                    "tool_calls": [
                        {"tool": "retrieve_policy_docs", "reason": "planner parse failure — default to retrieval"}
                    ],
                    "response_mode":
                        "detailed"
                }

        return _normalize(parsed, question)


def _normalize(parsed: dict, question: str) -> dict:
    """
    Ensures every caller gets a dict with BOTH the new tool_calls list and
    the old needs_retrieval / needs_web_search booleans, derived from it.

    Why keep the booleans: RAGPipeline (services/rag_pipeline.py) and any
    other existing caller currently read decision["needs_retrieval"]
    directly. Rewriting every call site in the same pass as the schema
    change is unnecessary risk for a low-urgency change (per the original
    audit: "only worth doing if you expect to add a third tool later").
    This keeps both call styles valid — new code should prefer
    decision["tool_calls"]; old code keeps working unmodified.
    """

    if not isinstance(parsed, dict):
        parsed = {}

    parsed.setdefault("intent", "qa")
    parsed.setdefault("standalone_query", question)
    parsed.setdefault("reference_target", None)
    parsed.setdefault("response_mode", "detailed")

    tool_calls = parsed.get("tool_calls")
    if not isinstance(tool_calls, list):
        tool_calls = []

    # Drop unknown tool names defensively rather than trusting the LLM's
    # output verbatim — same "never trust raw model JSON" posture as the
    # router's VALID_CATEGORIES check.
    tool_calls = [
        tc for tc in tool_calls
        if isinstance(tc, dict) and tc.get("tool") in AVAILABLE_TOOLS
    ]
    parsed["tool_calls"] = tool_calls

    tool_names = {tc["tool"] for tc in tool_calls}
    parsed["needs_retrieval"] = "retrieve_policy_docs" in tool_names
    parsed["needs_web_search"] = "web_search" in tool_names

    if not isinstance(parsed.get("standalone_query"), str):
        parsed["standalone_query"] = question

    return parsed
