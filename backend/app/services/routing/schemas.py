from pydantic import BaseModel


VALID_CATEGORIES = {"general", "domain", "out_of_scope", "clarify"}


class RouterDecision(BaseModel):
    """
    Output of ConversationRouter.route().

    category:
      - "general"      greetings, small talk, thanks, acknowledgements,
                        identity questions, goodbyes -> no retrieval, no planner
      - "domain"        needs the policy documents -> goes to Planner + retrieval
      - "out_of_scope"  clearly unrelated to renewable energy policy
      - "clarify"       too ambiguous to route confidently
    """

    category: str
    confidence: float = 0.5

    def is_general(self) -> bool:
        return self.category == "general"

    def is_domain(self) -> bool:
        return self.category == "domain"

    def is_out_of_scope(self) -> bool:
        return self.category == "out_of_scope"

    def is_clarify(self) -> bool:
        return self.category == "clarify"
