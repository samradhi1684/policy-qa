import asyncio

from app.core.database import engine
from app.core.database import Base

from app.models.user import User
from app.models.chat import Chat
from app.models.message import Message
from app.models.source import Source


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("Database connected successfully")


asyncio.run(init_db())