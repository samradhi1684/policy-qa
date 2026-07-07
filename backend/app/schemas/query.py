from pydantic import BaseModel


class QueryRequest(BaseModel):
    question: str


class Source(BaseModel):
    chunk_id: str
    document_id: str
    score: float
    chunk_text: str
    evidence: str = ""
    token_start: int = 0
    token_end: int = 0
    highlight_spans: list[dict] = []
    used: bool = False


class QueryResponse(BaseModel):
    answer: str
    sources: list[Source]