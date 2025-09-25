import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GitHub configuration for public repository
const GITHUB_REPO = 'DialogIntelligens/scripts';
const GITHUB_BRANCH = 'main';

/**
 * Extract ALL integration options from GitHub integration scripts
 * This script generates a CLEAN SQL file for pgAdmin execution (no JavaScript comments)
 */

async function generateCleanIntegrationSQL() {
  try {
    console.log('🔍 Extracting ALL integration options from GitHub integration scripts...');
    console.log(`📂 Repository: https://github.com/${GITHUB_REPO}`);
    
    // Step 1: Get list of all files in the repository
    console.log('📂 Fetching file list from GitHub...');
    const filesResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents?ref=${GITHUB_BRANCH}`
    );

    if (!filesResponse.ok) {
      throw new Error(`GitHub API error: ${filesResponse.status} ${filesResponse.statusText}`);
    }

    const files = await filesResponse.json();
    const jsFiles = files.filter(file => file.name.endsWith('.js') && file.type === 'file');
    
    console.log(`📄 Found ${jsFiles.length} JavaScript files to process`);

    // Step 2: Process each file and extract integration options
    const extractedOptions = [];
    
    for (const file of jsFiles) {
      try {
        console.log(`📝 Processing: ${file.name}`);
        
        const fileResponse = await fetch(file.download_url);
        if (!fileResponse.ok) {
          console.warn(`⚠️ Failed to fetch ${file.name}: ${fileResponse.status}`);
          continue;
        }
        
        const content = await fileResponse.text();
        const options = extractAllOptionsFromScript(content, file.name);
        
        if (options) {
          extractedOptions.push(options);
          console.log(`✅ Extracted options for: ${options.chatbotId}`);
        }
        
        // Small delay to be nice to GitHub API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.warn(`⚠️ Error processing ${file.name}:`, error.message);
      }
    }

    console.log(`\n📊 Extraction Summary:`);
    console.log(`   - Files processed: ${jsFiles.length}`);
    console.log(`   - Options extracted: ${extractedOptions.length}`);

    // Step 3: Generate CLEAN SQL file
    if (extractedOptions.length > 0) {
      const sqlFilePath = generateCleanSQLFile(extractedOptions);
      console.log(`\n🎯 Next Steps:`);
      console.log(`1. Open pgAdmin`);
      console.log(`2. Run the SQL file: ${sqlFilePath}`);
      console.log(`3. The integration options will be stored in the database`);
    } else {
      console.log('⚠️ No integration options found to process');
    }

    console.log('\n🎉 Clean integration options SQL generation complete!');
    
  } catch (error) {
    console.error('❌ Error generating clean integration SQL:', error);
    process.exit(1);
  }
}

/**
 * Extract integration options from a script with proper cleaning
 */
function extractAllOptionsFromScript(content, filename) {
  try {
    // Extract chatbot ID from filename
    const chatbotId = filename.replace('.js', '');
    
    console.log(`🔍 Processing chatbot: ${chatbotId}`);
    
    // Clean function to remove JavaScript comments and normalize strings
    const cleanValue = (value) => {
      if (typeof value !== 'string') return value;
      
      return value
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
        .replace(/\/\/.*$/gm, '') // Remove // comments
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    };
    
    // Extract field helper with proper cleaning
    const extractField = (fieldName, defaultValue = null) => {
      const patterns = [
        new RegExp(`${fieldName}\\s*:\\s*["']([^"']+)["']`, 'i'),
        new RegExp(`${fieldName}\\s*=\\s*["']([^"']+)["']`, 'i'),
        new RegExp(`"${fieldName}"\\s*:\\s*["']([^"']+)["']`, 'i')
      ];
      
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          return cleanValue(match[1]);
        }
      }
      return defaultValue;
    };
    
    // Extract boolean field helper
    const extractBooleanField = (fieldName, defaultValue = null) => {
      const patterns = [
        new RegExp(`${fieldName}\\s*:\\s*(true|false)`, 'i'),
        new RegExp(`${fieldName}\\s*=\\s*(true|false)`, 'i'),
        new RegExp(`"${fieldName}"\\s*:\\s*(true|false)`, 'i')
      ];
      
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          return match[1].toLowerCase() === 'true';
        }
      }
      return defaultValue;
    };
    
    // Extract number field helper
    const extractNumberField = (fieldName, defaultValue = null) => {
      const patterns = [
        new RegExp(`${fieldName}\\s*:\\s*(\\d+(?:\\.\\d+)?)`, 'i'),
        new RegExp(`${fieldName}\\s*=\\s*(\\d+(?:\\.\\d+)?)`, 'i'),
        new RegExp(`"${fieldName}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`, 'i')
      ];
      
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          return parseFloat(match[1]);
        }
      }
      return defaultValue;
    };

    // Extract all integration options with proper cleaning
    const options = {
      chatbotId,
      // Flow keys
      flow2Key: extractField('flow2Key'),
      flow3Key: extractField('flow3Key'),
      flow4Key: extractField('flow4Key'),
      apiFlowKey: extractField('apiFlowKey'),
      metaDataKey: extractField('metaDataKey'),
      metaData2Key: extractField('metaData2Key'),
      
      // UI and styling
      headerLogoG: extractField('headerLogoG'),
      messageIcon: extractField('messageIcon'),
      themeColor: extractField('themeColor'),
      aiMessageColor: extractField('aiMessageColor'),
      aiMessageTextColor: extractField('aiMessageTextColor'),
      fontFamily: extractField('fontFamily'),
      headerSubtitleG: extractField('headerSubtitleG'),
      
      // Product styling
      productButtonText: extractField('productButtonText'),
      productButtonColor: extractField('productButtonColor'),
      productButtonPadding: extractField('productButtonPadding'),
      productImageHeightMultiplier: extractNumberField('productImageHeightMultiplier'),
      productBoxHeightMultiplier: extractNumberField('productBoxHeightMultiplier'),
      
      // Feature flags
      enableLivechat: extractBooleanField('enableLivechat'),
      useThumbsRating: extractBooleanField('useThumbsRating'),
      replaceExclamationWithPeriod: extractBooleanField('replaceExclamationWithPeriod'),
      purchaseTrackingEnabled: extractBooleanField('purchaseTrackingEnabled'),
      showPoweredBy: extractBooleanField('showPoweredBy'),
      toHumanMail: extractBooleanField('toHumanMail'),
      
      // Timing
      ratingTimerDuration: extractNumberField('ratingTimerDuration'),
      
      // Variable overrides
      websiteOverride: extractField('websiteOverride'),
      languageOverride: extractField('languageOverride'),
      valutaOverride: extractField('valutaOverride'),
      dillingProductsKatOverride: extractField('dillingProductsKatOverride'),
      dillingColors: extractField('dillingColors'),
      customVar1: extractField('customVar1'),
      
      // Order tracking
      orderTrackingEnabled: extractBooleanField('orderTrackingEnabled'),
      orderTrackingUrl: extractField('orderTrackingUrl'),
      trackingUseProxy: extractBooleanField('trackingUseProxy'),
      trackingProxyUrl: extractField('trackingProxyUrl'),
      trackingRequestMethod: extractField('trackingRequestMethod'),
      trackingNeedsAuth: extractBooleanField('trackingNeedsAuth'),
      
      // UI text
      inputPlaceholder: extractField('inputPlaceholder'),
      ratingMessage: extractField('ratingMessage'),
      subtitleLinkText: extractField('subtitleLinkText'),
      subtitleLinkUrl: extractField('subtitleLinkUrl'),
      
      // Freshdesk configuration
      freshdeskGroupId: extractNumberField('freshdeskGroupId'),
      freshdeskProductId: extractNumberField('freshdeskProductId'),
      freshdeskEmailLabel: extractField('freshdeskEmailLabel'),
      freshdeskMessageLabel: extractField('freshdeskMessageLabel'),
      freshdeskImageLabel: extractField('freshdeskImageLabel'),
      freshdeskChooseFileText: extractField('freshdeskChooseFileText'),
      freshdeskNoFileText: extractField('freshdeskNoFileText'),
      freshdeskSendingText: extractField('freshdeskSendingText'),
      freshdeskSubmitText: extractField('freshdeskSubmitText'),
      freshdeskSubjectText: extractField('freshdeskSubjectText'),
      freshdeskNameLabel: extractField('freshdeskNameLabel'),
      
      // Freshdesk error messages
      freshdeskEmailRequiredError: extractField('freshdeskEmailRequiredError'),
      freshdeskEmailInvalidError: extractField('freshdeskEmailInvalidError'),
      freshdeskFormErrorText: extractField('freshdeskFormErrorText'),
      freshdeskMessageRequiredError: extractField('freshdeskMessageRequiredError'),
      freshdeskNameRequiredError: extractField('freshdeskNameRequiredError'),
      freshdeskSubmitErrorText: extractField('freshdeskSubmitErrorText'),
      
      // Confirmation messages
      contactConfirmationText: extractField('contactConfirmationText'),
      freshdeskConfirmationText: extractField('freshdeskConfirmationText'),
      
      // Human agent request
      humanAgentQuestionText: extractField('humanAgentQuestionText'),
      humanAgentYesButtonText: extractField('humanAgentYesButtonText'),
      humanAgentNoButtonText: extractField('humanAgentNoButtonText'),
      
      // Other fields
      leadMail: extractField('leadMail'),
      leadField1: extractField('leadField1'),
      leadField2: extractField('leadField2'),
      privacyLink: extractField('privacyLink'),
      imageAPI: extractField('imageAPI'),
      preloadedMessage: extractField('preloadedMessage'),
      statestikAPI: extractField('statestikAPI'),
      defaultHeaderTitle: extractField('defaultHeaderTitle'),
      defaultHeaderSubtitle: extractField('defaultHeaderSubtitle')
    };

    // Only return if we found at least one meaningful value
    const hasData = Object.values(options).some(value => 
      value !== null && value !== undefined && value !== ''
    );
    
    if (hasData) {
      console.log(`✅ Found integration options for ${chatbotId}`);
      return options;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Error extracting from ${filename}:`, error.message);
    return null;
  }
}

/**
 * Generate clean SQL file for pgAdmin (synchronous version)
 */
function generateCleanSQLFile(optionsArray) {
  console.log('\n📝 Generating CLEAN SQL file for pgAdmin execution...');
  
  let sqlContent = `-- ALL INTEGRATION OPTIONS MIGRATION SQL
-- Generated on: ${new Date().toISOString()}
-- Total chatbots: ${optionsArray.length}
-- CLEANED: All JavaScript comments removed

-- =============================================
-- 1. ADD ALL INTEGRATION OPTION COLUMNS
-- =============================================

ALTER TABLE chatbot_settings 
-- Flow keys
ADD COLUMN IF NOT EXISTS flow2_key TEXT,
ADD COLUMN IF NOT EXISTS flow3_key TEXT,
ADD COLUMN IF NOT EXISTS flow4_key TEXT,
ADD COLUMN IF NOT EXISTS apiflow_key TEXT,
ADD COLUMN IF NOT EXISTS metadata_key TEXT,
ADD COLUMN IF NOT EXISTS metadata2_key TEXT,

-- UI and styling
ADD COLUMN IF NOT EXISTS header_logo_url TEXT,
ADD COLUMN IF NOT EXISTS message_icon_url TEXT,
ADD COLUMN IF NOT EXISTS theme_color TEXT,
ADD COLUMN IF NOT EXISTS ai_message_color TEXT,
ADD COLUMN IF NOT EXISTS ai_message_text_color TEXT,
ADD COLUMN IF NOT EXISTS font_family TEXT,
ADD COLUMN IF NOT EXISTS header_subtitle TEXT,

-- Product styling
ADD COLUMN IF NOT EXISTS product_button_text TEXT,
ADD COLUMN IF NOT EXISTS product_button_color TEXT,
ADD COLUMN IF NOT EXISTS product_button_padding TEXT,
ADD COLUMN IF NOT EXISTS product_image_height_multiplier DECIMAL DEFAULT 1,
ADD COLUMN IF NOT EXISTS product_box_height_multiplier DECIMAL DEFAULT 1,

-- Feature flags
ADD COLUMN IF NOT EXISTS enable_livechat BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS use_thumbs_rating BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS replace_exclamation_with_period BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS purchase_tracking_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS show_powered_by BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS to_human_mail BOOLEAN DEFAULT false,

-- Timing
ADD COLUMN IF NOT EXISTS rating_timer_duration INTEGER DEFAULT 18000,

-- Variable overrides
ADD COLUMN IF NOT EXISTS website_override TEXT,
ADD COLUMN IF NOT EXISTS language_override TEXT,
ADD COLUMN IF NOT EXISTS valuta_override TEXT,
ADD COLUMN IF NOT EXISTS dilling_products_kat_override TEXT,
ADD COLUMN IF NOT EXISTS dilling_colors TEXT,
ADD COLUMN IF NOT EXISTS custom_var1 TEXT,

-- Order tracking
ADD COLUMN IF NOT EXISTS order_tracking_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS order_tracking_url TEXT,
ADD COLUMN IF NOT EXISTS tracking_use_proxy BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tracking_proxy_url TEXT,
ADD COLUMN IF NOT EXISTS tracking_request_method TEXT DEFAULT 'GET',
ADD COLUMN IF NOT EXISTS tracking_needs_auth BOOLEAN DEFAULT true,

-- UI text
ADD COLUMN IF NOT EXISTS input_placeholder TEXT,
ADD COLUMN IF NOT EXISTS rating_message TEXT,
ADD COLUMN IF NOT EXISTS subtitle_link_text TEXT,
ADD COLUMN IF NOT EXISTS subtitle_link_url TEXT,

-- Freshdesk configuration
ADD COLUMN IF NOT EXISTS freshdesk_group_id INTEGER,
ADD COLUMN IF NOT EXISTS freshdesk_product_id INTEGER,
ADD COLUMN IF NOT EXISTS freshdesk_email_label TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_message_label TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_image_label TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_choose_file_text TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_no_file_text TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_sending_text TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_submit_text TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_subject_text TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_name_label TEXT,

-- Freshdesk error messages
ADD COLUMN IF NOT EXISTS freshdesk_email_required_error TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_email_invalid_error TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_form_error_text TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_message_required_error TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_name_required_error TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_submit_error_text TEXT,

-- Confirmation messages
ADD COLUMN IF NOT EXISTS contact_confirmation_text TEXT,
ADD COLUMN IF NOT EXISTS freshdesk_confirmation_text TEXT,

-- Human agent request
ADD COLUMN IF NOT EXISTS human_agent_question_text TEXT,
ADD COLUMN IF NOT EXISTS human_agent_yes_button_text TEXT,
ADD COLUMN IF NOT EXISTS human_agent_no_button_text TEXT,

-- Other fields
ADD COLUMN IF NOT EXISTS lead_mail TEXT,
ADD COLUMN IF NOT EXISTS lead_field1 TEXT,
ADD COLUMN IF NOT EXISTS lead_field2 TEXT,
ADD COLUMN IF NOT EXISTS privacy_link TEXT,
ADD COLUMN IF NOT EXISTS image_api_url TEXT,
ADD COLUMN IF NOT EXISTS preloaded_message TEXT,
ADD COLUMN IF NOT EXISTS statistics_api_url TEXT,
ADD COLUMN IF NOT EXISTS default_header_title TEXT,
ADD COLUMN IF NOT EXISTS default_header_subtitle TEXT;

-- =============================================
-- 2. INSERT/UPDATE INTEGRATION OPTIONS DATA
-- =============================================

`;

  // Helper to safely format SQL values with aggressive cleaning
  const formatValue = (value, isNumeric = false) => {
    if (value === null || value === undefined || value === '') {
      return 'NULL';
    }
    
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    
    if (typeof value === 'number' || isNumeric) {
      return value.toString();
    }
    
    // AGGRESSIVELY clean string values
    let cleanValue = String(value)
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/\/\/.*$/gm, '') // Remove // comments
      .replace(/console\.log\(.*?\);?/g, '') // Remove console.log statements
      .replace(/console\.error\(.*?\);?/g, '') // Remove console.error statements
      .replace(/console\.warn\(.*?\);?/g, '') // Remove console.warn statements
      .replace(/if\s*\([^)]*\)\s*\{[^}]*\}/g, '') // Remove simple if statements
      .replace(/function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g, '') // Remove function definitions
      .replace(/var\s+\w+\s*=.*?;/g, '') // Remove var declarations
      .replace(/let\s+\w+\s*=.*?;/g, '') // Remove let declarations
      .replace(/const\s+\w+\s*=.*?;/g, '') // Remove const declarations
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/'/g, "''") // Escape single quotes
      .trim();
    
    // If after cleaning it's empty or too short, return NULL
    if (!cleanValue || cleanValue.length < 2) {
      return 'NULL';
    }
    
    // Use dollar quoting for safety
    return `$CLEAN$${cleanValue}$CLEAN$`;
  };

  // Process each chatbot with CLEAN values
  optionsArray.forEach(options => {
    const chatbotId = options.chatbotId;
    
    sqlContent += `-- Integration options for chatbot: ${chatbotId}
INSERT INTO chatbot_settings (
  chatbot_id,
  flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, metadata2_key,
  header_logo_url, message_icon_url, theme_color, ai_message_color, ai_message_text_color,
  font_family, header_subtitle, product_button_text, product_button_color, product_button_padding,
  product_image_height_multiplier, product_box_height_multiplier,
  enable_livechat, use_thumbs_rating, replace_exclamation_with_period,
  purchase_tracking_enabled, show_powered_by, to_human_mail,
  rating_timer_duration, website_override, language_override, valuta_override,
  dilling_products_kat_override, dilling_colors, custom_var1,
  order_tracking_enabled, order_tracking_url, tracking_use_proxy,
  tracking_proxy_url, tracking_request_method, tracking_needs_auth,
  input_placeholder, rating_message, subtitle_link_text, subtitle_link_url,
  freshdesk_group_id, freshdesk_product_id, freshdesk_email_label, freshdesk_message_label,
  freshdesk_image_label, freshdesk_choose_file_text, freshdesk_no_file_text,
  freshdesk_sending_text, freshdesk_submit_text, freshdesk_subject_text, freshdesk_name_label,
  freshdesk_email_required_error, freshdesk_email_invalid_error, freshdesk_form_error_text,
  freshdesk_message_required_error, freshdesk_name_required_error, freshdesk_submit_error_text,
  contact_confirmation_text, freshdesk_confirmation_text,
  human_agent_question_text, human_agent_yes_button_text, human_agent_no_button_text,
  lead_mail, lead_field1, lead_field2, privacy_link, image_api_url,
  preloaded_message, statistics_api_url, default_header_title, default_header_subtitle,
  updated_at
) VALUES (
  '${chatbotId}',
  ${formatValue(options.flow2Key)}, ${formatValue(options.flow3Key)}, ${formatValue(options.flow4Key)},
  ${formatValue(options.apiFlowKey)}, ${formatValue(options.metaDataKey)}, ${formatValue(options.metaData2Key)},
  ${formatValue(options.headerLogoG)}, ${formatValue(options.messageIcon)}, ${formatValue(options.themeColor)},
  ${formatValue(options.aiMessageColor)}, ${formatValue(options.aiMessageTextColor)},
  ${formatValue(options.fontFamily)}, ${formatValue(options.headerSubtitleG)},
  ${formatValue(options.productButtonText)}, ${formatValue(options.productButtonColor)}, ${formatValue(options.productButtonPadding)},
  ${formatValue(options.productImageHeightMultiplier, true)}, ${formatValue(options.productBoxHeightMultiplier, true)},
  ${formatValue(options.enableLivechat)}, ${formatValue(options.useThumbsRating)}, ${formatValue(options.replaceExclamationWithPeriod)},
  ${formatValue(options.purchaseTrackingEnabled)}, ${formatValue(options.showPoweredBy)}, ${formatValue(options.toHumanMail)},
  ${formatValue(options.ratingTimerDuration, true)}, ${formatValue(options.websiteOverride)}, ${formatValue(options.languageOverride)}, ${formatValue(options.valutaOverride)},
  ${formatValue(options.dillingProductsKatOverride)}, ${formatValue(options.dillingColors)}, ${formatValue(options.customVar1)},
  ${formatValue(options.orderTrackingEnabled)}, ${formatValue(options.orderTrackingUrl)}, ${formatValue(options.trackingUseProxy)},
  ${formatValue(options.trackingProxyUrl)}, ${formatValue(options.trackingRequestMethod)}, ${formatValue(options.trackingNeedsAuth)},
  ${formatValue(options.inputPlaceholder)}, ${formatValue(options.ratingMessage)}, ${formatValue(options.subtitleLinkText)}, ${formatValue(options.subtitleLinkUrl)},
  ${formatValue(options.freshdeskGroupId, true)}, ${formatValue(options.freshdeskProductId, true)},
  ${formatValue(options.freshdeskEmailLabel)}, ${formatValue(options.freshdeskMessageLabel)},
  ${formatValue(options.freshdeskImageLabel)}, ${formatValue(options.freshdeskChooseFileText)}, ${formatValue(options.freshdeskNoFileText)},
  ${formatValue(options.freshdeskSendingText)}, ${formatValue(options.freshdeskSubmitText)}, ${formatValue(options.freshdeskSubjectText)}, ${formatValue(options.freshdeskNameLabel)},
  ${formatValue(options.freshdeskEmailRequiredError)}, ${formatValue(options.freshdeskEmailInvalidError)}, ${formatValue(options.freshdeskFormErrorText)},
  ${formatValue(options.freshdeskMessageRequiredError)}, ${formatValue(options.freshdeskNameRequiredError)}, ${formatValue(options.freshdeskSubmitErrorText)},
  ${formatValue(options.contactConfirmationText)}, ${formatValue(options.freshdeskConfirmationText)},
  ${formatValue(options.humanAgentQuestionText)}, ${formatValue(options.humanAgentYesButtonText)}, ${formatValue(options.humanAgentNoButtonText)},
  ${formatValue(options.leadMail)}, ${formatValue(options.leadField1)}, ${formatValue(options.leadField2)},
  ${formatValue(options.privacyLink)}, ${formatValue(options.imageAPI)},
  ${formatValue(options.preloadedMessage)}, ${formatValue(options.statestikAPI)},
  ${formatValue(options.defaultHeaderTitle)}, ${formatValue(options.defaultHeaderSubtitle)},
  NOW()
)
ON CONFLICT (chatbot_id) 
DO UPDATE SET
  flow2_key = EXCLUDED.flow2_key,
  flow3_key = EXCLUDED.flow3_key,
  flow4_key = EXCLUDED.flow4_key,
  apiflow_key = EXCLUDED.apiflow_key,
  metadata_key = EXCLUDED.metadata_key,
  metadata2_key = EXCLUDED.metadata2_key,
  header_logo_url = EXCLUDED.header_logo_url,
  message_icon_url = EXCLUDED.message_icon_url,
  theme_color = EXCLUDED.theme_color,
  ai_message_color = EXCLUDED.ai_message_color,
  ai_message_text_color = EXCLUDED.ai_message_text_color,
  font_family = EXCLUDED.font_family,
  header_subtitle = EXCLUDED.header_subtitle,
  product_button_text = EXCLUDED.product_button_text,
  product_button_color = EXCLUDED.product_button_color,
  product_button_padding = EXCLUDED.product_button_padding,
  product_image_height_multiplier = EXCLUDED.product_image_height_multiplier,
  product_box_height_multiplier = EXCLUDED.product_box_height_multiplier,
  enable_livechat = EXCLUDED.enable_livechat,
  use_thumbs_rating = EXCLUDED.use_thumbs_rating,
  replace_exclamation_with_period = EXCLUDED.replace_exclamation_with_period,
  purchase_tracking_enabled = EXCLUDED.purchase_tracking_enabled,
  show_powered_by = EXCLUDED.show_powered_by,
  to_human_mail = EXCLUDED.to_human_mail,
  rating_timer_duration = EXCLUDED.rating_timer_duration,
  website_override = EXCLUDED.website_override,
  language_override = EXCLUDED.language_override,
  valuta_override = EXCLUDED.valuta_override,
  dilling_products_kat_override = EXCLUDED.dilling_products_kat_override,
  dilling_colors = EXCLUDED.dilling_colors,
  custom_var1 = EXCLUDED.custom_var1,
  order_tracking_enabled = EXCLUDED.order_tracking_enabled,
  order_tracking_url = EXCLUDED.order_tracking_url,
  tracking_use_proxy = EXCLUDED.tracking_use_proxy,
  tracking_proxy_url = EXCLUDED.tracking_proxy_url,
  tracking_request_method = EXCLUDED.tracking_request_method,
  tracking_needs_auth = EXCLUDED.tracking_needs_auth,
  input_placeholder = EXCLUDED.input_placeholder,
  rating_message = EXCLUDED.rating_message,
  subtitle_link_text = EXCLUDED.subtitle_link_text,
  subtitle_link_url = EXCLUDED.subtitle_link_url,
  freshdesk_group_id = EXCLUDED.freshdesk_group_id,
  freshdesk_product_id = EXCLUDED.freshdesk_product_id,
  freshdesk_email_label = EXCLUDED.freshdesk_email_label,
  freshdesk_message_label = EXCLUDED.freshdesk_message_label,
  freshdesk_image_label = EXCLUDED.freshdesk_image_label,
  freshdesk_choose_file_text = EXCLUDED.freshdesk_choose_file_text,
  freshdesk_no_file_text = EXCLUDED.freshdesk_no_file_text,
  freshdesk_sending_text = EXCLUDED.freshdesk_sending_text,
  freshdesk_submit_text = EXCLUDED.freshdesk_submit_text,
  freshdesk_subject_text = EXCLUDED.freshdesk_subject_text,
  freshdesk_name_label = EXCLUDED.freshdesk_name_label,
  freshdesk_email_required_error = EXCLUDED.freshdesk_email_required_error,
  freshdesk_email_invalid_error = EXCLUDED.freshdesk_email_invalid_error,
  freshdesk_form_error_text = EXCLUDED.freshdesk_form_error_text,
  freshdesk_message_required_error = EXCLUDED.freshdesk_message_required_error,
  freshdesk_name_required_error = EXCLUDED.freshdesk_name_required_error,
  freshdesk_submit_error_text = EXCLUDED.freshdesk_submit_error_text,
  contact_confirmation_text = EXCLUDED.contact_confirmation_text,
  freshdesk_confirmation_text = EXCLUDED.freshdesk_confirmation_text,
  human_agent_question_text = EXCLUDED.human_agent_question_text,
  human_agent_yes_button_text = EXCLUDED.human_agent_yes_button_text,
  human_agent_no_button_text = EXCLUDED.human_agent_no_button_text,
  lead_mail = EXCLUDED.lead_mail,
  lead_field1 = EXCLUDED.lead_field1,
  lead_field2 = EXCLUDED.lead_field2,
  privacy_link = EXCLUDED.privacy_link,
  image_api_url = EXCLUDED.image_api_url,
  preloaded_message = EXCLUDED.preloaded_message,
  statistics_api_url = EXCLUDED.statistics_api_url,
  default_header_title = EXCLUDED.default_header_title,
  default_header_subtitle = EXCLUDED.default_header_subtitle,
  updated_at = NOW();

`;
  });

  sqlContent += `
-- =============================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_chatbot_settings_chatbot_id ON chatbot_settings(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_settings_updated_at ON chatbot_settings(updated_at);

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- Total chatbots processed: ${optionsArray.length}
-- All JavaScript comments and code removed
-- Generated on: ${new Date().toISOString()}
`;

  // Write to file
  const outputPath = path.join(__dirname, '..', 'ALL_INTEGRATION_OPTIONS_CLEAN.sql');
  
  try {
    fs.writeFileSync(outputPath, sqlContent, 'utf8');
    console.log(`✅ CLEAN SQL file generated successfully: ${outputPath}`);
    console.log(`📊 Summary:`);
    console.log(`   - Chatbots: ${optionsArray.length}`);
    console.log(`   - File size: ${(sqlContent.length / 1024).toFixed(1)} KB`);
    console.log(`   - JavaScript comments: REMOVED`);
    
    return outputPath;
  } catch (error) {
    console.error('❌ Error writing clean SQL file:', error);
    throw error;
  }
}

// Run the extraction
generateCleanIntegrationSQL();