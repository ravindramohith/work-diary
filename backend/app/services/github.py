import os
from datetime import datetime, timedelta, timezone
import httpx
from anthropic import Anthropic
from openai import OpenAI
from ..security import decrypt_token


async def analyze_github_activity(user_id: int, db, days: int = 7):
    """Analyze GitHub activity for the specified number of days using AI"""
    # Get user's GitHub token
    github_data = await db.fetchrow(
        """
        SELECT github_username, github_access_token
        FROM users
        WHERE id = $1
        """,
        user_id,
    )

    if not github_data or not github_data["github_access_token"]:
        raise ValueError("GitHub not connected")

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
            "event_details": [],
        }

        # Set timezone to IST
        ist = timezone(timedelta(hours=5, minutes=30))

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
                    activity_stats["active_repos"].add(event["repo"]["name"])

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

                # Store event details for AI analysis
                event_details = {
                    "type": event_type,
                    "repo": event["repo"]["name"],
                    "created_at": event_date.strftime("%Y-%m-%d %H:%M:%S"),
                }

                # Add minimal essential payload info based on event type
                if event_type == "PushEvent":
                    event_details["commit_count"] = len(
                        event["payload"].get("commits", [])
                    )
                    if event["payload"].get("commits"):
                        event_details["commit_message"] = event["payload"]["commits"][
                            0
                        ].get("message", "")
                elif event_type == "PullRequestEvent":
                    pr_payload = event["payload"].get("pull_request", {})
                    event_details["action"] = event["payload"].get("action")
                    event_details["title"] = pr_payload.get("title")
                elif event_type == "IssuesEvent":
                    event_details["action"] = event["payload"].get("action")
                    event_details["title"] = (
                        event["payload"].get("issue", {}).get("title")
                    )
                elif event_type in [
                    "IssueCommentEvent",
                    "PullRequestReviewCommentEvent",
                ]:
                    event_details["action"] = event["payload"].get("action")

                activity_stats["event_details"].append(event_details)

        # Convert active_repos to list for JSON serialization
        activity_stats["active_repos"] = list(activity_stats["active_repos"])

        # Use Anthropic to analyze activity patterns
        anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        activity_analysis = anthropic.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=300,
            messages=[
                {
                    "role": "user",
                    "content": f"""
                Analyze these GitHub activity patterns for potential burnout risk and work-life balance:
                
                Past {days} days activity:
                - Total commits: {activity_stats['commit_count']}
                - Pull requests: {activity_stats['pr_count']}
                - Code reviews: {activity_stats['review_count']}
                - Issues: {activity_stats['issue_count']}
                - Comments: {activity_stats['comment_count']}
                - Active repositories: {len(activity_stats['active_repos'])}
                
                Daily activity pattern:
                {activity_stats['events_by_day']}
                
                Provide a brief analysis focusing on:
                1. Work intensity and potential burnout risks
                2. Code review and collaboration patterns
                3. Suggestions for better work-life balance
                """,
                }
            ],
        )

        # Use OpenAI to analyze code complexity and quality trends
        openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        code_analysis = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": f"""
                Analyze the following GitHub activity details for code quality and complexity patterns:
                
                Event details:
                {activity_stats['event_details']}
                
                Active repositories:
                {activity_stats['active_repos']}
                
                Provide insights on:
                1. Code complexity trends
                2. Quality of contributions
                3. Areas for potential improvement
                """,
                }
            ],
        )

        return {
            "stats": activity_stats,
            "activity_analysis": activity_analysis.content[0].text,
            "code_analysis": code_analysis.choices[0].message.content,
        }
