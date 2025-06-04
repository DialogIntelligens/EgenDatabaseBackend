-- Insert a default template with some example sections
INSERT INTO statestik_prompt_template (version, sections, updated_at) VALUES (
    1,
    '[
        {"key": 1000, "content": "You are a helpful AI assistant."},
        {"key": 2000, "content": "Please provide accurate and helpful responses."},
        {"key": 3000, "content": "Always be polite and professional."}
    ]'::jsonb,
    NOW()
); 