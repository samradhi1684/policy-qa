import os
import tempfile

from fastapi import (
    APIRouter,
    HTTPException,
    UploadFile,
    File,
)
from pydantic import BaseModel
from faster_whisper import WhisperModel

from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db

from fastapi import Depends
from app.services.title_service import generate_title


from app.services.document_service import (
    extract_pdf_text,
    extract_md_text,
)

from app.dependencies import (
    get_current_user,
    get_optional_current_user,
)
from app.models.user import User

from app.services.chat_service import (
    create_chat,
    list_chats,
    get_chat,
    delete_chat,
    rename_chat,
    search_chats,
    pin_chat,
)

import uuid
from pathlib import Path

from app.services.download_service import (
    generate_download_file,
)

from fastapi import Form
from fastapi import UploadFile
from fastapi import File

from app.adapters.llm_client import LLMClient


from app.services import uploaded_document_service

from app.services.message_service import (
    create_message,
    list_messages,
    get_recent_messages,
)

from app.services.new_pipeline.pipeline import pipeline
from fastapi.responses import (
    PlainTextResponse,
    Response,
)

from reportlab.pdfgen import canvas
from io import BytesIO

import json
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from types import SimpleNamespace


def _parse_guest_history(raw: str | None):
    """
    Guests (no logged-in account) have no DB-backed chat/messages row, so
    get_recent_messages() has nothing to fetch — memory_context ends up
    permanently empty and the router/planner can never resolve follow-up
    references ("it", "those rounds", ...), no matter how the question is
    phrased. The frontend already keeps the full transcript in React state
    for guest sessions, so it sends that transcript along as a JSON string
    (`client_history`, a list of {"role": "user"|"assistant", "content": str}
    objects) and we use it here as memory_context input in place of the
    DB-backed history authenticated users get. Untrusted input, so every
    field is validated before use rather than trusted as-is.
    """
    if not raw:
        return []

    try:
        items = json.loads(raw)
    except (TypeError, ValueError):
        return []

    if not isinstance(items, list):
        return []

    parsed = []

    # Same window get_recent_messages() uses (limit=6 most-recent), doubled
    # since guest turns are user+assistant pairs — keeps the router/planner
    # prompt bounded regardless of how long the client-side transcript is.
    for item in items[-12:]:
        if not isinstance(item, dict):
            continue

        role = item.get("role")
        content = item.get("content")

        if role not in ("user", "assistant"):
            continue

        if not isinstance(content, str) or not content.strip():
            continue

        parsed.append(SimpleNamespace(role=role, content=content))

    return parsed


router = APIRouter(
    prefix="/chats",
    tags=["chats"]
)


llm = LLMClient()

GENERATED_DIR = Path("generated")
GENERATED_DIR.mkdir(exist_ok=True)

# Load Whisper once.
# download_root points at the shared hf-cache volume (mounted in docker-compose.yml)
# so the model is downloaded once and reused across container restarts instead of
# being re-fetched into the container's ephemeral filesystem every time.
WHISPER_CACHE_DIR = os.environ.get(
    "HF_HOME",
    os.path.expanduser("~/.cache/huggingface"),
)
whisper_model = WhisperModel(
    "small.en",
    compute_type="int8",
    download_root=os.path.join(WHISPER_CACHE_DIR, "hub"),
)


class QueryBody(BaseModel):
    question: str
    web_search: bool = False

class RegenerateBody(BaseModel):
    question: str
    sources: list
    
class RenameBody(BaseModel):
    title: str


class PinBody(BaseModel):
    pinned: bool


@router.post("")
async def new_chat(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_chat(
        db,
        str(current_user.id),
    )

@router.get("")
async def get_all_chats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_chats(
        db,
        str(current_user.id),
    )

@router.get("/search")
async def search_chat_titles(
    q: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await search_chats(
        db,
        str(current_user.id),
        q,
    )

@router.get("/{chat_id}")
async def get_chat_detail(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await get_chat(
        db,
        chat_id,
        str(current_user.id),
    )

    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Chat not found",
        )

    return chat


@router.post("/{chat_id}/query")
async def query_in_chat(
    chat_id: str,
    question: str = Form(...),
    file: UploadFile | None = File(None),
    web_search: bool = Form(False),
    country: str = Form("dsire"),
    client_history: str | None = Form(None),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = None

    if current_user:
        chat = await get_chat(
            db,
            chat_id,
            str(current_user.id),
        )

        if not chat:
            raise HTTPException(
                status_code=404,
                detail="Chat not found",
            )

    history = []

    if current_user:
        history = await get_recent_messages(
            db,
            chat_id,
        )
    else:
        # No DB-backed chat/messages for guests — fall back to the
        # transcript the frontend keeps client-side, so follow-ups still
        # resolve ("it", "those rounds", ...) instead of hitting router
        # "clarify"/planner failures every single turn.
        history = _parse_guest_history(client_history)

    # pipeline.answer() does retrieval + rerank + LLM generation using
    # blocking HTTP calls; run it in a worker thread so it doesn't
    # freeze the event loop and block every other concurrent request.
    result = await run_in_threadpool(
        pipeline.answer,
        question,
        chat_history=history,
        web_search=web_search,
        chat_id=chat_id if current_user else None,
        country=country,
    )

    
    if current_user:
        await create_message(
            db,
            chat_id,
            "user",
            question,
        )

    download_url = None

    question_lower = question.lower()

    requested_format = None

    if "pdf" in question_lower:
        requested_format = "pdf"

    elif "docx" in question_lower:
        requested_format = "docx"

    elif "xlsx" in question_lower:
        requested_format = "xlsx"

    elif "json" in question_lower:
        requested_format = "json"

    elif "markdown" in question_lower or "md" in question_lower:
        requested_format = "md"

    if requested_format:

        filename = (
            f"{uuid.uuid4()}.{requested_format}"
        )

        filepath = (
            GENERATED_DIR / filename
        )

        generate_download_file(
            content=result["answer"],
            file_type=requested_format,
            output_path=str(filepath),
        )

        download_url = (
            f"http://127.0.0.1:8000/downloads/{filename}"
        )

    if current_user and chat and chat.title == "New Chat":

        try:

            title = await run_in_threadpool(
                pipeline.generate_chat_title,
                question,
            )

            await rename_chat(
                db,
                chat_id,
                str(current_user.id),
                title,
            )

        except Exception as e:

            print(
                "Title generation failed:",
                e
            )

    
    if current_user:
        await create_message(
            db,
            chat_id,
            "assistant",
            result["answer"],
        )

    #
    # AUTO TITLE GENERATION
    #
    if current_user and chat and chat.title == "New Chat":

        title = await run_in_threadpool(
            generate_title,
            question,
            result["answer"],
        )

        await rename_chat(
            db,
            chat_id,
            str(current_user.id),
            title,
        )

    if download_url:
        result["download_url"] = download_url
        result["download_type"] = requested_format

    preview = llm.generate(
        f"""
        In one sentence explain what was generated.

        User request:
        {question}

        Generated content:
        {result['answer'][:1500]}
        """
    )

    result["file_message"] = preview

    return result


@router.post("/{chat_id}/query/stream")
async def query_in_chat_stream(
    chat_id: str,
    question: str = Form(...),
    file: UploadFile | None = File(None),
    web_search: bool = Form(False),
    country: str = Form("dsire"),
    client_history: str | None = Form(None),
    has_document: bool = Form(False),
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Server-Sent-Events version of /{chat_id}/query for the plain RAG
    (no file upload) path. Emits, in order:

      data: {"status": "thinking"}                         -> retrieval/rerank in progress
      data: {"token": "..."}                                -> repeated, one per token
      data: {"done": true, "sources": [...], "title": "..."} -> final event

    """

    chat = None

    if current_user:
        chat = await get_chat(
            db,
            chat_id,
            str(current_user.id),
        )

        if not chat:
            raise HTTPException(
                status_code=404,
                detail="Chat not found",
            )
    
    # Needed by the router + planner inside prepare_for_stream() so
    # follow-ups ("how many rounds were involved in it") get resolved
    # against the actual conversation instead of routed/retrieved with
    # zero context. Fetched BEFORE create_message() below (same ordering
    # as the non-streaming /query endpoint) so it doesn't also include
    # the current question.
    history = []

    if current_user:
        history = await get_recent_messages(
            db,
            chat_id,
        )
    else:
        # Guests have no DB-backed chat/messages row — use the transcript
        # the frontend sent instead, same as the non-streaming endpoint.
        history = _parse_guest_history(client_history)

    if current_user:
        await create_message(
            db,
            chat_id,
            "user",
            question,
        )

    is_new_chat = (
        current_user
        and chat is not None
        and chat.title == "New Chat"
    )



    async def event_stream():
        # Tell the frontend generation has started so it can show a
        # "Thinking..." state immediately, before retrieval/rerank finishes.
        yield f"data: {json.dumps({'status': 'thinking'})}\n\n"

        full_answer = ""

        # Retrieval + rerank + prompt-building is CPU/GPU/network bound and
        # synchronous, so it's run off the event loop in a thread.
        prompt, sources, fallback = await run_in_threadpool(
            pipeline.prepare_for_stream,
            question,
            history,
            chat_id if current_user else None,
            country,
            has_document,
        )

        if fallback is not None:
            full_answer = fallback
            yield f"data: {json.dumps({'token': fallback})}\n\n"
        else:
            # pipeline.stream_answer() is a native async generator (backed
            # by httpx.AsyncClient), so `async for` yields control back to
            # the event loop between tokens. Other concurrent requests
            # (other users' /query/stream calls, other routes) keep making
            # progress while this one waits on the next chunk from vLLM.
            async for token in pipeline.stream_answer(prompt):
                full_answer += token
                yield f"data: {json.dumps({'token': token})}\n\n"
        
        if current_user:
            await create_message(
                db,
                chat_id,
                "assistant",
                full_answer,
            )

        title = None

        if is_new_chat:
            try:
                title = await run_in_threadpool(
                    generate_title, question, full_answer
                )
                await rename_chat(
                    db,
                    chat_id,
                    str(current_user.id),
                    title,
                )
            except Exception as e:
                print("Title generation failed:", e)

        yield (
            "data: "
            + json.dumps({"done": True, "sources": sources, "title": title})
            + "\n\n"
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering if you're behind one
        },
    )


@router.get("/{chat_id}/messages")
async def get_messages(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await get_chat(
        db,
        chat_id,
        str(current_user.id),
    )

    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Chat not found",
        )

    messages = await list_messages(
        db,
        chat_id,
    )

    return messages

# NEW: Whisper transcription
@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...)
):

    suffix = os.path.splitext(
        audio.filename
    )[1] or ".webm"

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=suffix
    ) as tmp:

        contents = await audio.read()
        tmp.write(contents)
        temp_path = tmp.name

    try:

        def _transcribe():
            segments, info = whisper_model.transcribe(
                temp_path,
                beam_size=5,
            )
            # segments is a lazy generator tied to the model call, so it
            # must be consumed inside the same worker-thread call too.
            return " ".join(seg.text for seg in segments).strip()

        # CPU-bound model inference — run off the event loop so it
        # doesn't block other concurrent users' requests while it runs.
        text = await run_in_threadpool(_transcribe)

        return {
            "text": text
        }

    finally:
        if os.path.exists(
            temp_path
        ):
            os.remove(temp_path)


@router.delete("/{chat_id}")
async def remove_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success = await delete_chat(
        db,
        chat_id,
        str(current_user.id),
    )

    if not success:
        raise HTTPException(
            status_code=404,
            detail="Chat not found",
        )

    return {"ok": True}


@router.patch("/{chat_id}/rename")
async def rename(
    chat_id: str,
    body: RenameBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await rename_chat(
        db,
        chat_id,
        str(current_user.id),
        body.title,
    )

    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Chat not found",
        )

    return chat


@router.patch("/{chat_id}/pin")
async def pin(
    chat_id: str,
    body: PinBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await pin_chat(
        db,
        chat_id,
        str(current_user.id),
        body.pinned,
    )

    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Chat not found",
        )

    return chat

@router.get("/{chat_id}/export")
async def export_chat(
    chat_id: str,
    format: str = "txt",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await get_chat(
        db,
        chat_id,
        str(current_user.id),
    )

    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Chat not found",
        )

    messages = await list_messages(
        db,
        chat_id,
    )

    title = chat.title or "chat"

    # TXT
    if format == "txt":

        content = f"Chat: {title}\n\n"

        for msg in messages:

            content += (
                f"[{msg.role.upper()}]\n"
                f"{msg.content}\n\n"
            )

        return PlainTextResponse(
            content=content,
            headers={
                "Content-Disposition":
                f'attachment; filename="{title}.txt"'
            },
        )

    # MARKDOWN
    if format == "md":

        content = f"# {title}\n\n"

        for msg in messages:

            role = (
                "User"
                if msg.role == "user"
                else "Assistant"
            )

            content += (
                f"## {role}\n\n"
                f"{msg.content}\n\n"
            )

        return Response(
            content=content,
            media_type="text/markdown",
            headers={
                "Content-Disposition":
                f'attachment; filename="{title}.md"'
            },
        )

    # PDF
    if format == "pdf":

        buffer = BytesIO()

        pdf = canvas.Canvas(buffer)

        y = 800

        pdf.setFont(
            "Helvetica-Bold",
            16,
        )

        pdf.drawString(
            40,
            y,
            title,
        )

        y -= 40

        pdf.setFont(
            "Helvetica",
            11,
        )

        for msg in messages:

            role = (
                "USER"
                if msg.role == "user"
                else "ASSISTANT"
            )

            pdf.drawString(
                40,
                y,
                f"{role}:"
            )

            y -= 20

            text = pdf.beginText(
                60,
                y,
            )

            for line in msg.content.split("\n"):
                text.textLine(line)

            pdf.drawText(text)

            y -= (
                len(
                    msg.content.split("\n")
                )
                * 15
            ) + 30

            if y < 80:

                pdf.showPage()

                y = 800

        pdf.save()

        buffer.seek(0)

        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={
                "Content-Disposition":
                f'attachment; filename="{title}.pdf"'
            },
        )

    raise HTTPException(
        status_code=400,
        detail="Invalid format",
    )

@router.post("/{chat_id}/regenerate")
async def regenerate_answer(
    chat_id: str,
    body: RegenerateBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await get_chat(
        db,
        chat_id,
        str(current_user.id),
    )

    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Chat not found",
        )

    result = await run_in_threadpool(
        pipeline.answer,
        body.question,
        retrieved_override=body.sources,
        temperature=0.7,
    )

    return result

class _DocResponse(BaseModel):
    id: str
    name: str
    chat_id: str
    num_chunks: int
    created_at: str | None = None


@router.post("/{chat_id}/documents")
async def upload_chat_document(
    chat_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF / Markdown / Text document into this chat. The document
    is chunked, embedded, persisted, and merged into retrieval for every
    subsequent question in the chat. Requires authentication."""
    chat = await get_chat(db, chat_id, str(current_user.id))
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    filename = file.filename or "document"
    lower = filename.lower()

    if lower.endswith(".pdf"):
        text = await run_in_threadpool(extract_pdf_text, file.file)
    elif lower.endswith(".md") or lower.endswith(".txt"):
        text = await run_in_threadpool(extract_md_text, file.file)
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type (use PDF, Markdown, or Text)",
        )

    try:
        # Chunking + embedding is CPU/network bound and synchronous —
        # keep it off the event loop.
        meta = await run_in_threadpool(
            uploaded_document_service.add_document, chat_id, filename, text
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return meta


@router.get("/{chat_id}/documents")
async def list_chat_documents(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await get_chat(db, chat_id, str(current_user.id))
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    return uploaded_document_service.list_documents(chat_id)