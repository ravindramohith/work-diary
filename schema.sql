-- Drop existing tables first
DROP TABLE IF EXISTS burnout_scores;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS slack_activity;
DROP TABLE IF EXISTS users;


CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    disabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    slack_user_id TEXT UNIQUE,
    slack_access_token BYTEA,  -- Encrypted storage
    slack_team_id TEXT
);

-- Activity Logs (Slack/Jira/GitHub data)
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    tool VARCHAR(50) NOT NULL,  -- 'slack', 'jira', 'github'
    event_type VARCHAR(100),     -- 'message', 'commit', 'task'
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