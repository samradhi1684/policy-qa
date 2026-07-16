from fastapi import HTTPException
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from pathlib import Path


from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Form,
)

from app.adapters.llm_client import LLMClient
from app.services.document_service import (
    extract_pdf_text,
    extract_md_text,
)

router = APIRouter(
    prefix="/document",
    tags=["document"],
)

llm = LLMClient()

from pathlib import Path

DOCUMENTS_DIR = (
    Path(__file__).resolve().parents[2] / "documents"
)


from pydantic import BaseModel

from app.services.doc_title_service import get_titles
from app.services import uploaded_document_service


class TitlesBody(BaseModel):
    document_ids: list[str]


@router.post("/titles")
async def document_titles(body: TitlesBody):
    """Resolve human-readable titles for document ids. Titles are
    generated once with a lightweight LLM call, cached on disk, and
    fall back to the filename if generation fails."""
    ids = body.document_ids[:50]  # sanity cap
    # get_titles() can make blocking LLM calls (requests) for any
    # not-yet-cached document id — keep it off the event loop so it
    # doesn't stall other concurrent requests.
    titles = await run_in_threadpool(get_titles, ids)
    return {"titles": titles}


@router.get("/{document_id}")
async def get_document(document_id: str):
    # Chat-session uploaded documents are stored in the PostgreSQL-backed
    # uploaded_document_service (not the old in-memory session_documents).
    # Document ids for uploads look like "upload::<uuid>" after the pipeline
    # strips the "upload::" prefix from chunk_ids, or just the raw UUID
    # string from the /documents list endpoint.
    if document_id.startswith("upload"):
        # Strip the "upload::" namespace prefix if present so we have a
        # plain UUID that get_document_text() can look up by id.
        lookup_id = document_id.split("::", 1)[-1] if "::" in document_id else document_id
        text = await run_in_threadpool(
            uploaded_document_service.get_document_text, lookup_id
        )
        if text is None:
            raise HTTPException(
                status_code=404,
                detail="Document not found",
            )
        return JSONResponse(
            {
                "document_id": document_id,
                "markdown": text,
            }
        )

    # Corpus documents may be referenced with or without the .md extension.
    path = DOCUMENTS_DIR / document_id
    if not path.exists():
        path = DOCUMENTS_DIR / f"{document_id}.md"

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    markdown = path.read_text(
        encoding="utf-8"
    )

    return JSONResponse(
        {
            "document_id": document_id,
            "markdown": markdown,
        }
    )