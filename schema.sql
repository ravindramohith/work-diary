-- Users table (for demo purposes)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
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