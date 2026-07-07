from fastapi import HTTPException
from fastapi.responses import JSONResponse
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


@router.get("/{document_id}")
async def get_document(document_id: str):
    path = DOCUMENTS_DIR / document_id

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