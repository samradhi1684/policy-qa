"""
Alias module: the codebase imports `session_documents` (plural) but the
implementation lives in `session_document` (singular).  This thin shim
re-exports everything so both import paths work without renaming the
canonical file.
"""
from app.services.session_document import (  # noqa: F401
    add_document,
    list_documents,
    get_document_text,
    get_document_name,
    retrieve,
)