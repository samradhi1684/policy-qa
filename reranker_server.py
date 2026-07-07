#!/usr/bin/env python3
"""
reranker_server.py — BGE Reranker FastAPI server.
Exposes /v1/rerank and /v1/score compatible with OpenAI-style clients.
"""

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from typing import Union, List, Optional
from sentence_transformers import CrossEncoder
import torch
import uvicorn
import os

# ── Config from environment ────────────────────────────────────────────────
API_KEY    = os.getenv("RERANKER_API_KEY")
MODEL      = os.getenv("RERANKER_MODEL",      "BAAI/bge-reranker-v2-m3")
HOST       = os.getenv("RERANKER_HOST",       "0.0.0.0")
PORT       = int(os.getenv("RERANKER_PORT",   "8001"))
BATCH_SIZE = int(os.getenv("RERANKER_BATCH_SIZE", "8"))
MAX_LENGTH = int(os.getenv("RERANKER_MAX_LENGTH", "1024"))
DEVICE     = os.getenv("RERANKER_DEVICE",     "cuda" if torch.cuda.is_available() else "cpu")
DTYPE      = os.getenv("RERANKER_TORCH_DTYPE","float16")

if not API_KEY:
    raise RuntimeError("RERANKER_API_KEY must be set (env var or .env file)")

# ── Model load ─────────────────────────────────────────────────────────────
model_kwargs = {}
if DEVICE.startswith("cuda"):
    model_kwargs["torch_dtype"] = torch.bfloat16 if DTYPE == "bfloat16" else torch.float16

print(f"[reranker] Loading {MODEL} | device={DEVICE} | batch={BATCH_SIZE} | max_len={MAX_LENGTH}")
model = CrossEncoder(
    MODEL,
    device=DEVICE,
    max_length=MAX_LENGTH,
    trust_remote_code=True,
    model_kwargs=model_kwargs,
)
model.model.eval()
print(f"[reranker] Ready on {DEVICE}.")

# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(title="BGE Reranker API")

# ── Schemas ────────────────────────────────────────────────────────────────
class ScoreRequest(BaseModel):
    model: str = Field(default="bge-reranker")
    text_1: str
    text_2: Union[str, List[str]]
    batch_size: Optional[int] = None

class RerankRequest(BaseModel):
    model: str = Field(default="bge-reranker")
    query: str
    documents: List[str]
    top_k: Optional[int] = None
    batch_size: Optional[int] = None
    return_documents: bool = True

# ── Auth ───────────────────────────────────────────────────────────────────
def check_auth(authorization: str):
    if authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized")

# ── Routes ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL, "device": DEVICE,
            "batch_size": BATCH_SIZE, "max_length": MAX_LENGTH}

@app.get("/v1/models")
def list_models():
    return {"data": [{"id": "bge-reranker", "object": "model"}]}

@app.post("/v1/score")
def score(req: ScoreRequest, authorization: str = Header(...)):
    check_auth(authorization)
    texts = req.text_2 if isinstance(req.text_2, list) else [req.text_2]
    pairs = [[req.text_1, t] for t in texts]
    bs = req.batch_size or BATCH_SIZE
    scores = model.predict(pairs, batch_size=bs,
                           show_progress_bar=False,
                           convert_to_numpy=True).tolist()
    return {
        "model": req.model, "device": DEVICE, "batch_size": bs,
        "data": [{"index": i, "score": float(s)} for i, s in enumerate(scores)],
    }

@app.post("/v1/rerank")
def rerank(req: RerankRequest, authorization: str = Header(...)):
    check_auth(authorization)
    bs = req.batch_size or BATCH_SIZE
    results = model.rank(
        query=req.query,
        documents=req.documents,
        top_k=req.top_k,
        return_documents=req.return_documents,
        batch_size=bs,
        show_progress_bar=False,
    )
    normalized = []
    for item in results:
        row = {"index": int(item["corpus_id"]), "score": float(item["score"])}
        if req.return_documents and "text" in item:
            row["document"] = item["text"]
        normalized.append(row)
    return {"model": req.model, "device": DEVICE, "batch_size": bs, "results": normalized}

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
