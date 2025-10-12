-- Add Integration Settings to chatbot_settings table
-- This migration adds all columns needed for universal integration script
-- Safe to run multiple times (uses IF NOT EXISTS)

-- Core visual settings
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS iframe_url TEXT DEFAULT 'https://skalerbartprodukt.onrender.com';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS header_logo_url TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS message_icon_url TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#1a1d56';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS ai_message_color TEXT DEFAULT '#e5eaf5';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS ai_message_text_color TEXT DEFAULT '#262641';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS font_family TEXT;

-- Text content
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS header_title TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS header_subtitle TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS chat_window_title TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS privacy_link TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS subtitle_link_text TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS subtitle_link_url TEXT;

-- Lead generation
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS lead_email TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS lead_field1_label TEXT DEFAULT 'Navn';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS lead_field2_label TEXT DEFAULT 'Email';

-- Feature flags
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS use_thumbs_rating BOOLEAN DEFAULT false;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS rating_timer_duration INTEGER DEFAULT 18000;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS replace_exclamation_with_period BOOLEAN DEFAULT false;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS enable_livechat BOOLEAN DEFAULT false;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS enable_minimize_button BOOLEAN DEFAULT true;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS enable_popup_message BOOLEAN DEFAULT true;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS purchase_tracking_enabled BOOLEAN DEFAULT false;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS show_powered_by BOOLEAN DEFAULT true;

-- UI text customization
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS input_placeholder TEXT DEFAULT 'Skriv dit spørgsmål her...';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS rating_message TEXT DEFAULT 'Fik du besvaret dit spørgsmål?';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS product_button_text TEXT DEFAULT 'SE PRODUKT';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS product_button_color TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS product_button_padding TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS product_image_height_multiplier DECIMAL DEFAULT 1.0;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS product_box_height_multiplier DECIMAL DEFAULT 1.0;

-- Freshdesk form labels
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_email_label TEXT DEFAULT 'Din email:';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_message_label TEXT DEFAULT 'Besked til kundeservice:';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_image_label TEXT DEFAULT 'Upload billede (valgfrit):';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_choose_file_text TEXT DEFAULT 'Vælg fil';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_no_file_text TEXT DEFAULT 'Ingen fil valgt';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_sending_text TEXT DEFAULT 'Sender...';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_submit_text TEXT DEFAULT 'Send henvendelse';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_subject_text TEXT DEFAULT 'Din henvendelse';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_name_label TEXT DEFAULT 'Dit navn:';

-- Freshdesk validation errors
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_email_required_error TEXT DEFAULT 'Email er påkrævet';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_email_invalid_error TEXT DEFAULT 'Indtast venligst en gyldig email adresse';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_form_error_text TEXT DEFAULT 'Ret venligst fejlene i formularen';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_message_required_error TEXT DEFAULT 'Besked er påkrævet';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_name_required_error TEXT DEFAULT 'Navn er påkrævet';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_submit_error_text TEXT DEFAULT 'Der opstod en fejl';

-- Confirmation messages
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS contact_confirmation_text TEXT DEFAULT 'Tak for din henvendelse';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_confirmation_text TEXT DEFAULT 'Tak for din henvendelse';

-- Human agent request
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS human_agent_question_text TEXT DEFAULT 'Vil du gerne tale med en medarbejder?';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS human_agent_yes_button_text TEXT DEFAULT 'Ja tak';
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS human_agent_no_button_text TEXT DEFAULT 'Nej tak';

-- Additional settings (use BIGINT for large Freshdesk IDs that exceed INTEGER range)
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_group_id BIGINT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS freshdesk_product_id BIGINT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS to_human_mail BOOLEAN DEFAULT false;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS default_header_title TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS default_header_subtitle TEXT;

-- Timestamps
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS settings_updated_at TIMESTAMP DEFAULT NOW();

-- Create index on settings_updated_at for performance
CREATE INDEX IF NOT EXISTS idx_chatbot_settings_updated_at ON chatbot_settings(settings_updated_at);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Integration settings migration completed successfully';
END $$;

