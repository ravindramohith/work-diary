import os
import asyncpg
from dotenv import load_dotenv
from typing import AsyncGenerator

load_dotenv()


async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    conn = None
    try:
        conn = await asyncpg.connect(
            os.getenv("DB"),
            statement_cache_size=0,  # Disable statement caching
            server_settings={"jit": "off"},  # Disable JIT compilation
            timeout=30.0,  # Add connection timeout
        )
        yield conn
    except asyncpg.PostgresError as e:
        print(f"Database error: {str(e)}")
        raise
    except Exception as e:
        print(f"Unexpected database error: {str(e)}")
        raise
    finally:
        if conn:
            try:
                await conn.close()
            except Exception as e:
                print(f"Error closing connection: {str(e)}")
