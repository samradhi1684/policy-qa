from pypdf import PdfReader


def extract_pdf_text(file):
    reader = PdfReader(file)

    text = ""

    for page in reader.pages:
        page_text = page.extract_text()

        if page_text:
            text += page_text + "\n"

    return text


def extract_md_text(file):
    return file.read().decode("utf-8")


def chunk_text(
    text: str,
    chunk_size: int = 800,
):
    chunks = []

    start = 0

    while start < len(text):
        end = start + chunk_size

        chunks.append(
            text[start:end]
        )

        start = end

    return chunks