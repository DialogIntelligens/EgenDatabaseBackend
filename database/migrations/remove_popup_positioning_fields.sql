-- Remove unnecessary popup positioning fields from chatbot_settings
-- The popup should use the same positioning as the button (button_bottom, button_right)

ALTER TABLE chatbot_settings DROP COLUMN IF EXISTS popup_bottom_default;
ALTER TABLE chatbot_settings DROP COLUMN IF EXISTS popup_right_default;
ALTER TABLE chatbot_settings DROP COLUMN IF EXISTS popup_bottom_long_message;
ALTER TABLE chatbot_settings DROP COLUMN IF EXISTS popup_right_long_message;

-- Note: button_bottom and button_right columns remain unchanged
-- These will be used for both button and popup positioning

