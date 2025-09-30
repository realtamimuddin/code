-- Supabase Database Schema for Code Review Highlights
-- This schema supports real-time collaboration with row-level security

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (synced with GitHub OAuth)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_id BIGINT UNIQUE NOT NULL,
    login TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,
    email TEXT,
    access_token_hash TEXT, -- Store hashed tokens only
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Repositories table
CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    github_id BIGINT UNIQUE NOT NULL,
    private BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(owner, name)
);

-- Pull requests table
CREATE TABLE pull_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    title TEXT,
    state TEXT DEFAULT 'open',
    github_id BIGINT UNIQUE NOT NULL,
    author_github_id BIGINT,
    head_sha TEXT,
    base_sha TEXT,
    url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(repository_id, number)
);

-- Highlights table - the core entity for code highlights
CREATE TABLE highlights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id TEXT UNIQUE NOT NULL, -- Format: "filepath:lineNumber"
    pull_request_id UUID REFERENCES pull_requests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    color TEXT NOT NULL,
    comment_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one highlight per line per user
    UNIQUE(pull_request_id, file_path, line_number, user_id)
);

-- User repository access table (for permission management)
CREATE TABLE user_repository_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    access_level TEXT DEFAULT 'read', -- read, write, admin
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, repository_id)
);

-- Active sessions table (for tracking real-time users)
CREATE TABLE active_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pull_request_id UUID REFERENCES pull_requests(id) ON DELETE CASCADE,
    room_id TEXT NOT NULL,
    connection_id TEXT,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    
    UNIQUE(user_id, pull_request_id)
);

-- Indexes for performance
CREATE INDEX idx_highlights_pr_id ON highlights(pull_request_id);
CREATE INDEX idx_highlights_user_id ON highlights(user_id);
CREATE INDEX idx_highlights_file_line ON highlights(file_path, line_number);
CREATE INDEX idx_pull_requests_repo_id ON pull_requests(repository_id);
CREATE INDEX idx_pull_requests_number ON pull_requests(repository_id, number);
CREATE INDEX idx_active_sessions_pr_id ON active_sessions(pull_request_id);
CREATE INDEX idx_active_sessions_last_seen ON active_sessions(last_seen);

-- Updated at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_pull_requests_updated_at BEFORE UPDATE ON pull_requests
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_highlights_updated_at BEFORE UPDATE ON highlights
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pull_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_repository_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can read their own data
CREATE POLICY "Users can read own data" ON users
    FOR SELECT USING (auth.jwt() ->> 'sub' = github_id::text);

-- Users can update their own data
CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (auth.jwt() ->> 'sub' = github_id::text);

-- Repository access based on user_repository_access table
CREATE POLICY "Repository access" ON repositories
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_repository_access ura
            JOIN users u ON u.id = ura.user_id
            WHERE ura.repository_id = repositories.id
            AND u.github_id::text = auth.jwt() ->> 'sub'
        )
    );

-- Pull request access inherits from repository access
CREATE POLICY "Pull request access" ON pull_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_repository_access ura
            JOIN users u ON u.id = ura.user_id
            JOIN repositories r ON r.id = ura.repository_id
            WHERE r.id = pull_requests.repository_id
            AND u.github_id::text = auth.jwt() ->> 'sub'
        )
    );

-- Highlights access based on pull request access
CREATE POLICY "Highlights read access" ON highlights
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM pull_requests pr
            JOIN repositories r ON r.id = pr.repository_id
            JOIN user_repository_access ura ON ura.repository_id = r.id
            JOIN users u ON u.id = ura.user_id
            WHERE pr.id = highlights.pull_request_id
            AND u.github_id::text = auth.jwt() ->> 'sub'
        )
    );

-- Users can insert highlights in repositories they have access to
CREATE POLICY "Highlights insert access" ON highlights
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM pull_requests pr
            JOIN repositories r ON r.id = pr.repository_id
            JOIN user_repository_access ura ON ura.repository_id = r.id
            JOIN users u ON u.id = ura.user_id
            WHERE pr.id = highlights.pull_request_id
            AND u.id = highlights.user_id
            AND u.github_id::text = auth.jwt() ->> 'sub'
        )
    );

-- Users can only update/delete their own highlights
CREATE POLICY "Highlights modify own" ON highlights
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = highlights.user_id
            AND u.github_id::text = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Highlights delete own" ON highlights
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = highlights.user_id
            AND u.github_id::text = auth.jwt() ->> 'sub'
        )
    );

-- Active sessions policies
CREATE POLICY "Active sessions access" ON active_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = active_sessions.user_id
            AND u.github_id::text = auth.jwt() ->> 'sub'
        )
    );

-- Functions for common operations

-- Function to get or create user from GitHub data
CREATE OR REPLACE FUNCTION get_or_create_user(
    p_github_id BIGINT,
    p_login TEXT,
    p_name TEXT,
    p_avatar_url TEXT,
    p_email TEXT
) RETURNS UUID AS $$
DECLARE
    user_uuid UUID;
BEGIN
    -- Try to get existing user
    SELECT id INTO user_uuid
    FROM users
    WHERE github_id = p_github_id;
    
    -- If not found, create new user
    IF user_uuid IS NULL THEN
        INSERT INTO users (github_id, login, name, avatar_url, email)
        VALUES (p_github_id, p_login, p_name, p_avatar_url, p_email)
        RETURNING id INTO user_uuid;
    ELSE
        -- Update existing user info
        UPDATE users 
        SET login = p_login,
            name = p_name,
            avatar_url = p_avatar_url,
            email = p_email,
            updated_at = NOW()
        WHERE id = user_uuid;
    END IF;
    
    RETURN user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get or create repository
CREATE OR REPLACE FUNCTION get_or_create_repository(
    p_owner TEXT,
    p_name TEXT,
    p_github_id BIGINT,
    p_private BOOLEAN DEFAULT false
) RETURNS UUID AS $$
DECLARE
    repo_uuid UUID;
BEGIN
    -- Try to get existing repository
    SELECT id INTO repo_uuid
    FROM repositories
    WHERE github_id = p_github_id;
    
    -- If not found, create new repository
    IF repo_uuid IS NULL THEN
        INSERT INTO repositories (owner, name, github_id, private)
        VALUES (p_owner, p_name, p_github_id, p_private)
        RETURNING id INTO repo_uuid;
    END IF;
    
    RETURN repo_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to grant repository access
CREATE OR REPLACE FUNCTION grant_repository_access(
    p_user_id UUID,
    p_repository_id UUID,
    p_access_level TEXT DEFAULT 'read'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO user_repository_access (user_id, repository_id, access_level)
    VALUES (p_user_id, p_repository_id, p_access_level)
    ON CONFLICT (user_id, repository_id) 
    DO UPDATE SET 
        access_level = p_access_level,
        granted_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old active sessions
CREATE OR REPLACE FUNCTION cleanup_old_sessions() RETURNS VOID AS $$
BEGIN
    DELETE FROM active_sessions 
    WHERE last_seen < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cleanup function (if pg_cron is available)
-- SELECT cron.schedule('cleanup-sessions', '*/15 * * * *', 'SELECT cleanup_old_sessions();');

-- Views for common queries

-- View for highlights with user and PR information
CREATE VIEW highlights_with_details AS
SELECT 
    h.id,
    h.external_id,
    h.file_path,
    h.line_number,
    h.color,
    h.comment_text,
    h.created_at,
    h.updated_at,
    u.github_id as user_github_id,
    u.login as user_login,
    u.name as user_name,
    u.avatar_url as user_avatar,
    pr.number as pr_number,
    pr.title as pr_title,
    pr.url as pr_url,
    r.owner as repo_owner,
    r.name as repo_name
FROM highlights h
JOIN users u ON u.id = h.user_id
JOIN pull_requests pr ON pr.id = h.pull_request_id
JOIN repositories r ON r.id = pr.repository_id;

-- View for active users per PR
CREATE VIEW active_users_per_pr AS
SELECT 
    as_.pull_request_id,
    pr.number as pr_number,
    r.owner as repo_owner,
    r.name as repo_name,
    u.github_id as user_github_id,
    u.login as user_login,
    u.name as user_name,
    u.avatar_url as user_avatar,
    as_.last_seen,
    as_.connection_id
FROM active_sessions as_
JOIN users u ON u.id = as_.user_id
JOIN pull_requests pr ON pr.id = as_.pull_request_id
JOIN repositories r ON r.id = pr.repository_id
WHERE as_.last_seen > NOW() - INTERVAL '10 minutes';