import json


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

4. Retrieval Decision

needs_retrieval = true when intent is:

- qa
- follow_up
- compare
- analysis
- recent_update

needs_retrieval = false when intent is:

- summarize
- simplify

--------------------------------------------

5. Web Search Decision

needs_web_search = true ONLY when user asks for:

- latest updates
- recent developments
- recent statistics
- current trends
- recent announcements
- current news

Mentioning a year alone does NOT require web search.

--------------------------------------------

6. Response Mode

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

  "needs_retrieval": true,

  "needs_web_search": false,

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

                parsed = {
                    "intent": "qa",
                    "standalone_query":
                        question,
                    "reference_target":
                        None,
                    "needs_retrieval":
                        True,
                    "needs_web_search":
                        False,
                    "response_mode":
                        "detailed"
                }

        return parsed