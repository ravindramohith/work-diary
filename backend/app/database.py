import asyncpg
from dotenv import load_dotenv
import os

load_dotenv()


async def get_db():
    return await asyncpg.connect(os.getenv("DB"))
