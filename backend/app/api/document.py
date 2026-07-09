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
from app.services import session_documents


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
    # Chat-session uploaded documents live in the session store, not on
    # the corpus documents directory.
    if document_id.startswith("upload-"):
        text = session_documents.get_document_text(document_id)
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