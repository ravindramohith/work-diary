from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from datetime import datetime, timedelta
import os
import asyncpg
from ..security import decrypt_token
from openai import OpenAI
from anthropic import Anthropic

# OAuth 2.0 scopes for Google Calendar
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

# OAuth 2.0 redirect URI
GOOGLE_REDIRECT_URI = "https://localhost:8000/google-callback"


def create_oauth_flow():
    """Create OAuth flow for Google Calendar"""
    client_config = {
        "web": {
            "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "project_id": "silent-turbine-449207-s8",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "redirect_uris": [GOOGLE_REDIRECT_URI],
            "javascript_origins": ["https://localhost:8000", "http://localhost:3000"],
        }
    }

    return Flow.from_client_config(
        client_config, scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI
    )


async def get_calendar_service(user_id: int, db: asyncpg.Connection):
    """Get an authorized Google Calendar service"""
    user = await db.fetchrow(
        """
        SELECT google_refresh_token
        FROM users 
        WHERE id = $1
        """,
        user_id,
    )

    if not user or not user["google_refresh_token"]:
        raise Exception("Google Calendar not connected")

    refresh_token = decrypt_token(user["google_refresh_token"])

    creds = Credentials.from_authorized_user_info(
        {
            "refresh_token": refresh_token,
            "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "token_uri": "https://oauth2.googleapis.com/token",
        },
        SCOPES,
    )

    return build("calendar", "v3", credentials=creds)


async def analyze_calendar_activity(user_id: int, db: asyncpg.Connection):
    """Analyze user's calendar activity for the past 7 days"""
    try:
        service = await get_calendar_service(user_id, db)

        # Get events from the last 7 days
        now = datetime.utcnow()
        start_time = (now - timedelta(days=7)).isoformat() + "Z"
        end_time = now.isoformat() + "Z"

        events_result = (
            service.events()
            .list(
                calendarId="primary",
                timeMin=start_time,
                timeMax=end_time,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )

        events = events_result.get("items", [])

        # Analyze calendar data
        calendar_stats = {
            "total_meetings": len(events),
            "total_duration_minutes": 0,
            "meetings_after_hours": 0,  # Meetings after 5 PM
            "early_meetings": 0,  # Meetings before 9 AM
            "longest_meeting_duration": 0,
            "back_to_back_meetings": 0,
            "meeting_free_blocks": [],
            "meeting_details": [],  # Store meeting details for AI analysis
            "daily_meeting_counts": {},  # Track meetings per day
            "recurring_meetings": 0,  # Track recurring meetings
            "weekly_patterns": {  # Track meeting patterns by day of week
                "Monday": 0,
                "Tuesday": 0,
                "Wednesday": 0,
                "Thursday": 0,
                "Friday": 0,
                "Saturday": 0,
                "Sunday": 0,
            },
        }

        previous_end_time = None
        seen_recurring_meetings = set()  # Track recurring meeting IDs

        for event in events:
            # Skip events without timing information
            if "dateTime" not in event.get("start", {}) or "dateTime" not in event.get(
                "end", {}
            ):
                continue

            start = datetime.fromisoformat(
                event["start"]["dateTime"].replace("Z", "+00:00")
            )
            end = datetime.fromisoformat(
                event["end"]["dateTime"].replace("Z", "+00:00")
            )

            # Track daily counts
            day_key = start.strftime("%Y-%m-%d")
            calendar_stats["daily_meeting_counts"][day_key] = (
                calendar_stats["daily_meeting_counts"].get(day_key, 0) + 1
            )

            # Track weekly patterns
            day_name = start.strftime("%A")
            calendar_stats["weekly_patterns"][day_name] += 1

            # Track recurring meetings
            if event.get("recurringEventId"):
                recurring_id = event["recurringEventId"]
                if recurring_id not in seen_recurring_meetings:
                    seen_recurring_meetings.add(recurring_id)
                    calendar_stats["recurring_meetings"] += 1

            # Store meeting details for AI analysis
            calendar_stats["meeting_details"].append(
                {
                    "title": event.get("summary", "Untitled"),
                    "start_time": start.strftime("%H:%M"),
                    "end_time": end.strftime("%H:%M"),
                    "day": day_name,
                    "duration_minutes": (end - start).total_seconds() / 60,
                    "attendees": len(event.get("attendees", [])),
                    "description": event.get("description", ""),
                    "is_recurring": bool(event.get("recurringEventId")),
                }
            )

            # Calculate duration
            duration = (end - start).total_seconds() / 60  # in minutes
            calendar_stats["total_duration_minutes"] += duration

            # Track longest meeting
            calendar_stats["longest_meeting_duration"] = max(
                calendar_stats["longest_meeting_duration"], duration
            )

            # Check if meeting is after hours (after 5 PM)
            if start.hour >= 17:
                calendar_stats["meetings_after_hours"] += 1

            # Check if meeting is early (before 9 AM)
            if start.hour < 9:
                calendar_stats["early_meetings"] += 1

            # Check for back-to-back meetings
            if previous_end_time:
                gap = (start - previous_end_time).total_seconds() / 60
                if gap < 15:  # Less than 15 minutes between meetings
                    calendar_stats["back_to_back_meetings"] += 1
                else:
                    calendar_stats["meeting_free_blocks"].append(
                        {
                            "start": previous_end_time.isoformat(),
                            "end": start.isoformat(),
                            "duration_minutes": gap,
                        }
                    )

            previous_end_time = end

        # Calculate averages and additional metrics
        if calendar_stats["total_meetings"] > 0:
            calendar_stats["average_meeting_duration"] = (
                calendar_stats["total_duration_minutes"]
                / calendar_stats["total_meetings"]
            )
            calendar_stats["meetings_per_day"] = calendar_stats["total_meetings"] / 7

        # Use Anthropic for calendar pattern analysis
        anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        calendar_analysis = anthropic.messages.create(
            model="claude-3-sonnet-20240229",
            max_tokens=300,
            messages=[
                {
                    "role": "user",
                    "content": f"""
                    Analyze these calendar patterns for the past 7 days for potential burnout risk:
                    
                    Meeting Statistics:
                    - Total meetings: {calendar_stats['total_meetings']}
                    - Total duration: {calendar_stats['total_duration_minutes']} minutes
                    - Average meetings per day: {calendar_stats.get('meetings_per_day', 0):.1f}
                    - After-hours meetings: {calendar_stats['meetings_after_hours']}
                    - Early morning meetings: {calendar_stats['early_meetings']}
                    - Back-to-back meetings: {calendar_stats['back_to_back_meetings']}
                    - Average duration: {calendar_stats.get('average_meeting_duration', 0):.1f} minutes
                    - Longest meeting: {calendar_stats['longest_meeting_duration']} minutes
                    - Recurring meetings: {calendar_stats['recurring_meetings']}
                    
                    Weekly Pattern:
                    {chr(10).join([f"- {day}: {count} meetings" for day, count in calendar_stats['weekly_patterns'].items()])}
                    
                    Daily Meeting Counts:
                    {chr(10).join([f"- {date}: {count} meetings" for date, count in calendar_stats['daily_meeting_counts'].items()])}
                    
                    Meeting Details:
                    {chr(10).join([
                        f"- {meeting['title']}: {meeting['day']} {meeting['start_time']}-{meeting['end_time']} ({meeting['duration_minutes']} min, {meeting['attendees']} attendees){' (Recurring)' if meeting['is_recurring'] else ''}"
                        for meeting in calendar_stats['meeting_details']
                    ])}

                    Return a JSON response analyzing burnout risk and meeting load:
                    {{
                        "risk_score": 0.7,
                        "key_insights": [
                            "First insight about weekly meeting patterns",
                            "Second insight about meeting distribution",
                            "Third insight about potential risks"
                        ],
                        "schedule_pattern": "A brief description of their weekly meeting schedule",
                        "time_management_insights": [
                            "First insight about time management",
                            "Second insight about meeting spacing"
                        ],
                        "recommendations": [
                            "First specific recommendation",
                            "Second actionable suggestion"
                        ]
                    }}
                    """,
                }
            ],
        )

        # Use OpenAI for detailed schedule optimization analysis
        openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        schedule_analysis = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "user",
                    "content": f"""
                    Analyze these calendar patterns for schedule optimization and productivity insights:
                    
                    Meeting Statistics:
                    - Total meetings: {calendar_stats['total_meetings']}
                    - Total duration: {calendar_stats['total_duration_minutes']} minutes
                    - Average meetings per day: {calendar_stats.get('meetings_per_day', 0):.1f}
                    - After-hours meetings: {calendar_stats['meetings_after_hours']}
                    - Early morning meetings: {calendar_stats['early_meetings']}
                    - Back-to-back meetings: {calendar_stats['back_to_back_meetings']}
                    - Average duration: {calendar_stats.get('average_meeting_duration', 0):.1f} minutes
                    - Recurring meetings: {calendar_stats['recurring_meetings']}
                    
                    Weekly Pattern:
                    {chr(10).join([f"- {day}: {count} meetings" for day, count in calendar_stats['weekly_patterns'].items()])}
                    
                    Meeting Details:
                    {chr(10).join([
                        f"- {meeting['title']}: {meeting['day']} {meeting['start_time']}-{meeting['end_time']} ({meeting['duration_minutes']} min, {meeting['attendees']} attendees){' (Recurring)' if meeting['is_recurring'] else ''}"
                        for meeting in calendar_stats['meeting_details']
                    ])}

                    Return a JSON response focusing on schedule optimization:
                    {{
                        "productivity_score": 0.8,
                        "schedule_insights": [
                            "First insight about meeting efficiency",
                            "Second insight about focus time blocks",
                            "Third insight about meeting distribution"
                        ],
                        "focus_time_analysis": {{
                            "available_focus_blocks": "Analysis of available focus time",
                            "best_focus_hours": ["Time slots best for focused work"],
                            "meeting_free_days": ["Days with fewer meetings"]
                        }},
                        "optimization_suggestions": [
                            "First suggestion for schedule optimization",
                            "Second suggestion for better time management",
                            "Third suggestion for meeting efficiency"
                        ],
                        "meeting_patterns": {{
                            "peak_meeting_times": "Analysis of when most meetings occur",
                            "ideal_meeting_blocks": "Suggested time blocks for meetings",
                            "protected_time_blocks": "Recommended times to protect for focus work"
                        }}
                    }}
                    """,
                }
            ],
        )

        # Combine both analyses
        calendar_stats["ai_analysis"] = {
            "burnout_risk": calendar_analysis.content,
            "schedule_optimization": schedule_analysis.choices[0].message.content,
        }

        return calendar_stats

    except Exception as e:
        print(f"Error analyzing calendar activity: {str(e)}")
        raise e
