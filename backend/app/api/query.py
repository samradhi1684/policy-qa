from fastapi import APIRouter

from app.schemas.query import (
    QueryRequest,
    QueryResponse
)

from app.services.rag_pipeline import (
    RAGPipeline
)


router = APIRouter()

pipeline = RAGPipeline()


@router.post(
    "/query",
    response_model=QueryResponse
)
def query(
    request: QueryRequest
):

    result = pipeline.answer(
        request.question
    )

    return result