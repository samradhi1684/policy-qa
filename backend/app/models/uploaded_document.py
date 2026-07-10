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