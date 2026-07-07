import json
import uuid
from datetime import datetime
from pathlib import Path

from app.adapters.llm_client import LLMClient

CHATS_FILE = Path("storage/chats.json")
_llm = LLMClient()


def _load() -> dict:
    if not CHATS_FILE.exists():
        return {}
    with open(CHATS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict):
    CHATS_FILE.parent.mkdir(exist_ok=True)
    with open(CHATS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _generate_title(question: str, answer: str) -> str:
    prompt = f"""Generate a very short title (4-6 words max) that summarizes this Q&A exchange.
Return ONLY the title, no quotes, no punctuation at the end, no explanation.

Question: {question}
Answer: {answer[:300]}

Title:"""
    try:
        title = _llm.generate(prompt, temperature=0.3).strip()
        if not title or len(title) > 80:
            return question[:60] + ("…" if len(question) > 60 else "")
        return title
    except Exception:
        return question[:60] + ("…" if len(question) > 60 else "")


def create_chat() -> dict:
    chats = _load()
    chat_id = str(uuid.uuid4())
    chat = {
        "chat_id": chat_id,
        "title": "New Chat",
        "created_at": datetime.utcnow().isoformat(),
        "pinned": False,
        "messages": [],
    }
    chats[chat_id] = chat
    _save(chats)
    return chat


def list_chats() -> list:
    chats = _load()
    return sorted(
        chats.values(),
        key=lambda c: (not c.get("pinned", False), c["created_at"]),
        reverse=True,
    )


def get_chat(chat_id: str) -> dict | None:
    return _load().get(chat_id)


def append_message(chat_id: str, question: str, answer: str, sources: list) -> dict:
    chats = _load()
    chat = chats[chat_id]
    if chat["title"] == "New Chat" and not chat["messages"]:
        chat["title"] = _generate_title(question, answer)
    chat["messages"].append(
        {"question": question, "answer": answer, "sources": sources}
    )
    chats[chat_id] = chat
    _save(chats)
    return chat


def delete_chat(chat_id: str) -> bool:
    chats = _load()
    if chat_id not in chats:
        return False
    del chats[chat_id]
    _save(chats)
    return True


def rename_chat(chat_id: str, title: str) -> dict | None:
    chats = _load()
    if chat_id not in chats:
        return None
    chats[chat_id]["title"] = title
    _save(chats)
    return chats[chat_id]


def pin_chat(chat_id: str, pinned: bool) -> dict | None:
    chats = _load()
    if chat_id not in chats:
        return None
    chats[chat_id]["pinned"] = pinned
    _save(chats)
    return chats[chat_id]