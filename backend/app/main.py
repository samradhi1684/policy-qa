from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.api.document import router as document_router
from app.api.query import router as query_router
from fastapi.middleware.cors import CORSMiddleware
from app.api.chats import router as chats_router
from app.routers.auth import router as auth_router
import logging

logging.getLogger(
    "sqlalchemy.engine"
).setLevel(
    logging.WARNING
)

app = FastAPI(
    title="QA System",
    version="0.0.1"
)

app.mount(
    "/downloads",
    StaticFiles(directory="generated"),
    name="downloads",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    query_router
)

app.include_router(auth_router)

@app.get("/")
def root():
    return {
        "message": "QA System API Running",
        "version": "0.0.1"
    }

@app.get("/health")
def health():

    return {
        "status": "ok"
    }
    

app.include_router(chats_router)

app.include_router(document_router)