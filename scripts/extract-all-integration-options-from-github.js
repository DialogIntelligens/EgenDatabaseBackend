import fetch from 'node-fetch';
import pg from 'pg';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') 
    ? false 
    : { rejectUnauthorized: false }
});

// GitHub configuration for public repository
const GITHUB_REPO = 'DialogIntelligens/scripts';
const GITHUB_BRANCH = 'main';

/**
 * Extract ALL integration options from GitHub integration scripts
 * This script updates the database directly with all integration options in chatbot_settings
 */

async function extractAllIntegrationOptionsFromGitHub() {
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
    
    console.log(`📄 Found ${jsFiles.length} JavaScript files to analyze:`);
    jsFiles.forEach(file => console.log(`  - ${file.name}`));

    // Step 2: Process each integration script
    const extractedOptions = [];
    
    for (const file of jsFiles) {
      try {
        console.log(`\n🔍 Analyzing file: ${file.name}`);
        
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
        } else {
          console.log(`⚠️ No integration options found in ${file.name}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error.message);
      }
    }

    console.log(`\n📊 Successfully extracted integration options for ${extractedOptions.length} chatbots`);

    // Step 3: Update database directly
    if (extractedOptions.length > 0) {
      await updateDatabaseWithAllOptions(extractedOptions);
    } else {
      console.log('⚠️ No integration options found to process');
    }

    console.log('\n🎉 Integration options extraction complete!');
    
  } catch (error) {
    console.error('❌ Error extracting integration options:', error);
    process.exit(1);
  } finally {
    await pool.end();
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

    const extractBooleanField = (fieldName, defaultValue = false) => {
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
    options.productButtonText = extractField('productButtonText', 'SE PRODUKT');
    options.productButtonColor = extractField('productButtonColor');
    options.productButtonPadding = extractField('productButtonPadding');
    options.productImageHeightMultiplier = extractNumberField('productImageHeightMultiplier', 1);
    options.productBoxHeightMultiplier = extractNumberField('productBoxHeightMultiplier', 1);
    
    // Feature flags
    options.enableLivechat = extractBooleanField('enableLivechat');
    options.useThumbsRating = extractBooleanField('useThumbsRating');
    options.replaceExclamationWithPeriod = extractBooleanField('replaceExclamationWithPeriod');
    options.purchaseTrackingEnabled = extractBooleanField('purchaseTrackingEnabled');
    options.showPoweredBy = extractBooleanField('showPoweredBy', true);
    
    // Timer and tracking
    options.ratingTimerDuration = extractNumberField('ratingTimerDuration', 18000);
    
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
    options.trackingRequestMethod = extractField('trackingRequestMethod', 'GET');
    options.trackingNeedsAuth = extractBooleanField('trackingNeedsAuth', true);
    
    // Form and UI text
    options.inputPlaceholder = extractField('inputPlaceholder', 'Skriv dit spørgsmål her...');
    options.ratingMessage = extractField('ratingMessage', 'Fik du besvaret dit spørgsmål?');
    options.subtitleLinkText = extractField('subtitleLinkText');
    options.subtitleLinkUrl = extractField('subtitleLinkUrl');
    
    // Freshdesk configuration
    options.freshdeskEmailLabel = extractField('freshdeskEmailLabel', 'Din email:');
    options.freshdeskMessageLabel = extractField('freshdeskMessageLabel', 'Besked til kundeservice:');
    options.freshdeskImageLabel = extractField('freshdeskImageLabel', 'Upload billede (valgfrit):');
    options.freshdeskChooseFileText = extractField('freshdeskChooseFileText', 'Vælg fil');
    options.freshdeskNoFileText = extractField('freshdeskNoFileText', 'Ingen fil valgt');
    options.freshdeskSendingText = extractField('freshdeskSendingText', 'Sender...');
    options.freshdeskSubmitText = extractField('freshdeskSubmitText', 'Send henvendelse');
    options.freshdeskSubjectText = extractField('freshdeskSubjectText', 'Din henvendelse');
    options.freshdeskNameLabel = extractField('freshdeskNameLabel', 'Dit navn:');
    
    // Freshdesk error messages
    options.freshdeskEmailRequiredError = extractField('freshdeskEmailRequiredError', 'Email er påkrævet');
    options.freshdeskEmailInvalidError = extractField('freshdeskEmailInvalidError', 'Indtast venligst en gyldig email adresse');
    options.freshdeskFormErrorText = extractField('freshdeskFormErrorText', 'Ret venligst fejlene i formularen');
    options.freshdeskMessageRequiredError = extractField('freshdeskMessageRequiredError', 'Besked er påkrævet');
    options.freshdeskNameRequiredError = extractField('freshdeskNameRequiredError', 'Navn er påkrævet');
    options.freshdeskSubmitErrorText = extractField('freshdeskSubmitErrorText', 'Der opstod en fejl ved afsendelse af henvendelsen. Prøv venligst igen.');
    
    // Confirmation messages
    options.contactConfirmationText = extractField('contactConfirmationText', 'Tak for din henvendelse, vi vender tilbage hurtigst muligt.');
    options.freshdeskConfirmationText = extractField('freshdeskConfirmationText', 'Tak for din henvendelse, vi vender tilbage hurtigst muligt.');
    
    // Human agent request
    options.humanAgentQuestionText = extractField('humanAgentQuestionText', 'Vil du gerne tale med en medarbejder?');
    options.humanAgentYesButtonText = extractField('humanAgentYesButtonText', 'Ja tak');
    options.humanAgentNoButtonText = extractField('humanAgentNoButtonText', 'Nej tak');
    
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
    options.defaultHeaderSubtitle = extractField('defaultHeaderSubtitle', 'Vores virtuelle assistent er her for at hjælpe dig.');
    
    // Freshdesk IDs
    options.freshdeskGroupId = extractNumberField('freshdeskGroupId');
    options.freshdeskProductId = extractNumberField('freshdeskProductId');

    // Check if we found at least some options
    const hasOptions = Object.values(options).some(value => value !== null && value !== undefined && value !== '');
    
    if (hasOptions) {
      console.log(`📋 Found integration options for ${options.chatbotId}`);
      const foundOptions = Object.entries(options)
        .filter(([key, value]) => value !== null && value !== undefined && value !== '' && key !== 'chatbotId')
        .map(([key]) => key);
      console.log(`  Found ${foundOptions.length} options: ${foundOptions.slice(0, 5).join(', ')}${foundOptions.length > 5 ? '...' : ''}`);
      return options;
    }

    return null;

  } catch (error) {
    console.error(`Error extracting options from ${filename}:`, error);
    return null;
  }
}

/**
 * Update database directly with all integration options
 */
async function updateDatabaseWithAllOptions(optionsArray) {
  try {
    console.log('\n💾 Updating database directly with all integration options...');
    
    // Step 1: Add all columns to the table
    console.log('📊 Adding columns to chatbot_settings table...');
    await pool.query(`
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
      ADD COLUMN IF NOT EXISTS freshdesk_product_id INTEGER
    `);
    
    console.log('✅ Columns added successfully');
    
    // Step 2: Insert/update each chatbot's options
    for (const options of optionsArray) {
      try {
        console.log(`📝 Updating ${options.chatbotId}...`);
        
        await pool.query(`
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
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
            $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50,
            $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, NOW()
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
            updated_at = NOW()
        `, [
          options.chatbotId,
          options.flow2Key, options.flow3Key, options.flow4Key, options.apiFlowKey, options.metaDataKey, options.metaData2Key,
          options.headerLogoG, options.messageIcon, options.themeColor, options.aiMessageColor, options.aiMessageTextColor,
          options.fontFamily, options.productButtonText, options.productButtonColor, options.productButtonPadding,
          options.productImageHeightMultiplier, options.productBoxHeightMultiplier,
          options.enableLivechat, options.useThumbsRating, options.replaceExclamationWithPeriod,
          options.purchaseTrackingEnabled, options.showPoweredBy, options.ratingTimerDuration,
          options.websiteOverride, options.languageOverride, options.valutaOverride,
          options.dillingProductsKatOverride, options.dillingColors, options.customVar1,
          options.orderTrackingEnabled, options.orderTrackingUrl, options.trackingUseProxy,
          options.trackingProxyUrl, options.trackingRequestMethod, options.trackingNeedsAuth,
          options.inputPlaceholder, options.ratingMessage, options.subtitleLinkText, options.subtitleLinkUrl,
          options.freshdeskEmailLabel, options.freshdeskMessageLabel, options.freshdeskImageLabel,
          options.freshdeskChooseFileText, options.freshdeskNoFileText, options.freshdeskSendingText,
          options.freshdeskSubmitText, options.freshdeskSubjectText, options.freshdeskNameLabel,
          options.freshdeskEmailRequiredError, options.freshdeskEmailInvalidError, options.freshdeskFormErrorText,
          options.freshdeskMessageRequiredError, options.freshdeskNameRequiredError, options.freshdeskSubmitErrorText,
          options.contactConfirmationText, options.freshdeskConfirmationText,
          options.humanAgentQuestionText, options.humanAgentYesButtonText, options.humanAgentNoButtonText,
          options.leadMail, options.leadField1, options.leadField2,
          options.privacyLink, options.imageAPI, options.preloadedMessage, options.statestikAPI,
          options.defaultHeaderTitle, options.defaultHeaderSubtitle,
          options.freshdeskGroupId, options.freshdeskProductId
        ]);
        
        console.log(`✅ Updated ${options.chatbotId} successfully`);
        
      } catch (error) {
        console.error(`❌ Error updating ${options.chatbotId}:`, error.message);
      }
    }
    
    // Step 3: Show final verification
    console.log('\n📊 Verification: Showing updated chatbots...');
    const result = await pool.query(`
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
      ORDER BY chatbot_id
    `);
    
    console.log(`\n✅ Successfully updated ${optionsArray.length} chatbots:`);
    result.rows.forEach(row => {
      console.log(`  ${row.chatbot_id}: flow3=${row.flow3_key}, flow4=${row.flow4_key}, apiflow=${row.apiflow_key}, theme=${row.theme_color}`);
    });
    
  } catch (error) {
    console.error('❌ Error updating database:', error);
    throw error;
  }
}

// Run the extraction
extractAllIntegrationOptionsFromGitHub();
