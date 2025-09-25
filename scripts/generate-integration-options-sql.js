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
 * This script generates a clean SQL file for pgAdmin execution
 */

async function generateIntegrationOptionsSQL() {
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
    
    console.log(`📄 Found ${jsFiles.length} JavaScript files to analyze`);

    // Step 2: Process each integration script
    const extractedOptions = [];
    
    for (const file of jsFiles) {
      try {
        // Fetch file content directly from download_url
        const fileResponse = await fetch(file.download_url);
        if (!fileResponse.ok) {
          console.warn(`⚠️ Failed to fetch ${file.name}: ${fileResponse.status}`);
          continue;
        }
        
        const content = await fileResponse.text();
        
        // Extract all options from the file
        const options = extractAllOptionsFromScript(content, file.name);
        if (options) {
          extractedOptions.push(options);
          console.log(`✅ Extracted integration options for chatbot: ${options.chatbotId}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error.message);
      }
    }

    console.log(`\n📊 Successfully extracted integration options for ${extractedOptions.length} chatbots`);

    // Step 3: Generate SQL file
    if (extractedOptions.length > 0) {
      generateSQLFile(extractedOptions);
    } else {
      console.log('⚠️ No integration options found to process');
    }

    console.log('\n🎉 Integration options SQL generation complete!');
    
  } catch (error) {
    console.error('❌ Error extracting integration options:', error);
    process.exit(1);
  }
}

/**
 * Extract all integration options from a JavaScript integration script
 */
function extractAllOptionsFromScript(content, filename) {
  try {
    const options = {};
    
    // Extract chatbot ID
    const chatbotIdMatch = content.match(/chatbotID:\s*["']([^"']+)["'],?\s*$/m);
    if (!chatbotIdMatch) {
      const altChatbotIdMatch = content.match(/chatbotID:\s*["']([^"']+)["']/);
      if (!altChatbotIdMatch) {
        return null;
      }
      options.chatbotId = altChatbotIdMatch[1];
    } else {
      options.chatbotId = chatbotIdMatch[1];
    }

    // Extract all the integration options
    const extractField = (fieldName, defaultValue = null) => {
      const match = content.match(new RegExp(`${fieldName}:\\s*["']([^"']*(?:[^"'\\\\]|\\\\.)*)["'],?\\s*$`, 'm'));
      if (match) {
        let value = match[1];
        value = value.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, '\n').trim();
        return value || defaultValue;
      }
      return defaultValue;
    };

    const extractBooleanField = (fieldName, defaultValue = null) => {
      const match = content.match(new RegExp(`${fieldName}:\\s*(true|false),?\\s*$`, 'm'));
      if (match) {
        return match[1] === 'true';
      }
      return defaultValue;
    };

    const extractNumberField = (fieldName, defaultValue = null) => {
      const match = content.match(new RegExp(`${fieldName}:\\s*(\\d+),?\\s*$`, 'm'));
      if (match) {
        return parseInt(match[1]);
      }
      return defaultValue;
    };

    // Extract all fields from integration options
    options.headerLogoG = extractField('headerLogoG');
    options.messageIcon = extractField('messageIcon');
    options.themeColor = extractField('themeColor');
    options.aiMessageColor = extractField('aiMessageColor');
    options.aiMessageTextColor = extractField('aiMessageTextColor');
    options.headerTitleG = extractField('headerTitleG');
    options.headerSubtitleG = extractField('headerSubtitleG');
    options.titleG = extractField('titleG');
    options.firstMessage = extractField('firstMessage');
    options.fontFamily = extractField('fontFamily');
    
    // Flow keys
    options.flow2Key = extractField('flow2Key');
    options.flow3Key = extractField('flow3Key');
    options.flow4Key = extractField('flow4Key');
    options.apiFlowKey = extractField('apiFlowKey');
    options.metaDataKey = extractField('metaDataKey');
    options.metaData2Key = extractField('metaData2Key');
    
    // Pinecone configuration
    options.pineconeApiKey = extractField('pineconeApiKey');
    options.knowledgebaseIndexApiEndpoint = extractField('knowledgebaseIndexApiEndpoint');
    options.flow2KnowledgebaseIndex = extractField('flow2KnowledgebaseIndex');
    options.flow3KnowledgebaseIndex = extractField('flow3KnowledgebaseIndex');
    options.flow4KnowledgebaseIndex = extractField('flow4KnowledgebaseIndex');
    options.apiFlowKnowledgebaseIndex = extractField('apiFlowKnowledgebaseIndex');
    
    // UI and styling options
    options.productButtonText = extractField('productButtonText');
    options.productButtonColor = extractField('productButtonColor');
    options.productButtonPadding = extractField('productButtonPadding');
    options.productImageHeightMultiplier = extractNumberField('productImageHeightMultiplier');
    options.productBoxHeightMultiplier = extractNumberField('productBoxHeightMultiplier');
    
    // Feature flags
    options.enableLivechat = extractBooleanField('enableLivechat');
    options.useThumbsRating = extractBooleanField('useThumbsRating');
    options.replaceExclamationWithPeriod = extractBooleanField('replaceExclamationWithPeriod');
    options.purchaseTrackingEnabled = extractBooleanField('purchaseTrackingEnabled');
    options.showPoweredBy = extractBooleanField('showPoweredBy');
    
    // Timer and tracking
    options.ratingTimerDuration = extractNumberField('ratingTimerDuration');
    
    // Override variables
    options.websiteOverride = extractField('websiteOverride');
    options.languageOverride = extractField('languageOverride');
    options.valutaOverride = extractField('valutaOverride');
    options.dillingProductsKatOverride = extractField('dillingProductsKatOverride');
    options.dillingColors = extractField('dillingColors');
    options.customVar1 = extractField('customVar1');
    
    // Order tracking
    options.orderTrackingEnabled = extractBooleanField('orderTrackingEnabled');
    options.orderTrackingUrl = extractField('orderTrackingUrl');
    options.trackingUseProxy = extractBooleanField('trackingUseProxy');
    options.trackingProxyUrl = extractField('trackingProxyUrl');
    options.trackingRequestMethod = extractField('trackingRequestMethod');
    options.trackingNeedsAuth = extractBooleanField('trackingNeedsAuth');
    
    // Form and UI text
    options.inputPlaceholder = extractField('inputPlaceholder');
    options.ratingMessage = extractField('ratingMessage');
    options.subtitleLinkText = extractField('subtitleLinkText');
    options.subtitleLinkUrl = extractField('subtitleLinkUrl');
    
    // Freshdesk configuration
    options.freshdeskEmailLabel = extractField('freshdeskEmailLabel');
    options.freshdeskMessageLabel = extractField('freshdeskMessageLabel');
    options.freshdeskImageLabel = extractField('freshdeskImageLabel');
    options.freshdeskChooseFileText = extractField('freshdeskChooseFileText');
    options.freshdeskNoFileText = extractField('freshdeskNoFileText');
    options.freshdeskSendingText = extractField('freshdeskSendingText');
    options.freshdeskSubmitText = extractField('freshdeskSubmitText');
    options.freshdeskSubjectText = extractField('freshdeskSubjectText');
    options.freshdeskNameLabel = extractField('freshdeskNameLabel');
    
    // Freshdesk error messages
    options.freshdeskEmailRequiredError = extractField('freshdeskEmailRequiredError');
    options.freshdeskEmailInvalidError = extractField('freshdeskEmailInvalidError');
    options.freshdeskFormErrorText = extractField('freshdeskFormErrorText');
    options.freshdeskMessageRequiredError = extractField('freshdeskMessageRequiredError');
    options.freshdeskNameRequiredError = extractField('freshdeskNameRequiredError');
    options.freshdeskSubmitErrorText = extractField('freshdeskSubmitErrorText');
    
    // Confirmation messages
    options.contactConfirmationText = extractField('contactConfirmationText');
    options.freshdeskConfirmationText = extractField('freshdeskConfirmationText');
    
    // Human agent request
    options.humanAgentQuestionText = extractField('humanAgentQuestionText');
    options.humanAgentYesButtonText = extractField('humanAgentYesButtonText');
    options.humanAgentNoButtonText = extractField('humanAgentNoButtonText');
    
    // Lead generation
    options.leadMail = extractField('leadMail');
    options.leadField1 = extractField('leadField1');
    options.leadField2 = extractField('leadField2');
    
    // Other options
    options.privacyLink = extractField('privacyLink');
    options.imageAPI = extractField('imageAPI');
    options.preloadedMessage = extractField('preloadedMessage');
    options.statestikAPI = extractField('statestikAPI');
    options.defaultHeaderTitle = extractField('defaultHeaderTitle');
    options.defaultHeaderSubtitle = extractField('defaultHeaderSubtitle');
    
    // Freshdesk IDs
    options.freshdeskGroupId = extractNumberField('freshdeskGroupId');
    options.freshdeskProductId = extractNumberField('freshdeskProductId');

    // Check if we found at least some options
    const hasOptions = Object.values(options).some(value => value !== null && value !== undefined && value !== '');
    
    if (hasOptions) {
      return options;
    }

    return null;

  } catch (error) {
    console.error(`Error extracting options from ${filename}:`, error);
    return null;
  }
}

/**
 * Generate SQL file for pgAdmin
 */
function generateSQLFile(optionsArray) {
  const sqlFilePath = path.join(__dirname, '..', 'ALL_INTEGRATION_OPTIONS.sql');
  
  let sqlContent = `-- ALL INTEGRATION OPTIONS MIGRATION
-- Generated from GitHub integration scripts
-- Run this SQL in pgAdmin to store all integration options in database
-- Generated: ${new Date().toISOString()}

-- 1. Add ALL integration option columns to chatbot_settings table
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
ADD COLUMN IF NOT EXISTS product_button_text TEXT,
ADD COLUMN IF NOT EXISTS product_button_color TEXT,
ADD COLUMN IF NOT EXISTS product_button_padding TEXT,
ADD COLUMN IF NOT EXISTS product_image_height_multiplier DECIMAL,
ADD COLUMN IF NOT EXISTS product_box_height_multiplier DECIMAL,

-- Feature flags
ADD COLUMN IF NOT EXISTS enable_livechat BOOLEAN,
ADD COLUMN IF NOT EXISTS use_thumbs_rating BOOLEAN,
ADD COLUMN IF NOT EXISTS replace_exclamation_with_period BOOLEAN,
ADD COLUMN IF NOT EXISTS purchase_tracking_enabled BOOLEAN,
ADD COLUMN IF NOT EXISTS show_powered_by BOOLEAN,

-- Timer and tracking
ADD COLUMN IF NOT EXISTS rating_timer_duration INTEGER,

-- Override variables
ADD COLUMN IF NOT EXISTS website_override TEXT,
ADD COLUMN IF NOT EXISTS language_override TEXT,
ADD COLUMN IF NOT EXISTS valuta_override TEXT,
ADD COLUMN IF NOT EXISTS dilling_products_kat_override TEXT,
ADD COLUMN IF NOT EXISTS dilling_colors TEXT,
ADD COLUMN IF NOT EXISTS custom_var1 TEXT,

-- Order tracking
ADD COLUMN IF NOT EXISTS order_tracking_enabled BOOLEAN,
ADD COLUMN IF NOT EXISTS order_tracking_url TEXT,
ADD COLUMN IF NOT EXISTS tracking_use_proxy BOOLEAN,
ADD COLUMN IF NOT EXISTS tracking_proxy_url TEXT,
ADD COLUMN IF NOT EXISTS tracking_request_method TEXT,
ADD COLUMN IF NOT EXISTS tracking_needs_auth BOOLEAN,

-- Form and UI text
ADD COLUMN IF NOT EXISTS input_placeholder TEXT,
ADD COLUMN IF NOT EXISTS rating_message TEXT,
ADD COLUMN IF NOT EXISTS subtitle_link_text TEXT,
ADD COLUMN IF NOT EXISTS subtitle_link_url TEXT,

-- Freshdesk configuration
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

-- Lead generation
ADD COLUMN IF NOT EXISTS lead_mail TEXT,
ADD COLUMN IF NOT EXISTS lead_field1 TEXT,
ADD COLUMN IF NOT EXISTS lead_field2 TEXT,

-- Other options
ADD COLUMN IF NOT EXISTS privacy_link TEXT,
ADD COLUMN IF NOT EXISTS image_api TEXT,
ADD COLUMN IF NOT EXISTS preloaded_message TEXT,
ADD COLUMN IF NOT EXISTS statestik_api TEXT,
ADD COLUMN IF NOT EXISTS default_header_title TEXT,
ADD COLUMN IF NOT EXISTS default_header_subtitle TEXT,

-- Freshdesk IDs
ADD COLUMN IF NOT EXISTS freshdesk_group_id INTEGER,
ADD COLUMN IF NOT EXISTS freshdesk_product_id INTEGER;

-- 2. Insert/update integration options for all chatbots
`;

  // Add each chatbot's options
  optionsArray.forEach((options, index) => {
    sqlContent += `
-- Integration options for chatbot: ${options.chatbotId}
INSERT INTO chatbot_settings (
  chatbot_id,
  flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, metadata2_key,
  header_logo_url, message_icon_url, theme_color, ai_message_color, ai_message_text_color,
  font_family, product_button_text, product_button_color, product_button_padding,
  product_image_height_multiplier, product_box_height_multiplier,
  enable_livechat, use_thumbs_rating, replace_exclamation_with_period,
  purchase_tracking_enabled, show_powered_by, rating_timer_duration,
  website_override, language_override, valuta_override,
  dilling_products_kat_override, dilling_colors, custom_var1,
  order_tracking_enabled, order_tracking_url, tracking_use_proxy,
  tracking_proxy_url, tracking_request_method, tracking_needs_auth,
  input_placeholder, rating_message, subtitle_link_text, subtitle_link_url,
  freshdesk_email_label, freshdesk_message_label, freshdesk_image_label,
  freshdesk_choose_file_text, freshdesk_no_file_text, freshdesk_sending_text,
  freshdesk_submit_text, freshdesk_subject_text, freshdesk_name_label,
  freshdesk_email_required_error, freshdesk_email_invalid_error, freshdesk_form_error_text,
  freshdesk_message_required_error, freshdesk_name_required_error, freshdesk_submit_error_text,
  contact_confirmation_text, freshdesk_confirmation_text,
  human_agent_question_text, human_agent_yes_button_text, human_agent_no_button_text,
  lead_mail, lead_field1, lead_field2,
  privacy_link, image_api, preloaded_message, statestik_api,
  default_header_title, default_header_subtitle,
  freshdesk_group_id, freshdesk_product_id, updated_at
) VALUES (
  '${options.chatbotId}',
  ${options.flow2Key ? `'${options.flow2Key}'` : 'NULL'},
  ${options.flow3Key ? `'${options.flow3Key}'` : 'NULL'},
  ${options.flow4Key ? `'${options.flow4Key}'` : 'NULL'},
  ${options.apiFlowKey ? `'${options.apiFlowKey}'` : 'NULL'},
  ${options.metaDataKey ? `'${options.metaDataKey}'` : 'NULL'},
  ${options.metaData2Key ? `'${options.metaData2Key}'` : 'NULL'},
  ${options.headerLogoG ? `$tag$${options.headerLogoG}$tag$` : 'NULL'},
  ${options.messageIcon ? `$tag$${options.messageIcon}$tag$` : 'NULL'},
  ${options.themeColor ? `'${options.themeColor}'` : 'NULL'},
  ${options.aiMessageColor ? `'${options.aiMessageColor}'` : 'NULL'},
  ${options.aiMessageTextColor ? `'${options.aiMessageTextColor}'` : 'NULL'},
  ${options.fontFamily ? `'${options.fontFamily}'` : 'NULL'},
  ${options.productButtonText ? `'${options.productButtonText}'` : 'NULL'},
  ${options.productButtonColor ? `'${options.productButtonColor}'` : 'NULL'},
  ${options.productButtonPadding ? `'${options.productButtonPadding}'` : 'NULL'},
  ${options.productImageHeightMultiplier || 'NULL'},
  ${options.productBoxHeightMultiplier || 'NULL'},
  ${options.enableLivechat !== null ? options.enableLivechat : 'NULL'},
  ${options.useThumbsRating !== null ? options.useThumbsRating : 'NULL'},
  ${options.replaceExclamationWithPeriod !== null ? options.replaceExclamationWithPeriod : 'NULL'},
  ${options.purchaseTrackingEnabled !== null ? options.purchaseTrackingEnabled : 'NULL'},
  ${options.showPoweredBy !== null ? options.showPoweredBy : 'NULL'},
  ${options.ratingTimerDuration || 'NULL'},
  ${options.websiteOverride ? `'${options.websiteOverride}'` : 'NULL'},
  ${options.languageOverride ? `'${options.languageOverride}'` : 'NULL'},
  ${options.valutaOverride ? `'${options.valutaOverride}'` : 'NULL'},
  ${options.dillingProductsKatOverride ? `'${options.dillingProductsKatOverride}'` : 'NULL'},
  ${options.dillingColors ? `'${options.dillingColors}'` : 'NULL'},
  ${options.customVar1 ? `'${options.customVar1}'` : 'NULL'},
  ${options.orderTrackingEnabled !== null ? options.orderTrackingEnabled : 'NULL'},
  ${options.orderTrackingUrl ? `$tag$${options.orderTrackingUrl}$tag$` : 'NULL'},
  ${options.trackingUseProxy !== null ? options.trackingUseProxy : 'NULL'},
  ${options.trackingProxyUrl ? `$tag$${options.trackingProxyUrl}$tag$` : 'NULL'},
  ${options.trackingRequestMethod ? `'${options.trackingRequestMethod}'` : 'NULL'},
  ${options.trackingNeedsAuth !== null ? options.trackingNeedsAuth : 'NULL'},
  ${options.inputPlaceholder ? `$tag$${options.inputPlaceholder}$tag$` : 'NULL'},
  ${options.ratingMessage ? `$tag$${options.ratingMessage}$tag$` : 'NULL'},
  ${options.subtitleLinkText ? `$tag$${options.subtitleLinkText}$tag$` : 'NULL'},
  ${options.subtitleLinkUrl ? `$tag$${options.subtitleLinkUrl}$tag$` : 'NULL'},
  ${options.freshdeskEmailLabel ? `$tag$${options.freshdeskEmailLabel}$tag$` : 'NULL'},
  ${options.freshdeskMessageLabel ? `$tag$${options.freshdeskMessageLabel}$tag$` : 'NULL'},
  ${options.freshdeskImageLabel ? `$tag$${options.freshdeskImageLabel}$tag$` : 'NULL'},
  ${options.freshdeskChooseFileText ? `$tag$${options.freshdeskChooseFileText}$tag$` : 'NULL'},
  ${options.freshdeskNoFileText ? `$tag$${options.freshdeskNoFileText}$tag$` : 'NULL'},
  ${options.freshdeskSendingText ? `$tag$${options.freshdeskSendingText}$tag$` : 'NULL'},
  ${options.freshdeskSubmitText ? `$tag$${options.freshdeskSubmitText}$tag$` : 'NULL'},
  ${options.freshdeskSubjectText ? `$tag$${options.freshdeskSubjectText}$tag$` : 'NULL'},
  ${options.freshdeskNameLabel ? `$tag$${options.freshdeskNameLabel}$tag$` : 'NULL'},
  ${options.freshdeskEmailRequiredError ? `$tag$${options.freshdeskEmailRequiredError}$tag$` : 'NULL'},
  ${options.freshdeskEmailInvalidError ? `$tag$${options.freshdeskEmailInvalidError}$tag$` : 'NULL'},
  ${options.freshdeskFormErrorText ? `$tag$${options.freshdeskFormErrorText}$tag$` : 'NULL'},
  ${options.freshdeskMessageRequiredError ? `$tag$${options.freshdeskMessageRequiredError}$tag$` : 'NULL'},
  ${options.freshdeskNameRequiredError ? `$tag$${options.freshdeskNameRequiredError}$tag$` : 'NULL'},
  ${options.freshdeskSubmitErrorText ? `$tag$${options.freshdeskSubmitErrorText}$tag$` : 'NULL'},
  ${options.contactConfirmationText ? `$tag$${options.contactConfirmationText}$tag$` : 'NULL'},
  ${options.freshdeskConfirmationText ? `$tag$${options.freshdeskConfirmationText}$tag$` : 'NULL'},
  ${options.humanAgentQuestionText ? `$tag$${options.humanAgentQuestionText}$tag$` : 'NULL'},
  ${options.humanAgentYesButtonText ? `$tag$${options.humanAgentYesButtonText}$tag$` : 'NULL'},
  ${options.humanAgentNoButtonText ? `$tag$${options.humanAgentNoButtonText}$tag$` : 'NULL'},
  ${options.leadMail ? `$tag$${options.leadMail}$tag$` : 'NULL'},
  ${options.leadField1 ? `$tag$${options.leadField1}$tag$` : 'NULL'},
  ${options.leadField2 ? `$tag$${options.leadField2}$tag$` : 'NULL'},
  ${options.privacyLink ? `$tag$${options.privacyLink}$tag$` : 'NULL'},
  ${options.imageAPI ? `$tag$${options.imageAPI}$tag$` : 'NULL'},
  ${options.preloadedMessage ? `$tag$${options.preloadedMessage}$tag$` : 'NULL'},
  ${options.statestikAPI ? `$tag$${options.statestikAPI}$tag$` : 'NULL'},
  ${options.defaultHeaderTitle ? `$tag$${options.defaultHeaderTitle}$tag$` : 'NULL'},
  ${options.defaultHeaderSubtitle ? `$tag$${options.defaultHeaderSubtitle}$tag$` : 'NULL'},
  ${options.freshdeskGroupId || 'NULL'},
  ${options.freshdeskProductId || 'NULL'},
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
  image_api = EXCLUDED.image_api,
  preloaded_message = EXCLUDED.preloaded_message,
  statestik_api = EXCLUDED.statestik_api,
  default_header_title = EXCLUDED.default_header_title,
  default_header_subtitle = EXCLUDED.default_header_subtitle,
  freshdesk_group_id = EXCLUDED.freshdesk_group_id,
  freshdesk_product_id = EXCLUDED.freshdesk_product_id,
  updated_at = NOW();
`;
  });

  // Add verification query
  sqlContent += `
-- 3. Verification: Show all updated chatbots
SELECT 
  chatbot_id,
  flow3_key,
  flow4_key,
  apiflow_key,
  theme_color,
  enable_livechat,
  purchase_tracking_enabled,
  input_placeholder
FROM chatbot_settings 
WHERE chatbot_id IS NOT NULL
ORDER BY chatbot_id;

-- End of migration script
-- Successfully extracted options for ${optionsArray.length} chatbots
`;

  // Write to file
  fs.writeFileSync(sqlFilePath, sqlContent);
  
  console.log(`\n📝 SQL file generated: ${sqlFilePath}`);
  console.log(`📊 Contains migration for ${optionsArray.length} chatbots`);
  console.log('\n🎯 Next steps:');
  console.log('1. Open pgAdmin');
  console.log(`2. Run the SQL file: ${sqlFilePath}`);
  console.log('3. Verify all chatbots are updated');
  console.log('\n✅ This will completely replace the old integration script system!');
}

// Run the extraction
generateIntegrationOptionsSQL();
