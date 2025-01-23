from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.database import get_db
import asyncpg

app = FastAPI()

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/test-db")
async def test_db(db: asyncpg.Connection = Depends(get_db)):
    version = await db.fetchval("SELECT version()")
    return {"status": "ok", "database": "connected", "database_version": version}
