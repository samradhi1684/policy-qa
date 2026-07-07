from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from datetime import datetime
from sqlalchemy import select, func, or_

from app.models.chat import Chat
from app.models.message import Message


async def create_chat(
    db: AsyncSession,
    user_id: str,
):
    chat = Chat(
        id=uuid4(),
        user_id=user_id,
        title="New Chat",
        created_at=datetime.utcnow(),
    )

    db.add(chat)

    await db.commit()
    await db.refresh(chat)

    return chat


async def list_chats(
    db: AsyncSession,
    user_id: str,
):
    result = await db.execute(
        select(Chat)
        .where(Chat.user_id == user_id)
        .order_by(Chat.created_at.desc())
    )

    return result.scalars().all()


async def get_chat(
    db: AsyncSession,
    chat_id: str,
    user_id: str,
):
    result = await db.execute(
        select(Chat).where(
            Chat.id == chat_id,
            Chat.user_id == user_id,
        )
    )

    return result.scalar_one_or_none()


async def delete_chat(
    db: AsyncSession,
    chat_id: str,
    user_id: str,
):
    chat = await get_chat(
        db,
        chat_id,
        user_id,
    )

    if not chat:
        return False

    # delete all messages first
    await db.execute(
        delete(Message).where(
            Message.chat_id == chat.id
        )
    )

    # then delete chat
    await db.delete(chat)

    await db.commit()

    return True


async def rename_chat(
    db: AsyncSession,
    chat_id: str,
    user_id: str,
    title: str,
):
    chat = await get_chat(
        db,
        chat_id,
        user_id,
    )

    if not chat:
        return None

    chat.title = title

    await db.commit()
    await db.refresh(chat)

    return chat


async def pin_chat(
    db: AsyncSession,
    chat_id: str,
    user_id: str,
    pinned: bool,
):
    chat = await get_chat(
        db,
        chat_id,
        user_id,
    )

    if not chat:
        return None

    chat.pinned = pinned

    await db.commit()
    await db.refresh(chat)

    return chat

from sqlalchemy import (
    select,
    func,
    or_
)

async def search_chats(
    db: AsyncSession,
    user_id: str,
    query: str,
):
    result = await db.execute(
        select(Chat)
        .join(Message)
        .where(
            Chat.user_id == user_id,
            or_(
                func.lower(Chat.title)
                .contains(
                    query.lower()
                ),
                func.lower(
                    Message.content
                ).contains(
                    query.lower()
                ),
            ),
        )
        .distinct()
        .order_by(
            Chat.created_at.desc()
        )
    )

    return result.scalars().all()