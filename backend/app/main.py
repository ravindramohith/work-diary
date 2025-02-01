from fastapi import FastAPI, Depends, APIRouter, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta, datetime, timezone
from app.database import get_db
from .services.github import analyze_github_activity
from .auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_password_hash,
)
from .security import encrypt_token, decrypt_token
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
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List
from openai import OpenAI
from collections import defaultdict
import pytz
import json

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
    try:
        # Check for existing user
        existing_user = await db.fetchrow(
            "SELECT * FROM users WHERE email = $1", user.email
        )
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

        # Hash password
        try:
            hashed_password = get_password_hash(user.password)
        except Exception as e:
            print(f"Password hashing error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error processing password",
            )

        # Insert new user
        try:
            new_user = await db.fetchrow(
                """
                INSERT INTO users (email, name, hashed_password) 
                VALUES ($1, $2, $3)
                RETURNING id, email, name, disabled, created_at, 
                        slack_user_id, slack_team_id, google_calendar_connected,
                        github_user_id, github_username
                """,
                user.email,
                user.name,
                hashed_password,
            )
        except Exception as e:
            print(f"Database insertion error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error creating user in database",
            )

        if not new_user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="User creation failed",
            )

        # Convert to UserDB model
        try:
            user_dict = dict(new_user)
            return UserDB(**user_dict)
        except Exception as e:
            print(f"Model conversion error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error processing user data",
            )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error during signup: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred, {str(e)}",
        )


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

    # Check if account is disabled
    if user["disabled"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
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
        SELECT id, email, name, slack_user_id, slack_team_id 
        FROM users WHERE email = $1
        """,
        user["email"],
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "email": complete_user["email"],
            "name": complete_user["name"],
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
                    "role": "system",
                    "content": """You are a work-life balance analyst. Your responses should:
                    1. Include specific numbers and percentages from the data
                    2. Provide actionable, measurable suggestions
                    3. Be encouraging and supportive
                    4. Use emojis appropriately
                    5. End with a motivational sign-off message
                    
                    When analyzing patterns:
                    - Provide 3-6 detailed key patterns based on available data
                    - Focus on time-based patterns (peak hours, quiet periods)
                    - Include communication style metrics (response times, thread engagement)
                    - Highlight collaboration patterns (team interactions, cross-channel activity)
                    - If Calendar/GitHub is missing, provide more detailed Slack insights instead
                    - Each pattern should be data-rich with specific numbers and percentages""",
                },
                {
                    "role": "user",
                    "content": f"""
                    Based on the following analyses, generate a structured work-life balance analysis in JSON format.
                    The format should follow this exact structure, with emphasis on data-driven insights:
                    {{
                        "greeting": "Hi [Name]! 👋",
                        "key_patterns": [
                            // Provide 3-6 of the most relevant patterns from below based on available data:

                            // Core Slack Patterns (Always include at least 2):
                            "Communication Peak: [X%] of your Slack activity occurs between [specific time]-[specific time], with [Y] messages per hour during this period",
                            "Message Distribution: [X] messages per day, with [Y%] in public channels and [Z%] in direct messages",
                            "Response Behavior: Average response time of [X] minutes, with [Y%] of responses within 5 minutes",
                            "Thread Engagement: [X] thread participations with [Y] average replies, [Z%] leading to meaningful discussions",

                            // If Calendar is connected:
                            "Meeting Load: [X] meetings per week, averaging [Y] minutes each, with [Z%] during peak productivity hours",
                            "Meeting Patterns: [X%] of meetings are recurring, [Y%] are one-on-ones, with [Z] hours of focus time between meetings",

                            // If GitHub is connected:
                            "Code Activity: [X] commits and [Y] PR reviews across [Z] repositories, with [W%] during core hours",
                            "Collaboration Style: [X] comments per PR, [Y] reviews requested, average review time of [Z] hours",

                            // Additional Slack Insights (use if other services not connected):
                            "Channel Activity: Most active in [X] channels with [Y] messages per day in each",
                            "Team Interaction: Connected with [X] team members across [Y] channels, [Z] average interactions per day",
                            "Focus Periods: [X] uninterrupted work blocks of [Y] minutes on average",
                            "After-hours Pattern: [X%] of activity outside core hours, primarily between [time] and [time]"
                        ],
                        "working_well": [
                            "point1 with specific metrics and time references",
                            "point2 with specific metrics and time references",
                            "point3 with specific metrics and time references"
                        ],
                        "opportunity_areas": [
                            "specific suggestion 1 with target numbers and timeframes",
                            "specific suggestion 2 with target numbers and timeframes",
                            "specific suggestion 3 with target numbers and timeframes"
                        ],
                        "weekly_goal": {{
                            "title": "Your data-driven goals for next week:",
                            "steps": [
                                "Measurable goal 1 with specific target numbers and timeline",
                                "Measurable goal 2 with specific target numbers and timeline",
                                "Measurable goal 3 with specific target numbers and timeline"
                            ]
                        }},
                        "sign_off": "Choose one of these styles with a relevant emoji:
                            1. 'Remember: Your [X%] response rate during [specific time] shows you're on the right track! Keep it up! ⭐'
                            2. 'Small adjustments to your [specific pattern with numbers] can make a big difference. You've got this! 🌟'
                            3. 'You're already showing great progress with [specific metric] increasing by [X%]. Let's build on that! 💪'"
                    }}

                    Analyses to consider:
                    Slack Analysis: {analyses.slack_analysis}
                    Calendar Analysis: {analyses.calendar_analysis if analyses.calendar_analysis else calendar_placeholder}
                    GitHub Analysis: {analyses.github_analysis if analyses.github_analysis else github_placeholder}

                    Important Notes:
                    1. ALWAYS include specific numbers, percentages, and times in every point
                    2. If Calendar/GitHub data is missing, provide more detailed Slack insights instead
                    3. Focus on patterns that show both positive trends and areas for improvement
                    4. Include at least one collaboration metric in key patterns
                    5. All time references must use "X:XX AM/PM" format
                    6. When a service is not connected, do not mention its absence in key patterns
                    7. Use Slack data to provide rich insights about work patterns even when other services are missing
                    8. Include specific time ranges and peak activity periods
                    9. Highlight team collaboration metrics from available data
                    10. Focus on actionable patterns that can influence work-life balance

                    Make each point concise, actionable, and specific to the user's actual data.
                    Focus on work-life balance, productivity, and well-being.
                    Use emoji in the text where appropriate.
                    """,
                },
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

{analysis_dict['sign_off']}
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


class UserUpdate(BaseModel):
    name: str | None = None
    password: str | None = None


@router.put("/users/me", response_model=UserDB)
async def update_user(
    user_update: UserUpdate,
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    try:
        # Prepare update fields
        update_fields = []
        params = []
        param_count = 1

        if user_update.name is not None:
            update_fields.append(f"name = ${param_count}")
            params.append(user_update.name)
            param_count += 1

        if user_update.password is not None:
            update_fields.append(f"hashed_password = ${param_count}")
            params.append(get_password_hash(user_update.password))
            param_count += 1

        if not update_fields:
            return current_user

        # Add user ID as the last parameter
        params.append(current_user.id)

        # Update user information
        updated_user = await db.fetchrow(
            f"""
            UPDATE users 
            SET {", ".join(update_fields)}
            WHERE id = ${param_count}
            RETURNING id, email, name, disabled, created_at, 
                    slack_user_id, slack_team_id, google_calendar_connected,
                    github_user_id, github_username
            """,
            *params,
        )

        return UserDB(**dict(updated_user))
    except Exception as e:
        print(f"Error updating user: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user",
        )


@router.post("/disconnect-slack")
async def disconnect_slack(
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Disconnect Slack integration"""
    try:
        await db.execute(
            """
            UPDATE users 
            SET 
                slack_user_id = NULL,
                slack_access_token = NULL,
                slack_bot_token = NULL,
                slack_team_id = NULL
            WHERE id = $1
            """,
            current_user.id,
        )
        return {"status": "success", "message": "Slack disconnected successfully"}
    except Exception as e:
        print(f"Error disconnecting Slack: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to disconnect Slack",
        )


@router.post("/disconnect-google")
async def disconnect_google(
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Disconnect Google Calendar integration"""
    try:
        await db.execute(
            """
            UPDATE users 
            SET 
                google_refresh_token = NULL,
                google_calendar_connected = false
            WHERE id = $1
            """,
            current_user.id,
        )
        return {
            "status": "success",
            "message": "Google Calendar disconnected successfully",
        }
    except Exception as e:
        print(f"Error disconnecting Google Calendar: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to disconnect Google Calendar",
        )


@router.post("/disconnect-github")
async def disconnect_github(
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Disconnect GitHub integration"""
    try:
        await db.execute(
            """
            UPDATE users 
            SET 
                github_user_id = NULL,
                github_username = NULL,
                github_access_token = NULL
            WHERE id = $1
            """,
            current_user.id,
        )
        return {"status": "success", "message": "GitHub disconnected successfully"}
    except Exception as e:
        print(f"Error disconnecting GitHub: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to disconnect GitHub",
        )


@app.get("/slack/activity")
async def get_slack_activity(
    days: int = Query(default=7, ge=1, le=90),
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    if not current_user.slack_user_id:
        raise HTTPException(status_code=400, detail="Slack account not connected")

    try:
        # Get encrypted tokens from database
        tokens = await db.fetchrow(
            "SELECT slack_access_token FROM users WHERE id = $1", current_user.id
        )

        if not tokens or not tokens["slack_access_token"]:
            raise HTTPException(status_code=400, detail="Slack tokens not found")

        # Initialize Slack client with user token instead of bot token
        user_token = decrypt_token(tokens["slack_access_token"])
        client = WebClient(token=user_token)

        # Calculate the date range
        end_date = datetime.now(pytz.UTC)
        start_date = end_date - timedelta(days=days)

        # Initialize data structures
        messages_by_day = defaultdict(int)
        work_hours_count = 0
        after_hours_count = 0
        channel_distribution = defaultdict(int)
        weekday_count = 0
        weekend_count = 0
        daily_active_hours = defaultdict(set)
        response_times_by_hour = defaultdict(list)  # New structure for response times
        last_received_message = {}  # Track last received message per channel

        # Get list of all channels the user is part of
        conversations_response = client.users_conversations(
            user=current_user.slack_user_id,
            types="public_channel,private_channel,mpim,im",
            exclude_archived=True,
            limit=1000,
        )

        for conv in conversations_response["channels"]:
            try:
                # Get messages from each channel
                messages_response = client.conversations_history(
                    channel=conv["id"],
                    oldest=start_date.timestamp(),
                    latest=end_date.timestamp(),
                    limit=1000,  # Increased limit to get more messages
                )

                # Get channel name for context
                channel_name = conv.get(
                    "name", "DM" if conv.get("is_im") else "private-channel"
                )

                # Sort messages by timestamp
                all_messages = messages_response.get("messages", [])
                all_messages.sort(key=lambda x: float(x["ts"]))

                for i, msg in enumerate(all_messages):
                    msg_time = datetime.fromtimestamp(float(msg["ts"]), pytz.UTC)

                    # Skip messages outside our date range
                    if msg_time < start_date or msg_time > end_date:
                        continue

                    # If this is a message TO the user
                    if msg.get("user") != current_user.slack_user_id:
                        last_received_message[conv["id"]] = msg
                        continue

                    # If this is a message FROM the user
                    if msg.get("user") == current_user.slack_user_id:
                        # Daily message count and other metrics
                        day = msg_time.date().isoformat()
                        messages_by_day[day] += 1

                        hour = msg_time.hour
                        if 9 <= hour <= 17:
                            work_hours_count += 1
                        else:
                            after_hours_count += 1

                        channel_distribution[channel_name] += 1

                        if msg_time.weekday() < 5:
                            weekday_count += 1
                        else:
                            weekend_count += 1

                        daily_active_hours[day].add(hour)

                        # Calculate response time if there was a previous message to respond to
                        last_msg = last_received_message.get(conv["id"])
                        if last_msg:
                            last_msg_time = datetime.fromtimestamp(
                                float(last_msg["ts"]), pytz.UTC
                            )

                            # Only calculate response time if messages are within 24 hours
                            time_diff = (msg_time - last_msg_time).total_seconds()
                            if time_diff <= 86400:  # 24 hours in seconds
                                response_time = time_diff / 60  # Convert to minutes
                                response_times_by_hour[last_msg_time.hour].append(
                                    response_time
                                )

                            # Clear the last received message since we've responded
                            last_received_message[conv["id"]] = None

            except Exception as e:
                print(f"Error fetching messages from channel {channel_name}: {str(e)}")
                continue

        # Calculate average response times by hour with better handling
        avg_response_times = []
        for hour in range(24):
            times = response_times_by_hour[hour]
            if times:
                # Remove outliers (responses > 4 hours)
                filtered_times = [t for t in times if t <= 240]
                if filtered_times:
                    avg_time = sum(filtered_times) / len(filtered_times)
                else:
                    avg_time = 0  # Default to 0 minutes if all responses were outliers
            else:
                # If no data for this hour, interpolate from adjacent hours
                prev_hour = (hour - 1) % 24
                next_hour = (hour + 1) % 24
                prev_times = response_times_by_hour[prev_hour]
                next_times = response_times_by_hour[next_hour]

                if prev_times or next_times:
                    all_adjacent_times = prev_times + next_times
                    filtered_times = [t for t in all_adjacent_times if t <= 240]
                    avg_time = (
                        sum(filtered_times) / len(filtered_times)
                        if filtered_times
                        else 30
                    )
                else:
                    avg_time = 30  # Default when no data available

            avg_response_times.append(
                {
                    "hour": hour,
                    "avgResponseTime": round(avg_time, 2),
                    "messageCount": len(times),
                }
            )

        # Format the response data
        response = {
            "messagesByDay": [
                {"date": date, "count": count}
                for date, count in sorted(messages_by_day.items())
            ],
            "workHoursVsAfterHours": [
                {"name": "Work Hours (9-5)", "messages": work_hours_count},
                {"name": "After Hours", "messages": after_hours_count},
            ],
            "channelDistribution": [
                {"name": channel, "value": count}
                for channel, count in sorted(
                    channel_distribution.items(), key=lambda x: x[1], reverse=True
                )[
                    :5
                ]  # Top 5 channels
            ],
            "responseTimesByHour": avg_response_times,
            "weekdayVsWeekend": [
                {"name": "Weekdays", "messages": weekday_count},
                {"name": "Weekends", "messages": weekend_count},
            ],
            "dailyActiveHours": [
                {"date": date, "hours": len(hours)}
                for date, hours in sorted(daily_active_hours.items())
            ],
        }

        return response

    except Exception as e:
        print(f"Error fetching Slack activity: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch Slack activity: {str(e)}"
        )


@app.get("/github/activity")
async def get_github_activity(
    days: int = Query(default=7, ge=1, le=90),
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Get GitHub activity data for visualization"""
    if not current_user.github_user_id:
        raise HTTPException(status_code=400, detail="GitHub account not connected")

    try:
        # Get user's GitHub token
        github_data = await db.fetchrow(
            """
            SELECT github_username, github_access_token
            FROM users
            WHERE id = $1
            """,
            current_user.id,
        )

        if not github_data or not github_data["github_access_token"]:
            raise HTTPException(status_code=400, detail="GitHub tokens not found")

        access_token = decrypt_token(github_data["github_access_token"])
        username = github_data["github_username"]

        # Calculate date range
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)

        async with httpx.AsyncClient() as client:
            # Get user's events
            events_response = await client.get(
                f"https://api.github.com/users/{username}/events",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            events = events_response.json()

            # Collect activity stats
            activity_stats = {
                "commit_count": 0,
                "pr_count": 0,
                "review_count": 0,
                "issue_count": 0,
                "comment_count": 0,
                "active_repos": set(),
                "events_by_day": {},
                "language_distribution": {},  # New field for language stats
            }

            # Set timezone to IST
            ist = timezone(timedelta(hours=5, minutes=30))

            # Track unique repositories to fetch their languages
            unique_repos = set()

            for event in events:
                # Convert event time to IST
                event_utc = datetime.strptime(
                    event["created_at"], "%Y-%m-%dT%H:%M:%SZ"
                ).replace(tzinfo=timezone.utc)
                event_date = event_utc.astimezone(ist)

                if start_date <= event_date <= end_date:
                    event_type = event["type"]
                    day = event_date.strftime("%Y-%m-%d")

                    if day not in activity_stats["events_by_day"]:
                        activity_stats["events_by_day"][day] = {}

                    if event_type not in activity_stats["events_by_day"][day]:
                        activity_stats["events_by_day"][day][event_type] = 0

                    activity_stats["events_by_day"][day][event_type] += 1

                    if "repo" in event:
                        repo_name = event["repo"]["name"]
                        activity_stats["active_repos"].add(repo_name)
                        unique_repos.add(repo_name)

                    # Track specific event types
                    if event_type == "PushEvent":
                        activity_stats["commit_count"] += len(
                            event["payload"].get("commits", [])
                        )
                    elif event_type == "PullRequestEvent":
                        activity_stats["pr_count"] += 1
                    elif event_type == "PullRequestReviewEvent":
                        activity_stats["review_count"] += 1
                    elif event_type == "IssuesEvent":
                        activity_stats["issue_count"] += 1
                    elif event_type in [
                        "IssueCommentEvent",
                        "CommitCommentEvent",
                        "PullRequestReviewCommentEvent",
                    ]:
                        activity_stats["comment_count"] += 1

            # Fetch languages for each active repository
            for repo in unique_repos:
                try:
                    # First get the repository details to handle redirects
                    repo_response = await client.get(
                        f"https://api.github.com/repos/{repo}",
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Accept": "application/vnd.github.v3+json",
                        },
                        follow_redirects=True,
                    )

                    if repo_response.status_code != 200:
                        print(
                            f"Error accessing repo {repo}: {repo_response.status_code}"
                        )
                        continue

                    repo_data = repo_response.json()
                    if repo_data.get("private", False):
                        # Skip private repositories
                        continue

                    languages_response = await client.get(
                        f"https://api.github.com/repos/{repo}/languages",
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Accept": "application/vnd.github.v3+json",
                        },
                        follow_redirects=True,
                    )

                    if languages_response.status_code != 200:
                        print(
                            f"Error fetching languages for repo {repo}: {languages_response.status_code}"
                        )
                        continue

                    languages = languages_response.json()
                    if not isinstance(languages, dict):
                        print(f"Invalid language data for repo {repo}: {languages}")
                        continue

                    # Add language bytes to distribution with proper type conversion
                    for language, bytes_count in languages.items():
                        try:
                            if language not in activity_stats["language_distribution"]:
                                activity_stats["language_distribution"][language] = 0
                            # Convert bytes_count to integer, handling any string format
                            if isinstance(bytes_count, str):
                                bytes_count = int(bytes_count.replace(",", ""))
                            elif isinstance(bytes_count, (int, float)):
                                bytes_count = int(bytes_count)
                            else:
                                print(
                                    f"Invalid bytes count format for {language}: {bytes_count}"
                                )
                                continue
                            activity_stats["language_distribution"][
                                language
                            ] += bytes_count
                        except (ValueError, TypeError) as e:
                            print(
                                f"Error processing language {language} in repo {repo}: {str(e)}"
                            )
                            continue
                except Exception as e:
                    print(f"Error processing repo {repo}: {str(e)}")
                    continue

            # Convert language distribution to percentage
            total_bytes = sum(activity_stats["language_distribution"].values())
            if total_bytes > 0:
                language_percentages = {
                    lang: (bytes_count / total_bytes) * 100
                    for lang, bytes_count in activity_stats[
                        "language_distribution"
                    ].items()
                }
                # Sort languages by percentage and take top 10
                sorted_languages = sorted(
                    language_percentages.items(), key=lambda x: x[1], reverse=True
                )[:10]
                # Format for frontend
                activity_stats["language_distribution"] = [
                    {"name": lang, "value": round(percentage, 2)}
                    for lang, percentage in sorted_languages
                ]
            else:
                activity_stats["language_distribution"] = []

            # Convert active_repos to list for JSON serialization
            activity_stats["active_repos"] = list(activity_stats["active_repos"])

            return activity_stats

    except Exception as e:
        print(f"Error fetching GitHub activity: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch GitHub activity: {str(e)}"
        )


@router.get("/github/code-quality")
async def get_code_quality_insights(
    days: int = Query(default=7, ge=1, le=90),
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Get AI-powered code quality insights from GitHub activity"""
    if not current_user.github_user_id:
        raise HTTPException(status_code=400, detail="GitHub account not connected")

    try:
        # Get user's GitHub token
        github_data = await db.fetchrow(
            """
            SELECT github_username, github_access_token
            FROM users
            WHERE id = $1
            """,
            current_user.id,
        )

        if not github_data or not github_data["github_access_token"]:
            raise HTTPException(status_code=400, detail="GitHub tokens not found")

        access_token = decrypt_token(github_data["github_access_token"])
        username = github_data["github_username"]

        async with httpx.AsyncClient() as client:
            # Get user's recent commits
            commits_response = await client.get(
                f"https://api.github.com/users/{username}/events",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            events = commits_response.json()

            # Filter push events and get commit details
            commit_messages = []
            code_changes = []

            for event in events:
                if event["type"] == "PushEvent":
                    for commit in event["payload"].get("commits", []):
                        commit_messages.append(commit.get("message", ""))

                        # Get detailed commit info including diff
                        if "url" in commit:
                            try:
                                commit_detail = await client.get(
                                    commit["url"],
                                    headers={
                                        "Authorization": f"Bearer {access_token}",
                                        "Accept": "application/vnd.github.v3+json",
                                    },
                                )
                                if commit_detail.status_code == 200:
                                    commit_data = commit_detail.json()
                                    if "files" in commit_data:
                                        for file in commit_data["files"]:
                                            if "patch" in file:
                                                code_changes.append(
                                                    {
                                                        "file": file["filename"],
                                                        "changes": file["patch"],
                                                    }
                                                )
                            except Exception as e:
                                print(f"Error fetching commit details: {str(e)}")
                                continue

            # Use OpenAI to analyze code quality
            openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

            analysis_prompt = f"""Analyze the following GitHub activity and provide code quality insights:

Commit Messages:
{chr(10).join(commit_messages[:10])}  # Limit to last 10 commits

Code Changes Samples:
{chr(10).join([f"File: {change['file']}\nChanges:\n{change['changes']}" for change in code_changes[:5]])}  # Limit to 5 files

Please provide analysis in the following JSON format:
{{
    "commit_quality": {{
        "score": "1-10 rating of commit message quality",
        "strengths": ["list of good practices observed"],
        "improvements": ["list of suggested improvements"]
    }},
    "code_quality": {{
        "score": "1-10 rating of code quality",
        "strengths": ["list of good practices observed"],
        "improvements": ["list of suggested improvements"]
    }},
    "best_practices": {{
        "followed": ["list of best practices being followed"],
        "suggested": ["list of best practices to adopt"]
    }},
    "summary": "A brief summary of overall code quality and suggestions"
}}
"""

            response = openai.chat.completions.create(
                model="gpt-4o",
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": "You are a code quality analyst. Analyze GitHub activity and provide constructive feedback on code quality, commit messages, and development practices.",
                    },
                    {"role": "user", "content": analysis_prompt},
                ],
            )

            return json.loads(response.choices[0].message.content)

    except Exception as e:
        print(f"Error analyzing code quality: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to analyze code quality: {str(e)}"
        )


@app.get("/calendar/activity")
async def get_calendar_activity(
    days: int = Query(default=7, ge=1, le=90),
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    """Get calendar activity data for visualization"""
    if not current_user.google_calendar_connected:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    try:
        from .services.calendar import get_calendar_activity_stats

        return await get_calendar_activity_stats(current_user.id, db, days)
    except Exception as e:
        print(f"Error fetching calendar activity: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch calendar activity: {str(e)}"
        )


@app.put("/disable-account")
async def disable_account(
    current_user: UserDB = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    await db.execute("UPDATE users SET disabled = true WHERE id = $1", current_user.id)
    return {"message": "Account disabled successfully"}


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
