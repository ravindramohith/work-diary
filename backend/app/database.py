import os
import asyncpg
from dotenv import load_dotenv
from ssl import create_default_context, CERT_NONE

load_dotenv()


async def get_db():
    """Get database connection"""
    ssl_context = create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = CERT_NONE

    return await asyncpg.connect(os.getenv("DB"), ssl=ssl_context)
