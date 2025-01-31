from fastapi import FastAPI, Depends, APIRouter, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from app.database import get_db
from .services.github import analyze_github_activity
from .auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_password_hash,
)
from .security import encrypt_token
from .models import UserCreate, UserDB, Token
from .services.slack import generate_slack_nudge
from .services.calendar import (
    create_oauth_flow,
    analyze_calendar_activity,
    GOOGLE_REDIRECT_URI,
)
import asyncpg, os, secrets
from slack_sdk import WebClient
from slack_sdk.oauth import AuthorizeUrlGenerator
from fastapi.responses import RedirectResponse, HTMLResponse
import httpx
from anthropic import Anthropic
from pydantic import BaseModel
from typing import Optional, Dict, Any
from openai import OpenAI

app = FastAPI()

# Update CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"{os.getenv('FRONTEND_URL')}"],
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
SLACK_REDIRECT_URI = f"{os.getenv('BACKEND_URL')}/slack-callback"
FRONTEND_SUCCESS_URI = f"{os.getenv('FRONTEND_URL')}/dashboard"


# Define all required Slack scopes
SLACK_BOT_SCOPES = [
    "channels:history",
    "chat:write",
    "channels:read",
    "groups:read",
    "mpim:read",
    "im:read",
    "users:read",
    "users:read.email",
    "team:read",
    "im:history",
]

SLACK_USER_SCOPES = [
    "channels:history",
    "chat:write",
    "channels:read",
    "groups:read",
    "mpim:read",
    "im:read",
    "users:read",
    "im:history",
    "mpim:history",
    "groups:history",
]


@router.get("/connect-slack")
async def connect_slack():
    # Generate a random state
    state = secrets.token_urlsafe(16)

    auth_url = (
        f"https://slack.com/oauth/v2/authorize?"
        f"client_id={os.getenv('SLACK_CLIENT_ID')}&"
        f"scope={','.join(SLACK_BOT_SCOPES)}&"
        f"user_scope={','.join(SLACK_USER_SCOPES)}&"
        f"redirect_uri={SLACK_REDIRECT_URI}&"
        f"state={state}"
    )
    return RedirectResponse(auth_url)


@router.get("/slack-callback")
async def slack_callback(
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
    db: asyncpg.Connection = Depends(get_db),
):
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

        # Get Slack user info
        user_info = slack_client.users_info(user=oauth_response["authed_user"]["id"])
        slack_email = user_info["user"]["profile"]["email"]
        print(f"oauth_response: {oauth_response}")

        # Store both bot token and user token
        await db.execute(
            """
            UPDATE users 
            SET 
                slack_user_id = $1,
                slack_access_token = $2,
                slack_bot_token = $3,
                slack_team_id = $4
            WHERE email = $5
            """,
            oauth_response["authed_user"]["id"],
            encrypt_token(oauth_response["authed_user"]["access_token"]),
            encrypt_token(oauth_response["access_token"]),
            oauth_response["team"]["id"],
            slack_email,
        )

        return RedirectResponse(FRONTEND_SUCCESS_URI)
    except Exception as e:
        print(f"Error during OAuth: {str(e)}")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error={str(e)}")


class AnalysisRequest(BaseModel):
    days: Optional[int] = 7


@router.post("/slack/analyze")
async def analyze_slack(
    request: AnalysisRequest,
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Analyze Slack activity"""
    try:
        from .services.slack import analyze_slack_activity

        analysis = await analyze_slack_activity(current_user.id, db, request.days)
        return analysis
    except Exception as e:
        print(f"Error analyzing Slack activity: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/connect-google")
async def connect_google():
    """Initiate Google Calendar OAuth flow"""
    try:
        flow = create_oauth_flow()
        authorization_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",  # Force consent screen to ensure we get refresh token
        )
        return RedirectResponse(authorization_url)
    except Exception as e:
        print(f"Error initiating Google OAuth: {str(e)}")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error=oauth_init_failed")


@router.get("/google-callback")
async def google_callback(
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
    scope: str | None = None,
    db: asyncpg.Connection = Depends(get_db),
):
    if error:
        print(f"Error from Google: {error}")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error={error}")

    if not code:
        print("No code received from Google")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error=no_code")

    try:
        flow = create_oauth_flow()

        # Get the full URL of the current request with all parameters
        current_url = f"{GOOGLE_REDIRECT_URI}?code={code}"
        if state:
            current_url += f"&state={state}"
        if scope:
            current_url += f"&scope={scope}"

        # Fetch token with complete authorization response
        flow.fetch_token(authorization_response=current_url)
        credentials = flow.credentials

        # Get user's email from Google
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={"Authorization": f"Bearer {credentials.token}"},
                )
                response.raise_for_status()
                user_info = response.json()
                print("User info response:", user_info)

                if "email" not in user_info:
                    print("Email not found in user info:", user_info)
                    return RedirectResponse(
                        f"{FRONTEND_SUCCESS_URI}?error=email_not_found"
                    )

                google_email = user_info["email"]
            except Exception as e:
                print(f"Error getting user info: {str(e)}")
                print(
                    "Response content:", response.content if response else "No response"
                )
                return RedirectResponse(
                    f"{FRONTEND_SUCCESS_URI}?error=user_info_failed"
                )

        # Store the refresh token
        if not credentials.refresh_token:
            print("No refresh token received")
            return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error=no_refresh_token")

        # Check if user exists with this email
        user = await db.fetchrow(
            """
            SELECT id, email 
            FROM users 
            WHERE email = $1
            """,
            google_email,
        )

        if not user:
            print(f"No user found with email: {google_email}")
            return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error=user_not_found")

        print(f"Updating Google Calendar credentials for user: {google_email}")

        # Update the user's Google Calendar credentials
        await db.execute(
            """
            UPDATE users 
            SET 
                google_refresh_token = $1,
                google_calendar_connected = true
            WHERE email = $2
            """,
            encrypt_token(credentials.refresh_token),
            google_email,
        )

        return RedirectResponse(FRONTEND_SUCCESS_URI)
    except Exception as e:
        print(f"Error during Google OAuth: {str(e)}")
        print(f"Full error details: {repr(e)}")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error=oauth_failed")


@router.post("/calendar/analyze")
async def analyze_calendar(
    request: AnalysisRequest,
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Analyze Calendar activity"""
    try:
        analysis = await analyze_calendar_activity(current_user.id, db, request.days)
        return analysis
    except Exception as e:
        print(f"Error analyzing Calendar activity: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class AnalysesRequest(BaseModel):
    slack_analysis: Dict[str, Any]  # Required
    calendar_analysis: Optional[Dict[str, Any]] = None  # Optional with default None
    github_analysis: Optional[Dict[str, Any]] = None  # Optional with default None


@router.post("/slack/send-combined-nudge")
async def send_combined_nudge(
    analyses: AnalysesRequest,
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Generate and send a combined nudge based on all analyses"""
    try:
        if not analyses.slack_analysis:
            raise HTTPException(
                status_code=400,
                detail="Slack analysis is required. Please connect your Slack account.",
            )

        # Add placeholder data for missing analyses
        calendar_placeholder = {
            "total_meetings": 0,
            "meetings_after_hours": 0,
            "early_meetings": 0,
            "back_to_back_meetings": 0,
            "message": "No calendar data available. Consider connecting your Google Calendar for better insights!",
        }

        github_placeholder = {
            "stats": {
                "commit_count": 0,
                "pr_count": 0,
                "review_count": 0,
                "issue_count": 0,
                "comment_count": 0,
                "active_repos": [],
            },
            "message": "No GitHub data available. Consider connecting your GitHub account for code activity insights!",
        }

        # Use OpenAI to generate a structured combined analysis
        openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        combined_analysis = openai.chat.completions.create(
            model="gpt-4o",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "user",
                    "content": f"""
                    Based on the following analyses, generate a structured work-life balance analysis in JSON format.
                    The format should follow this exact structure:
                    {{
                        "greeting": "Hi [Name]! 👋",
                        "key_patterns": [
                            "pattern1",
                            "pattern2",
                            "pattern3"
                        ],
                        "working_well": [
                            "point1",
                            "point2",
                            "point3"
                        ],
                        "opportunity_areas": [
                            "area1",
                            "area2",
                            "area3"
                        ],
                        "weekly_goal": {{
                            "title": "Try this approach next week:",
                            "steps": [
                                "step1",
                                "step2",
                                "step3"
                            ]
                        }}
                    }}

                    Analyses to consider:
                    Slack Analysis: {analyses.slack_analysis}
                    Calendar Analysis: {analyses.calendar_analysis if analyses.calendar_analysis else calendar_placeholder}
                    GitHub Analysis: {analyses.github_analysis if analyses.github_analysis else github_placeholder}

                    Important Notes:
                    1. If Calendar data is missing, suggest connecting Google Calendar for better meeting insights
                    2. If GitHub data is missing, suggest connecting GitHub for code activity tracking
                    3. Focus primarily on available Slack data for communication patterns
                    4. Make suggestions based on available data only
                    5. Include connection suggestions in opportunity_areas if services are not connected

                    Make each point concise, actionable, and specific to the user's actual data.
                    Focus on work-life balance, productivity, and well-being.
                    Use emoji in the text where appropriate.
                    """,
                }
            ],
        )

        structured_analysis = combined_analysis.choices[0].message.content

        # Format a user-friendly Slack message from the structured analysis
        analysis_dict = eval(structured_analysis)  # Convert JSON string to dict
        slack_message = f"""
{analysis_dict['greeting']}

📊 *Key Patterns:*
{chr(10).join(f"• {pattern}" for pattern in analysis_dict['key_patterns'])}

✨ *What's Working Well:*
{chr(10).join(f"• {point}" for point in analysis_dict['working_well'])}

💡 *Opportunity Areas:*
{chr(10).join(f"{i+1}. {area}" for i, area in enumerate(analysis_dict['opportunity_areas']))}

🎯 *{analysis_dict['weekly_goal']['title']}*
{chr(10).join(f"• {step}" for step in analysis_dict['weekly_goal']['steps'])}
"""

        # Send the formatted message via Slack
        slack_client.chat_postMessage(
            channel=current_user.slack_user_id, text=slack_message, parse="full"
        )

        return {
            "status": "Nudge sent successfully!",
            "analysis": analysis_dict,
            "services_connected": {
                "slack": True,
                "calendar": bool(analyses.calendar_analysis),
                "github": bool(analyses.github_analysis),
            },
        }
    except Exception as e:
        print(f"Error sending combined nudge: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Define GitHub scopes
GITHUB_SCOPES = [
    "repo",
    "read:org",
    "read:user",
    "user:email",
    "read:discussion",
    "read:project",
]

GITHUB_REDIRECT_URI = "https://work-diary-backend.vercel.app/github-callback"


@router.get("/connect-github")
async def connect_github(user_email: str):
    """Initiate GitHub OAuth flow"""
    # Generate a random state
    state = secrets.token_urlsafe(16)

    auth_url = (
        f"https://github.com/login/oauth/authorize?"
        f"client_id={os.getenv('GITHUB_CLIENT_ID')}&"
        f"scope={','.join(GITHUB_SCOPES)}&"
        f"redirect_uri={GITHUB_REDIRECT_URI}&"
        f"state={state}"
    )

    # Include the user's email in the state to retrieve it in the callback
    state_with_email = f"{state}:{user_email}"

    return RedirectResponse(auth_url.replace(state, state_with_email))


@router.get("/github-callback")
async def github_callback(
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
    db: asyncpg.Connection = Depends(get_db),
):
    if error:
        print(f"Error from GitHub: {error}")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error={error}")

    if not code or not state:
        print("No code or state received from GitHub")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error=no_code_or_state")

    try:
        # Extract email from state
        state_parts = state.split(":")
        if len(state_parts) != 2:
            print("Invalid state format")
            return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error=invalid_state")

        _, user_email = state_parts
        print(f"User email: {user_email}")
        # Exchange code for token
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": os.getenv("GITHUB_CLIENT_ID"),
                    "client_secret": os.getenv("GITHUB_CLIENT_SECRET"),
                    "code": code,
                    "redirect_uri": GITHUB_REDIRECT_URI,
                },
            )
            token_data = token_response.json()
            access_token = token_data.get("access_token")

            # Get GitHub user info
            user_response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            github_user = user_response.json()
            print(
                str(github_user["id"]),
                github_user["login"],
                encrypt_token(access_token),
                user_email,
            )
            # Store GitHub info in database using the email from state
            await db.execute(
                """
                UPDATE users 
                SET 
                    github_user_id = $1,
                    github_username = $2,
                    github_access_token = $3
                WHERE email = $4
                """,
                str(github_user["id"]),
                github_user["login"],
                encrypt_token(access_token),
                user_email,  # Use the email from state instead of GitHub email
            )

        return RedirectResponse(FRONTEND_SUCCESS_URI)
    except Exception as e:
        print(f"Error during GitHub OAuth: {str(e)}")
        return RedirectResponse(f"{FRONTEND_SUCCESS_URI}?error={str(e)}")


@router.post("/github/analyze")
async def analyze_github(
    request: AnalysisRequest,
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Analyze GitHub activity"""
    try:
        analysis = await analyze_github_activity(current_user.id, db, request.days)
        return analysis
    except Exception as e:
        print(f"Error analyzing GitHub activity: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


app.include_router(router)

# if __name__ == "__main__":
#     import uvicorn

#     uvicorn.run(
#         "app.main:app",
#         host="localhost",
#         port=8000,
#         ssl_keyfile="certs/key.pem",
#         ssl_certfile="certs/cert.pem",
#         reload=True,
#     )
