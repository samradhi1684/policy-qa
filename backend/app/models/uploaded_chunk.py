import uuid

from sqlalchemy import ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column

from app.core.database import Base


class UploadedChunk(Base):
    __tablename__ = "uploaded_chunks"

    id = mapped_column(UUID, primary_key=True, default=uuid.uuid4)

    document_id = mapped_column(
        ForeignKey("uploaded_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    chunk_index = mapped_column(Integer)

    chunk_text = mapped_column(Text)

    embedding = mapped_column(JSON)

    chunk_id = mapped_column(String)