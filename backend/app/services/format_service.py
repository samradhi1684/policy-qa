from enum import Enum

class OutputFormat(str, Enum):
    PARAGRAPH = "paragraph"
    BULLETS = "bullets"
    TABLE = "table"
    REPORT = "report"
    JSON = "json"
    MARKDOWN = "markdown"


def detect_format(question: str) -> OutputFormat:

    q = question.lower()

    if "table" in q:
        return OutputFormat.TABLE

    if "bullet" in q:
        return OutputFormat.BULLETS

    if "json" in q:
        return OutputFormat.JSON

    if "markdown" in q:
        return OutputFormat.MARKDOWN

    if "report" in q:
        return OutputFormat.REPORT

    return OutputFormat.PARAGRAPH