import uuid

from sqlalchemy import ForeignKey, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("messages.id"),
        nullable=False,
    )

    chunk_id: Mapped[str] = mapped_column(String)

    document_id: Mapped[str] = mapped_column(String)

    chunk_text: Mapped[str] = mapped_column(String)

    score: Mapped[float] = mapped_column(Float)