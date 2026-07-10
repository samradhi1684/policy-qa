"""
Compatibility shim: re-exports the PostgreSQL-backed uploaded document
service under the `session_documents` name that the rest of the codebase
imports.  The old joblib/in-memory `session_document.py` (singular) can be
deleted once this shim is in place.
"""
from app.services.uploaded_document_service import (  # noqa: F401
    add_document,
    list_documents,
    get_document_text,
    get_document_name,
    retrieve,
)