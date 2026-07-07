import uuid

from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    email: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
    )

    username: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
    )

    hashed_pw: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )


    # ---------- NEW ----------

    display_name: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    role: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    country: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )