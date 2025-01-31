-- Drop existing tables first
DROP TABLE IF EXISTS burnout_scores;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS slack_activity;
DROP TABLE IF EXISTS slack_oauth_states;
DROP TABLE IF EXISTS users;


CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    hashed_password VARCHAR(255) NOT NULL,
    disabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    -- Slack fields
    slack_user_id TEXT UNIQUE,
    slack_access_token BYTEA,  -- User token (encrypted)
    slack_bot_token BYTEA,     -- Bot token (encrypted)
    slack_team_id TEXT,
    -- GitHub fields
    github_user_id TEXT UNIQUE,
    github_username TEXT,
    github_access_token BYTEA,  -- Encrypted GitHub token
    github_org_name TEXT,       -- Main organization name
    -- Google Calendar fields
    google_refresh_token BYTEA,  -- Encrypted Google refresh token
    google_calendar_connected BOOLEAN DEFAULT FALSE,
    google_calendar_id TEXT      -- Primary calendar ID
);

-- Slack OAuth States
CREATE TABLE IF NOT EXISTS slack_oauth_states (
    id SERIAL PRIMARY KEY,
    state TEXT UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Activity Logs (Slack/Calendar data)
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    tool VARCHAR(50) NOT NULL,  -- 'slack', 'calendar'
    event_type VARCHAR(100),    -- 'message', 'meeting'
    duration_minutes INTEGER,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Burnout Risk Scores
CREATE TABLE IF NOT EXISTS burnout_scores (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    risk_score FLOAT CHECK (risk_score BETWEEN 0 AND 1),
    generated_at TIMESTAMP DEFAULT NOW()
);

-- Slack Activity Metrics
CREATE TABLE IF NOT EXISTS slack_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    message_count INTEGER,
    reaction_time_avg FLOAT,  -- Seconds between message and reaction
    after_hours_messages INTEGER,
    timestamp TIMESTAMP DEFAULT NOW()
);