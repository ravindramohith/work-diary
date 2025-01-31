import os, asyncpg
from slack_sdk import WebClient
from datetime import datetime, timedelta
from ..security import decrypt_token
from openai import OpenAI
from anthropic import Anthropic
from .calendar import analyze_calendar_activity
from .github import analyze_github_activity


async def analyze_slack_activity(user_id: int, db: asyncpg.Connection):
    """Fetch and analyze user's Slack activity in real-time"""
    user = await db.fetchrow(
        """
        SELECT slack_user_id, slack_access_token, slack_bot_token 
        FROM users 
        WHERE id = $1
        """,
        user_id,
    )
    if not user["slack_access_token"] or not user["slack_bot_token"]:
        raise Exception("Slack not connected")

    # Use user token for API calls since we're reading their messages
    user_token = decrypt_token(user["slack_access_token"])
    client = WebClient(token=user_token)

    try:
        # Get user's Slack profile info
        user_info = client.users_info(user=user["slack_user_id"])["user"]
        user_profile = {
            "real_name": user_info["profile"].get("real_name", ""),
            "display_name": user_info["profile"].get("display_name", ""),
            "first_name": user_info["profile"].get("first_name", ""),
            "email": user_info["profile"].get("email", ""),
            "title": user_info["profile"].get("title", ""),
            "status_text": user_info["profile"].get("status_text", ""),
            "status_emoji": user_info["profile"].get("status_emoji", ""),
        }

        # Get all conversations including DMs
        conversations = client.users_conversations(
            user=user["slack_user_id"],
            types="public_channel,private_channel,mpim,im",
            exclude_archived=True,
            limit=1000,
        )

        # Initialize metrics
        total_messages = 0
        dm_messages = 0
        channel_messages = 0
        after_hours_messages = 0
        response_times = []

        # Initialize thread metrics
        thread_stats = {
            "total_threads": 0,
            "threads_initiated": 0,
            "thread_replies": 0,
            "avg_thread_length": 0,
            "long_threads": 0,  # Threads with > 5 messages
            "thread_depths": [],  # List of thread lengths
            "threads_by_channel": {},  # Thread activity by channel
            "deep_discussions": [],  # Threads with significant engagement
        }

        # Initialize time-based metrics
        daily_breakdown = {
            "Monday": 0,
            "Tuesday": 0,
            "Wednesday": 0,
            "Thursday": 0,
            "Friday": 0,
            "Saturday": 0,
            "Sunday": 0,
        }
        hourly_heatmap = {str(hour).zfill(2): 0 for hour in range(24)}
        daily_messages = {}  # Format: {'YYYY-MM-DD': [messages]}
        channel_messages_content = {}  # Format: {'channel_name': [messages]}

        # Last 7 days timestamp
        week_ago = (datetime.now() - timedelta(days=7)).timestamp()

        # Analyze each conversation
        for conv in conversations["channels"]:
            try:
                # Get conversation history
                messages = client.conversations_history(
                    channel=conv["id"], oldest=week_ago, limit=1000
                )["messages"]

                # Get channel name for context
                channel_name = conv.get(
                    "name", "DM" if conv.get("is_im") else "private-channel"
                )

                # Initialize thread stats for this channel
                if channel_name not in thread_stats["threads_by_channel"]:
                    thread_stats["threads_by_channel"][channel_name] = {
                        "total_threads": 0,
                        "initiated_threads": 0,
                        "avg_thread_length": 0,
                        "deep_discussions": 0,
                    }

                # Filter user's messages
                user_messages = [
                    m for m in messages if m.get("user") == user["slack_user_id"]
                ]

                # Count messages based on conversation type
                if conv.get("is_im") or conv.get("is_mpim"):
                    dm_messages += len(user_messages)
                else:
                    channel_messages += len(user_messages)

                total_messages += len(user_messages)

                # Analyze threads
                thread_messages = [m for m in messages if m.get("thread_ts")]
                for msg in thread_messages:
                    thread_ts = msg.get("thread_ts")

                    # Only analyze each thread once
                    if thread_ts == msg["ts"]:  # This is the thread starter
                        replies = client.conversations_replies(
                            channel=conv["id"], ts=thread_ts
                        )["messages"]

                        thread_length = len(replies)
                        user_replies = [
                            r for r in replies if r.get("user") == user["slack_user_id"]
                        ]

                        thread_stats["total_threads"] += 1
                        thread_stats["thread_depths"].append(thread_length)

                        if thread_length > 5:
                            thread_stats["long_threads"] += 1

                        # Check if user started the thread
                        if msg.get("user") == user["slack_user_id"]:
                            thread_stats["threads_initiated"] += 1
                            thread_stats["threads_by_channel"][channel_name][
                                "initiated_threads"
                            ] += 1

                        # Count user's replies in this thread
                        thread_stats["thread_replies"] += len(user_replies)

                        # Track deep discussions (threads with >5 messages and user participated significantly)
                        if thread_length > 5 and len(user_replies) > 2:
                            thread_info = {
                                "channel": channel_name,
                                "length": thread_length,
                                "user_participation": len(user_replies),
                                "timestamp": msg["ts"],
                                "topic": msg.get("text", "")[
                                    :100
                                ],  # First 100 chars of thread starter
                            }
                            thread_stats["deep_discussions"].append(thread_info)
                            thread_stats["threads_by_channel"][channel_name][
                                "deep_discussions"
                            ] += 1

                # Analyze message timing and content
                for msg in user_messages:
                    msg_datetime = datetime.fromtimestamp(float(msg["ts"]))
                    msg_text = msg.get("text", "")

                    # Update daily breakdown
                    day_name = msg_datetime.strftime("%A")
                    daily_breakdown[day_name] += 1

                    # Update hourly heatmap
                    hour = msg_datetime.strftime("%H")
                    hourly_heatmap[hour] += 1

                    # Store message content for sentiment analysis
                    msg_date = msg_datetime.strftime("%Y-%m-%d")
                    if msg_date not in daily_messages:
                        daily_messages[msg_date] = []
                    daily_messages[msg_date].append(msg_text)

                    if channel_name not in channel_messages_content:
                        channel_messages_content[channel_name] = []
                    channel_messages_content[channel_name].append(msg_text)

                    # Count after-hours messages
                    if not (9 <= msg_datetime.hour < 17):
                        after_hours_messages += 1

            except Exception as e:
                print(f"Error analyzing conversation {conv['id']}: {str(e)}")
                continue

        # Calculate thread averages
        if thread_stats["total_threads"] > 0:
            thread_stats["avg_thread_length"] = sum(
                thread_stats["thread_depths"]
            ) / len(thread_stats["thread_depths"])
            for channel in thread_stats["threads_by_channel"]:
                channel_threads = thread_stats["threads_by_channel"][channel]
                if channel_threads["total_threads"] > 0:
                    channel_threads["avg_thread_length"] = (
                        sum(d for d in thread_stats["thread_depths"] if d > 0)
                        / channel_threads["total_threads"]
                    )

        # Calculate average response time
        avg_response_time = (
            sum(response_times) / len(response_times) if response_times else 0
        )

        # Calculate peak hours (top 3 most active hours)
        peak_hours = sorted(hourly_heatmap.items(), key=lambda x: x[1], reverse=True)[
            :3
        ]

        # Calculate busiest days
        busiest_days = sorted(daily_breakdown.items(), key=lambda x: x[1], reverse=True)

        # Calculate work hours vs after hours ratio
        work_hours_messages = sum(hourly_heatmap[str(h).zfill(2)] for h in range(9, 17))
        total_messages_in_heatmap = sum(hourly_heatmap.values())
        work_hours_ratio = (
            work_hours_messages / total_messages_in_heatmap
            if total_messages_in_heatmap > 0
            else 0
        )

        # Analyze sentiment for each day's messages
        anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        daily_sentiment = {}
        for date, messages in daily_messages.items():
            if messages:  # Only analyze if there are messages
                combined_messages = "\n".join(
                    messages[:50]
                )  # Limit to 50 messages per day
                sentiment_analysis = anthropic.messages.create(
                    model="claude-3-5-sonnet-20241022",
                    max_tokens=150,
                    messages=[
                        {
                            "role": "user",
                            "content": f"""Analyze the sentiment and tone of these Slack messages from one day. Return a JSON with:
                        1. overall_sentiment (positive/negative/neutral)
                        2. tone_descriptors (list of 3 adjectives)
                        3. confidence_score (0-1)
                        
                        Messages:
                        {combined_messages}""",
                        }
                    ],
                )
                daily_sentiment[date] = sentiment_analysis.content

        # Analyze sentiment by channel
        channel_sentiment = {}
        for channel, messages in channel_messages_content.items():
            if messages:
                combined_messages = "\n".join(messages[:50])
                sentiment_analysis = anthropic.messages.create(
                    model="claude-3-5-sonnet-20241022",
                    max_tokens=150,
                    messages=[
                        {
                            "role": "user",
                            "content": f"""Analyze the sentiment and tone of these Slack messages from one channel. Return a JSON with:
                        1. overall_sentiment (positive/negative/neutral)
                        2. tone_descriptors (list of 3 adjectives)
                        3. confidence_score (0-1)
                        
                        Messages:
                        {combined_messages}""",
                        }
                    ],
                )
                channel_sentiment[channel] = sentiment_analysis.content

        return {
            "user_profile": user_profile,
            "message_count": total_messages,
            "dm_message_count": dm_messages,
            "channel_message_count": channel_messages,
            "after_hours_messages": after_hours_messages,
            "avg_response_time": avg_response_time,
            "daily_sentiment": daily_sentiment,
            "channel_sentiment": channel_sentiment,
            "time_analysis": {
                "daily_breakdown": daily_breakdown,
                "hourly_heatmap": hourly_heatmap,
                "peak_hours": peak_hours,
                "busiest_days": busiest_days,
                "work_hours_ratio": work_hours_ratio,
            },
            "thread_analysis": thread_stats,
        }

    except Exception as e:
        print(f"Error analyzing Slack activity: {str(e)}")
        raise e


async def generate_slack_nudge(user_id: int, db: asyncpg.Connection) -> str:
    """Generate a personalized nudge message based on comprehensive activity analysis"""
    try:
        # Get Slack activity data
        slack_data = None
        try:
            slack_data = await analyze_slack_activity(user_id, db)
        except Exception as e:
            print(f"Error getting Slack analysis: {e}")
            slack_data = None

        # Get calendar analysis
        calendar_analysis = None
        try:
            calendar_analysis = await analyze_calendar_activity(user_id, db)
        except Exception as e:
            print(f"Error getting calendar analysis: {e}")
            calendar_analysis = None

        # Get GitHub analysis
        github_analysis = None
        try:
            github_analysis = await analyze_github_activity(user_id, db)
        except Exception as e:
            print(f"Error getting GitHub analysis: {e}")
            github_analysis = None

        # Prepare the combined analysis for AI
        anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

        # Add Cross-Platform Analysis
        analysis_prompt = f"""
        Hi! I'm Work Diary, your personal work-life balance assistant. My mission is to help you thrive at work while maintaining a healthy balance in life.

        Analyzing {slack_data['user_profile']['display_name'] or slack_data['user_profile']['real_name'] or 'there'}'s activity data across platforms to provide personalized insights.

        Analyze the following key metrics for a concise work-life balance assessment:

        1. Critical Patterns:
           - High-intensity periods (meetings + coding + communication)
           - After-hours work across all platforms
           - Response time expectations vs actual patterns
           - Context switching frequency
           - Deep work vs interruption ratio

        2. Health Indicators:
           - Meeting density vs coding sessions
           - Communication load during focused work
           - Weekend activity patterns
           - Late-night commits or messages
           - Back-to-back meeting frequency

        3. Team Collaboration:
           - Code review response times
           - Meeting participation quality
           - Slack thread engagement
           - Cross-platform communication effectiveness

        Generate a concise, actionable nudge that:
        1. Start with a personalized greeting using their name
        2. Highlight ONE most critical insight from each platform
        3. Identify ONE major cross-platform pattern affecting well-being
        4. Suggest TWO specific, high-impact improvements
        5. Provide ONE measurable goal for next week
        
        Format: Keep the message under 200 words, friendly but direct, with clear action items.
        Tone: Supportive and solution-focused, not critical.
        Structure: 
        - Personalized greeting
        - Quick wins (immediate actions)
        - Medium-term adjustments (habits to build)
        - Specific metrics to track
        
        Always end with a sign-off that includes "Your Work Diary" and a brief encouraging note about work-life balance.
        Example closings:
        - "Your Work Diary is here to support your journey to better work-life harmony!"
        - "Keep growing while staying balanced. Your Work Diary has your back!"
        - "Your Work Diary is here to help you thrive at work and life!"

        Focus on the most impactful insights that could make the biggest difference to their work-life balance."""

        # Generate the nudge using Claude
        response = anthropic.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=400,
            temperature=0.7,
            messages=[{"role": "user", "content": analysis_prompt}],
        )

        return response.content[0].text

    except Exception as e:
        print(f"Error generating nudge: {e}")
        return "I noticed some interesting patterns in your work habits. Would you like to discuss strategies for maintaining a healthy work-life balance?"
