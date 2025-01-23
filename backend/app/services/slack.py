import os, asyncpg, json
from slack_sdk import WebClient
from datetime import datetime, timedelta
from ..security import decrypt_token


async def analyze_slack_burnout(user_id: int, db: asyncpg.Connection):
    user = await db.fetchrow(
        """
        SELECT id, slack_user_id, slack_access_token 
        FROM users 
        WHERE id = $1
        """,
        user_id,
    )
    if not user["slack_access_token"]:
        raise Exception("Slack not connected")

    # Decrypt token
    decrypted_token = decrypt_token(user["slack_access_token"])

    client = WebClient(token=decrypted_token)

    # Get last week's messages
    messages = client.conversations_history(
        channel="#general",  # Or fetch user's DMs/channels
        oldest=(datetime.now() - timedelta(days=7)).timestamp(),
    )["messages"]

    # Calculate metrics
    user_messages = [m for m in messages if m.get("user") == user["slack_user_id"]]
    after_hours = [
        m
        for m in user_messages
        if not (9 <= datetime.fromtimestamp(float(m["ts"])).hour < 17)
    ]

    # Reaction time analysis
    reaction_times = []
    for msg in user_messages:
        reactions = client.reactions_get(channel="#general", timestamp=msg["ts"])
        if reactions:
            first_reaction_ts = min(
                [r["created"] for r in reactions["message"]["reactions"]]
            )
            reaction_time = first_reaction_ts - float(msg["ts"])
            reaction_times.append(reaction_time)

    # Store in DB
    await db.execute(
        """
        INSERT INTO slack_activity 
        (user_id, message_count, reaction_time_avg, after_hours_messages)
        VALUES ($1, $2, $3, $4)
        """,
        user["id"],
        len(user_messages),
        sum(reaction_times) / len(reaction_times) if reaction_times else 0,
        len(after_hours),
    )


from anthropic import Anthropic


async def detect_burnout_from_slack(user_id: int, db: asyncpg.Connection):
    activity = await db.fetchrow(
        "SELECT * FROM slack_activity WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1",
        user_id,
    )

    # Anthropic for structured analysis
    anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    prompt = f"""
    Analyze this Slack activity data for burnout risk:
    - Messages sent: {activity['message_count']}
    - Avg reaction time: {activity['reaction_time_avg']}s
    - After-hours messages: {activity['after_hours_messages']}

    Return JSON with 'risk_score' (0-1) and 'key_insights'.
    """

    response = anthropic.completions.create(
        model="claude-2.1",
        prompt=prompt,
        max_tokens=300,
    )

    return json.loads(response.completion)


from openai import OpenAI


async def generate_slack_nudge(user_id: int, db: asyncpg.Connection):
    burnout_data = await detect_burnout_from_slack(user_id, db)

    # OpenAI for empathetic messaging
    openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = openai.chat.completions.create(
        model="gpt-4",
        messages=[
            {
                "role": "user",
                "content": f"""
            User has burnout risk score {burnout_data['risk_score']}. 
            Insights: {burnout_data['key_insights']}
            
            Generate a compassionate Slack message to suggest they take a break.
            """,
            }
        ],
    )

    return response.choices[0].message.content
