class PromptBuilder:

    def build(
        self,
        intent: str,
        question: str,
        history: str,
        policy_context: str,
        web_context: str,
        response_mode: str,
    ):

        web_section = ""

        if web_context:

            web_section = f"""

Recent Web Information:

{web_context}
"""

        intent_instruction = self._get_intent_instruction(
            intent
        )

        prompt = f"""
You are a Renewable Energy Policy assistant.

You are in an ongoing conversation
with the user.

Current Intent:

{intent}

Response Style:

{response_mode}

Task Instructions:

{intent_instruction}

--------------------------------------------

Core Rules:

- Understand conversation context.

- Resolve references such as:

  it
  this
  that
  those
  previous answer

- Maintain conversational continuity.

- Never ignore previous discussion.

--------------------------------------------

Knowledge Priority:

1. Conversation context

2. Policy documents

3. Recent web information

--------------------------------------------

Answering Rules:

- Use policy evidence whenever possible.

- Use web information for:

  latest updates
  statistics
  trends
  recent developments

- Never invent facts.

- If web information was used,
  mention that recent sources
  were included.

--------------------------------------------

Return JSON only.

Schema:

{{
  "answer":"...",
  "citations":["S1","S2"]
}}

--------------------------------------------

Conversation History:

{history}

--------------------------------------------

Policy Evidence:

{policy_context}

--------------------------------------------

{web_section}

--------------------------------------------

Current User Question:

{question}

Generate answer:
"""

        return prompt

    def build_conversational(
        self,
        question: str,
        history: str,
    ):
        """
        Used when the ConversationRouter classifies the message as
        "general" — greetings, small talk, thanks, identity questions.
        No policy evidence, no citations, no retrieval involved.
        """

        return f"""
You are a Renewable Energy Policy assistant having a normal conversation.

Respond naturally and briefly to the user's message. Do not mention
documents, retrieval, or citations — this message does not need them.
If asked who you are or what you can do, explain briefly that you help
answer questions about renewable energy policy documents.

--------------------------------------------

Conversation so far:

{history}

--------------------------------------------

User: {question}

Assistant:
"""

    def build_clarification(
        self,
        question: str,
        history: str,
    ):
        """
        Used when the ConversationRouter classifies the message as
        "clarify" — too ambiguous to route confidently even with history.
        """

        return f"""
The user's message is ambiguous given the conversation so far.

Ask ONE short, specific clarifying question that would let you answer
well. Do not guess an answer. Do not apologize excessively.

--------------------------------------------

Conversation so far:

{history}

--------------------------------------------

User: {question}

Clarifying question:
"""

    def build_out_of_scope(
        self,
        question: str,
    ):
        """
        Used when the ConversationRouter classifies the message as
        "out_of_scope" — clearly unrelated to renewable energy policy
        and not general chat.
        """

        return f"""
The user asked something outside this assistant's scope, which is
renewable energy policy. Politely say so in one or two sentences and
redirect toward what you can help with instead. Do not be curt.

--------------------------------------------

User: {question}

Response:
"""

    def build_fallback(
        self,
        question: str,
        history: str,
    ):
        """
        Used when the domain route ran retrieval but confidence was too
        low to answer from the retrieved evidence (see PolicyRetriever
        confidence gating).
        """

        return f"""
No sufficiently relevant policy documents were found for this question.

Tell the user honestly that you don't have enough grounded information
to answer confidently, and suggest they rephrase or narrow the question.
Do not fabricate an answer from general knowledge.

--------------------------------------------

Conversation so far:

{history}

--------------------------------------------

User: {question}

Response:
"""

    def _get_intent_instruction(
        self,
        intent: str
    ):

        if intent == "summarize":

            return """
The user wants a concise summary.

Reduce unnecessary details.

Use previous conversation strongly.

Do not introduce new information.
"""

        elif intent == "simplify":

            return """
The user wants a simpler explanation.

Avoid technical terms.

Explain for beginners.
"""

        elif intent == "compare":

            return """
The user wants comparison.

Clearly compare similarities
and differences.

Structure answer clearly.
"""

        elif intent == "recent_update":

            return """
The user wants latest information.

Prioritize recent developments.

Use web information heavily.
"""

        elif intent == "analysis":

            return """
The user wants analytical reasoning.

Explain cause and effect.

Provide deeper insight.
"""

        else:

            return """
Answer normally using retrieved
knowledge and conversation context.
"""