from fastapi import FastAPI, Depends, APIRouter, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from app.database import get_db
from .auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_password_hash,
)
from .security import encrypt_token
from .models import UserCreate, UserDB, Token
import asyncpg, os, secrets
from .services.slack import generate_slack_nudge
from slack_sdk import WebClient
from slack_sdk.oauth import AuthorizeUrlGenerator
from fastapi.responses import RedirectResponse, HTMLResponse

app = FastAPI()

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/test-db")
async def test_db(db: asyncpg.Connection = Depends(get_db)):
    version = await db.fetchval("SELECT version()")
    return {"status": "ok", "database": "connected", "database_version": version}


router = APIRouter()


@router.post("/signup", response_model=UserDB)
async def signup(user: UserCreate, db: asyncpg.Connection = Depends(get_db)):
    existing_user = await db.fetchrow(
        "SELECT * FROM users WHERE email = $1", user.email
    )
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    hashed_password = get_password_hash(user.password)
    new_user = await db.fetchrow(
        """
        INSERT INTO users (email, hashed_password) 
        VALUES ($1, $2)
        RETURNING id, email, hashed_password, disabled, created_at
        """,
        user.email,
        hashed_password,
    )
    return UserDB(**new_user)


@router.post("/login", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: asyncpg.Connection = Depends(get_db),
):
    user = await authenticate_user(form_data.username, form_data.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(
        minutes=float(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
    )
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )

    # Get complete user info including slack details
    complete_user = await db.fetchrow(
        """
        SELECT id, email, slack_user_id, slack_team_id 
        FROM users WHERE email = $1
        """,
        user["email"],
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "email": complete_user["email"],
            "slack_user_id": complete_user["slack_user_id"],
            "slack_team_id": complete_user["slack_team_id"],
        },
    }


@router.get("/users/me", response_model=UserDB)
async def read_users_me(current_user: UserDB = Depends(get_current_user)):
    return current_user


# Initialize Slack client
slack_client = WebClient(token=os.getenv("SLACK_BOT_TOKEN"))


# Slack OAuth endpoints
SLACK_REDIRECT_URI = "https://0.0.0.0:8000/slack-callback"
FRONTEND_SUCCESS_URI = "http://localhost:3000/dashboard"


@router.get("/connect-slack")
async def connect_slack():
    # Generate a random state
    state = secrets.token_urlsafe(16)

    auth_url = (
        f"https://slack.com/oauth/v2/authorize?"
        f"client_id={os.getenv('SLACK_CLIENT_ID')}&"
        f"scope=channels:history,chat:write&"
        f"user_scope=channels:history,chat:write&"
        f"redirect_uri={SLACK_REDIRECT_URI}&"
        f"state={state}"
    )
    # print(f"Starting Slack OAuth flow with state: {state}")
    # print(f"Generated Slack auth URL: {auth_url}")
    return RedirectResponse(auth_url)


@router.get("/slack-callback")
async def slack_callback(
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
    db: asyncpg.Connection = Depends(get_db),
):
    # Log all request parameters
    # print("Received callback with:")
    # print(f"code: {code}")
    # print(f"error: {error}")
    # print(f"state: {state}")

    if error:
        print(f"Error from Slack: {error}")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error={error}")

    if not code:
        print("No code received from Slack")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error=no_code")

    try:
        # Exchange code for token
        oauth_response = slack_client.oauth_v2_access(
            client_id=os.getenv("SLACK_CLIENT_ID"),
            client_secret=os.getenv("SLACK_CLIENT_SECRET"),
            code=code,
            redirect_uri=SLACK_REDIRECT_URI,
        )
        print(f"oauth_response: {oauth_response}")

        # Get Slack user info
        user_info = slack_client.users_info(user=oauth_response["authed_user"]["id"])
        slack_email = user_info["user"]["profile"]["email"]

        # Update user with Slack details
        await db.execute(
            """
            UPDATE users 
            SET 
                slack_user_id = $1,
                slack_access_token = $2,
                slack_team_id = $3
            WHERE email = $4
            """,
            oauth_response["authed_user"]["id"],
            encrypt_token(oauth_response["authed_user"]["access_token"]),
            oauth_response["team"]["id"],
            slack_email,
        )

        return RedirectResponse(FRONTEND_SUCCESS_URI)
    except Exception as e:
        print(f"Error during OAuth: {str(e)}")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error={str(e)}")


@router.post("/slack/send-nudge")
async def send_slack_nudge(
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    # Generate and send message
    nudge = await generate_slack_nudge(current_user.id, db)
    slack_client.chat_postMessage(channel=current_user.slack_user_id, text=nudge)
    return {"status": "Nudge sent!"}


app.include_router(router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        ssl_keyfile="certs/key.pem",
        ssl_certfile="certs/cert.pem",
        reload=True,
    )
