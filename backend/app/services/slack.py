import os, asyncpg
from slack_sdk import WebClient
from datetime import datetime, timedelta
from ..security import decrypt_token
from openai import OpenAI
from anthropic import Anthropic
from .calendar import analyze_calendar_activity


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
                    model="claude-3-sonnet-20240229",
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
                    model="claude-3-sonnet-20240229",
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
    """Generate a personalized nudge message based on Slack and Calendar activity"""
    try:
        # Get Slack activity
        activity = await analyze_slack_activity(user_id, db)

        # Get Calendar activity
        try:
            calendar_data = await analyze_calendar_activity(user_id, db)
        except Exception as e:
            print(f"Error getting calendar data: {str(e)}")
            calendar_data = None

        # Get user's preferred name
        user_name = (
            activity["user_profile"]["display_name"]
            or activity["user_profile"]["first_name"]
            or activity["user_profile"]["real_name"]
            or "there"
        )

        # Format Slack insights
        time_analysis = activity["time_analysis"]
        peak_hours_str = ", ".join(
            [f"{hour}:00" for hour, _ in time_analysis["peak_hours"]]
        )
        busiest_day = time_analysis["busiest_days"][0][0]
        work_hours_percent = time_analysis["work_hours_ratio"] * 100

        thread_analysis = activity["thread_analysis"]
        thread_engagement = {
            "total_threads": thread_analysis["total_threads"],
            "initiated_threads": thread_analysis["threads_initiated"],
            "avg_length": f"{thread_analysis['avg_thread_length']:.1f}",
            "deep_discussions": len(thread_analysis["deep_discussions"]),
            "engagement_ratio": (
                f"{(thread_analysis['thread_replies'] / thread_analysis['total_threads']):.1f}"
                if thread_analysis["total_threads"] > 0
                else "0"
            ),
        }

        # Use Anthropic for combined risk analysis
        anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        combined_analysis = anthropic.messages.create(
            model="claude-3-sonnet-20240229",
            max_tokens=400,
            messages=[
                {
                    "role": "user",
                    "content": f"""
                    Analyze this combined Slack and Calendar data for {user_name}'s burnout risk:

                    Slack Activity:
                    - Total messages (7 days): {activity['message_count']}
                    - Direct messages: {activity['dm_message_count']}
                    - Channel messages: {activity['channel_message_count']}
                    - After-hours messages: {activity['after_hours_messages']}
                    - Average response time: {activity['avg_response_time']:.1f}s
                    
                    Time Analysis:
                    - Peak activity hours: {peak_hours_str}
                    - Busiest day: {busiest_day}
                    - Work hours messages: {work_hours_percent:.1f}%
                    - Daily breakdown: {time_analysis['daily_breakdown']}
                    
                    Thread Engagement:
                    - Total threads: {thread_engagement['total_threads']}
                    - Threads initiated: {thread_engagement['initiated_threads']}
                    - Average thread length: {thread_engagement['avg_length']} messages
                    - Deep discussions: {thread_engagement['deep_discussions']}
                    - Replies per thread: {thread_engagement['engagement_ratio']}
                    
                    Calendar Activity (Last 24 hours):
                    {f'''- Total meetings: {calendar_data["total_meetings"]}
                    - Total meeting duration: {calendar_data["total_duration_minutes"]} minutes
                    - After-hours meetings: {calendar_data["meetings_after_hours"]}
                    - Early meetings: {calendar_data["early_meetings"]}
                    - Back-to-back meetings: {calendar_data["back_to_back_meetings"]}''' if calendar_data else "No calendar data available"}

                    Deep Discussion Topics:
                    {chr(10).join([
                        f"- {disc['channel']}: {disc['topic']} ({disc['user_participation']}/{disc['length']} messages)"
                        for disc in thread_analysis['deep_discussions'][:3]
                    ])}

                    Sentiment Analysis:
                    Daily patterns: {activity['daily_sentiment']}
                    Channel patterns: {activity['channel_sentiment']}
                    
                    Consider:
                    1. Balance between public and private communication
                    2. After-hours messaging patterns
                    3. Response time expectations
                    4. Overall message volume
                    5. Sentiment trends and emotional patterns
                    6. Channel-specific communication styles
                    7. Time-based work patterns
                    8. Work-life balance based on message timing
                    9. Thread engagement patterns
                    10. Deep discussion involvement

                    Return a JSON response analyzing both communication and meeting patterns:
                    {{
                        "overall_risk_score": 0.7,
                        "key_insights": [
                            "First insight combining both Slack and Calendar patterns",
                            "Second insight about overall work patterns",
                            "Third insight about potential burnout risks"
                        ],
                        "communication_insights": [
                            "First insight about Slack usage",
                            "Second insight about messaging patterns"
                        ],
                        "meeting_insights": [
                            "First insight about calendar patterns",
                            "Second insight about meeting load"
                        ],
                        "work_life_balance": "Analysis of overall work-life balance",
                        "recommendations": [
                            "First specific recommendation",
                            "Second actionable suggestion",
                            "Third practical tip"
                        ]
                    }}
                    """,
                }
            ],
        )

        # Generate final message with OpenAI
        openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        message_response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "user",
                    "content": f"""
                    Generate a personalized message for {user_name} based on their combined Slack and Calendar activity.
                    
                    Slack Activity:
                    - Messages (7 days): {activity['message_count']}
                    - After-hours messages: {activity['after_hours_messages']}
                    - Peak activity: {peak_hours_str}
                    - Work hours messages: {work_hours_percent:.1f}%
                    - Deep discussions: {thread_engagement['deep_discussions']}

                    Calendar Activity:
                    {f'''- Meetings today: {calendar_data["total_meetings"]}
                    - Meeting duration: {calendar_data["total_duration_minutes"]} minutes
                    - After-hours meetings: {calendar_data["meetings_after_hours"]}
                    - Back-to-back meetings: {calendar_data["back_to_back_meetings"]}''' if calendar_data else "No calendar data available"}

                    Combined Analysis: {combined_analysis.content}
                    
                    Generate a friendly, personalized message that:
                    1. Uses their name naturally
                    2. Acknowledges both communication and meeting patterns
                    3. Notes any concerning patterns from either Slack or Calendar
                    4. Offers specific, actionable suggestions
                    5. Maintains an empathetic, supportive tone
                    6. Ends with "Work Diary" as the bot name

                    Example closing lines:
                    - "Work Diary is here to support your well-being!"
                    - "Your Work Diary assistant is always here to help."
                    - "Keep up the great work, and remember Work Diary is here when you need insights!"
                    
                    Keep it casual and empathetic, not authoritative. Always end with a closing line that includes "Work Diary". Use emojis if appropriate.
                    """,
                }
            ],
        )

        return message_response.choices[0].message.content

    except Exception as e:
        print(f"Error generating nudge: {str(e)}")
        return f"Hey {user_name}! 👋 Just checking in to remind you to take care of yourself. Maybe it's a good time for a quick break? 🌟"
