import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column

from app.core.database import Base

class UploadedDocument(Base):
    __tablename__ = "uploaded_documents"

    id = mapped_column(UUID, primary_key=True, default=uuid.uuid4)

    chat_id = mapped_column(
        ForeignKey("chats.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    filename = mapped_column(String, nullable=False)

    raw_text = mapped_column(Text, nullable=False)

    created_at = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )