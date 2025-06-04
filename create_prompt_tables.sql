-- Create the main prompt template table (single row, live template)
CREATE TABLE statestik_prompt_template (
    id          SERIAL  PRIMARY KEY,
    version     INT     NOT NULL DEFAULT 1,
    sections    JSONB   NOT NULL, -- Array of {key: int, content: string}
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the template history table (for version tracking)
CREATE TABLE statestik_prompt_template_history (
    id          SERIAL  PRIMARY KEY,
    version     INT     NOT NULL,
    sections    JSONB   NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    modified_by INT     -- user ID who made the change
);

-- Create the overrides table (per-chatbot customizations)
CREATE TABLE statestik_prompt_overrides (
    id          SERIAL      PRIMARY KEY,
    chatbot_id  VARCHAR(255) NOT NULL,
    section_key INT         NOT NULL,
    action      VARCHAR(10) NOT NULL CHECK (action IN ('add', 'modify', 'remove')),
    content     TEXT,       -- can be NULL for 'remove' action
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one override per chatbot+section combination
    UNIQUE(chatbot_id, section_key)
);

-- Create indexes for better performance
CREATE INDEX idx_prompt_overrides_chatbot ON statestik_prompt_overrides(chatbot_id);
CREATE INDEX idx_prompt_overrides_section ON statestik_prompt_overrides(section_key);

-- Insert a default template with some example sections
INSERT INTO statestik_prompt_template (version, sections, updated_at) VALUES (
    1,
    '[
        {"key": 1, "content": "You are a helpful AI assistant."},
        {"key": 2, "content": "Please provide accurate and helpful responses."},
        {"key": 3, "content": "Always be polite and professional."}
    ]'::jsonb,
    NOW()
); 