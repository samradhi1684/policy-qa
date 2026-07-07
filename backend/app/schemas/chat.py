from pydantic import BaseModel
from app.schemas.query import Source

class ChatSummary(BaseModel):
    chat_id: str
    title: str
    created_at: str

class Message(BaseModel):
    question: str
    answer: str
    sources: list[Source]

class ChatDetail(BaseModel):
    chat_id: str
    title: str
    created_at: str
    messages: list[Message]