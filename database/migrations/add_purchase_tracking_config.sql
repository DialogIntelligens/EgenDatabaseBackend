-- Add purchase tracking configuration columns to chatbot_settings table
-- This allows per-chatbot configuration of checkout page detection and price extraction

ALTER TABLE chatbot_settings 
ADD COLUMN IF NOT EXISTS checkout_page_patterns TEXT, -- JSON array of URL patterns to detect checkout pages
ADD COLUMN IF NOT EXISTS price_extraction_locale VARCHAR(10) DEFAULT 'en'; -- Locale for price parsing ('en', 'da', 'de', etc.)

-- Add comments for documentation
COMMENT ON COLUMN chatbot_settings.checkout_page_patterns IS 'JSON array of URL patterns for checkout page detection. Example: ["/checkout", "/order-complete/"]';
COMMENT ON COLUMN chatbot_settings.price_extraction_locale IS 'Locale code for price extraction (en, da, de, etc.) - affects decimal/thousands separator handling';

