def detect_download_format(question: str):

    q = question.lower()

    if "pdf" in q:
        return "pdf"

    if "docx" in q or "word" in q:
        return "docx"

    if "xlsx" in q or "excel" in q:
        return "xlsx"

    if "json" in q:
        return "json"

    if "markdown" in q or "md" in q:
        return "md"

    return None