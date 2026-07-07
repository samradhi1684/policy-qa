class MemoryManager:

    def build_context(
        self,
        chat_history: list
    ) -> str:

        if not chat_history:
            return ""

        recent = []

        for msg in chat_history[-6:]:
            recent.append(
                f"{msg.role}: {msg.content}"
            )

        return "\n".join(recent)