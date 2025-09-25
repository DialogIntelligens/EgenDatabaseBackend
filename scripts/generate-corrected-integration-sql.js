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
 * This script generates a CORRECTED SQL file that properly parses the JavaScript object structure
 */

async function generateCorrectedIntegrationSQL() {
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
        const options = extractOptionsFromJavaScriptObject(content, file.name);
        
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

    // Step 3: Generate CORRECTED SQL file
    if (extractedOptions.length > 0) {
      const sqlFilePath = generateCorrectedSQLFile(extractedOptions);
      console.log(`\n🎯 Next Steps:`);
      console.log(`1. Open pgAdmin`);
      console.log(`2. Run the SQL file: ${sqlFilePath}`);
      console.log(`3. The integration options will be updated in the database`);
    } else {
      console.log('⚠️ No integration options found to process');
    }

    console.log('\n🎉 Corrected integration options SQL generation complete!');
    
  } catch (error) {
    console.error('❌ Error generating corrected integration SQL:', error);
    process.exit(1);
  }
}

/**
 * Extract integration options from JavaScript object structure (like in It_script_new.js)
 */
function extractOptionsFromJavaScriptObject(content, filename) {
  try {
    // Extract chatbot ID from filename
    const chatbotId = filename.replace('.js', '');
    
    console.log(`🔍 Processing chatbot: ${chatbotId}`);
    
    // Find the messageData object in the content
    const messageDataMatch = content.match(/var\s+messageData\s*=\s*\{([\s\S]*?)\};/);
    if (!messageDataMatch) {
      console.log(`⚠️ No messageData object found in ${filename}`);
      return null;
    }
    
    const messageDataContent = messageDataMatch[1];
    
    // Helper function to extract values from the JavaScript object
    const extractFromObject = (fieldName, defaultValue = null) => {
      // Look for field: "value" or field: 'value' patterns
      const patterns = [
        new RegExp(`${fieldName}\\s*:\\s*["']([^"']*?)["']`, 'i'),
        new RegExp(`${fieldName}\\s*:\\s*(\`[^\`]*?\`)`, 'i'), // Template literals
        new RegExp(`${fieldName}\\s*:\\s*([^,\\n}]+)`, 'i') // Any value until comma or newline
      ];
      
      for (const pattern of patterns) {
        const match = messageDataContent.match(pattern);
        if (match && match[1]) {
          let value = match[1].trim();
          
          // Remove quotes and backticks
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'")) ||
              (value.startsWith('`') && value.endsWith('`'))) {
            value = value.slice(1, -1);
          }
          
          // Clean the value
          return value
            .replace(/\\n/g, '\n') // Convert escaped newlines
            .replace(/\\"/g, '"') // Convert escaped quotes
            .replace(/\\'/g, "'") // Convert escaped quotes
            .trim();
        }
      }
      return defaultValue;
    };
    
    // Helper function to extract boolean values
    const extractBooleanFromObject = (fieldName, defaultValue = null) => {
      const patterns = [
        new RegExp(`${fieldName}\\s*:\\s*(true|false)`, 'i')
      ];
      
      for (const pattern of patterns) {
        const match = messageDataContent.match(pattern);
        if (match && match[1]) {
          return match[1].toLowerCase() === 'true';
        }
      }
      return defaultValue;
    };
    
    // Helper function to extract number values
    const extractNumberFromObject = (fieldName, defaultValue = null) => {
      const patterns = [
        new RegExp(`${fieldName}\\s*:\\s*(\\d+(?:\\.\\d+)?)`, 'i')
      ];
      
      for (const pattern of patterns) {
        const match = messageDataContent.match(pattern);
        if (match && match[1]) {
          return parseFloat(match[1]);
        }
      }
      return defaultValue;
    };

    // Extract all integration options from the JavaScript object
    const options = {
      chatbotId,
      // Flow keys
      flow2Key: extractFromObject('flow2Key'),
      flow3Key: extractFromObject('flow3Key'),
      flow4Key: extractFromObject('flow4Key'),
      apiFlowKey: extractFromObject('apiFlowKey'),
      metaDataKey: extractFromObject('metaDataKey'),
      metaData2Key: extractFromObject('metaData2Key'),
      
      // UI and styling
      headerLogoG: extractFromObject('headerLogoG'),
      messageIcon: extractFromObject('messageIcon'),
      themeColor: extractFromObject('themeColor'),
      aiMessageColor: extractFromObject('aiMessageColor'),
      aiMessageTextColor: extractFromObject('aiMessageTextColor'),
      fontFamily: extractFromObject('fontFamily'),
      headerTitleG: extractFromObject('headerTitleG'),
      headerSubtitleG: extractFromObject('headerSubtitleG'),
      titleG: extractFromObject('titleG'),
      firstMessage: extractFromObject('firstMessage'),
      
      // Product styling
      productButtonText: extractFromObject('productButtonText'),
      productButtonColor: extractFromObject('productButtonColor'),
      productButtonPadding: extractFromObject('productButtonPadding'),
      productImageHeightMultiplier: extractNumberFromObject('productImageHeightMultiplier'),
      productBoxHeightMultiplier: extractNumberFromObject('productBoxHeightMultiplier'),
      
      // Feature flags
      enableLivechat: extractBooleanFromObject('enableLivechat'),
      useThumbsRating: extractBooleanFromObject('useThumbsRating'),
      replaceExclamationWithPeriod: extractBooleanFromObject('replaceExclamationWithPeriod'),
      purchaseTrackingEnabled: extractBooleanFromObject('purchaseTrackingEnabled'),
      showPoweredBy: extractBooleanFromObject('showPoweredBy'),
      toHumanMail: extractBooleanFromObject('toHumanMail'),
      gptInterface: extractBooleanFromObject('gptInterface'),
      isTabletView: extractBooleanFromObject('isTabletView'),
      isPhoneView: extractBooleanFromObject('isPhoneView'),
      
      // Timing
      ratingTimerDuration: extractNumberFromObject('ratingTimerDuration'),
      
      // Variable overrides
      websiteOverride: extractFromObject('websiteOverride'),
      languageOverride: extractFromObject('languageOverride'),
      valutaOverride: extractFromObject('valutaOverride'),
      dillingProductsKatOverride: extractFromObject('dillingProductsKatOverride'),
      dillingColors: extractFromObject('dillingColors'),
      customVar1: extractFromObject('customVar1'),
      
      // Order tracking
      orderTrackingEnabled: extractBooleanFromObject('orderTrackingEnabled'),
      orderTrackingUrl: extractFromObject('orderTrackingUrl'),
      trackingUseProxy: extractBooleanFromObject('trackingUseProxy'),
      trackingProxyUrl: extractFromObject('trackingProxyUrl'),
      trackingRequestMethod: extractFromObject('trackingRequestMethod'),
      trackingNeedsAuth: extractBooleanFromObject('trackingNeedsAuth'),
      
      // UI text
      inputPlaceholder: extractFromObject('inputPlaceholder'),
      ratingMessage: extractFromObject('ratingMessage'),
      subtitleLinkText: extractFromObject('subtitleLinkText'),
      subtitleLinkUrl: extractFromObject('subtitleLinkUrl'),
      
      // Freshdesk configuration
      freshdeskGroupId: extractNumberFromObject('freshdeskGroupId'),
      freshdeskProductId: extractNumberFromObject('freshdeskProductId'),
      freshdeskEmailLabel: extractFromObject('freshdeskEmailLabel'),
      freshdeskMessageLabel: extractFromObject('freshdeskMessageLabel'),
      freshdeskImageLabel: extractFromObject('freshdeskImageLabel'),
      freshdeskChooseFileText: extractFromObject('freshdeskChooseFileText'),
      freshdeskNoFileText: extractFromObject('freshdeskNoFileText'),
      freshdeskSendingText: extractFromObject('freshdeskSendingText'),
      freshdeskSubmitText: extractFromObject('freshdeskSubmitText'),
      freshdeskSubjectText: extractFromObject('freshdeskSubjectText'),
      freshdeskNameLabel: extractFromObject('freshdeskNameLabel'),
      
      // Freshdesk error messages
      freshdeskEmailRequiredError: extractFromObject('freshdeskEmailRequiredError'),
      freshdeskEmailInvalidError: extractFromObject('freshdeskEmailInvalidError'),
      freshdeskFormErrorText: extractFromObject('freshdeskFormErrorText'),
      freshdeskMessageRequiredError: extractFromObject('freshdeskMessageRequiredError'),
      freshdeskNameRequiredError: extractFromObject('freshdeskNameRequiredError'),
      freshdeskSubmitErrorText: extractFromObject('freshdeskSubmitErrorText'),
      
      // Confirmation messages
      contactConfirmationText: extractFromObject('contactConfirmationText'),
      freshdeskConfirmationText: extractFromObject('freshdeskConfirmationText'),
      
      // Human agent request
      humanAgentQuestionText: extractFromObject('humanAgentQuestionText'),
      humanAgentYesButtonText: extractFromObject('humanAgentYesButtonText'),
      humanAgentNoButtonText: extractFromObject('humanAgentNoButtonText'),
      
      // Other fields
      leadMail: extractFromObject('leadMail'),
      leadField1: extractFromObject('leadField1'),
      leadField2: extractFromObject('leadField2'),
      privacyLink: extractFromObject('privacyLink'),
      imageAPI: extractFromObject('imageAPI'),
      preloadedMessage: extractFromObject('preloadedMessage'),
      statestikAPI: extractFromObject('statestikAPI'),
      defaultHeaderTitle: extractFromObject('defaultHeaderTitle'),
      defaultHeaderSubtitle: extractFromObject('defaultHeaderSubtitle'),
      
      // Pinecone configuration
      pineconeApiKey: extractFromObject('pineconeApiKey'),
      knowledgebaseIndexApiEndpoint: extractFromObject('knowledgebaseIndexApiEndpoint'),
      flow2KnowledgebaseIndex: extractFromObject('flow2KnowledgebaseIndex'),
      flow3KnowledgebaseIndex: extractFromObject('flow3KnowledgebaseIndex'),
      flow4KnowledgebaseIndex: extractFromObject('flow4KnowledgebaseIndex'),
      apiFlowKnowledgebaseIndex: extractFromObject('apiFlowKnowledgebaseIndex')
    };

    // Debug: Log what we found for the first few bots
    if (chatbotId === 'vinhuset' || chatbotId.includes('dilling') || chatbotId.includes('bodylab')) {
      console.log(`🔍 DEBUG - Extracted values for ${chatbotId}:`, {
        themeColor: options.themeColor,
        headerLogoG: options.headerLogoG,
        firstMessage: options.firstMessage?.substring(0, 50) + '...',
        flow3Key: options.flow3Key,
        apiFlowKey: options.apiFlowKey
      });
    }

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
 * Generate corrected SQL file that UPDATES existing columns
 */
function generateCorrectedSQLFile(optionsArray) {
  console.log('\n📝 Generating CORRECTED SQL file for pgAdmin execution...');
  
  let sqlContent = `-- CORRECTED INTEGRATION OPTIONS UPDATE SQL
-- Generated on: ${new Date().toISOString()}
-- Total chatbots: ${optionsArray.length}
-- This SQL UPDATES existing columns with correctly parsed values

-- =============================================
-- UPDATE INTEGRATION OPTIONS DATA
-- =============================================

`;

  // Helper to safely format SQL values with proper cleaning
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
    
    // Clean string values but preserve meaningful content
    let cleanValue = String(value)
      .replace(/\\n/g, '\n') // Convert escaped newlines to actual newlines
      .replace(/\\"/g, '"') // Convert escaped quotes
      .replace(/\\'/g, "'") // Convert escaped quotes
      .replace(/'/g, "''") // Escape single quotes for SQL
      .trim();
    
    // If after cleaning it's empty, return NULL
    if (!cleanValue) {
      return 'NULL';
    }
    
    // Use dollar quoting for safety with complex strings
    return `$CORRECT$${cleanValue}$CORRECT$`;
  };

  // Process each chatbot with CORRECTED values
  optionsArray.forEach(options => {
    const chatbotId = options.chatbotId;
    
    // Build UPDATE statement for each chatbot
    const updates = [];
    
    // Helper to add update if value exists
    const addUpdate = (columnName, value, isNumeric = false) => {
      const formattedValue = formatValue(value, isNumeric);
      if (formattedValue !== 'NULL') {
        updates.push(`  ${columnName} = ${formattedValue}`);
      }
    };

    // Add all the updates
    addUpdate('flow2_key', options.flow2Key);
    addUpdate('flow3_key', options.flow3Key);
    addUpdate('flow4_key', options.flow4Key);
    addUpdate('apiflow_key', options.apiFlowKey);
    addUpdate('metadata_key', options.metaDataKey);
    addUpdate('metadata2_key', options.metaData2Key);
    addUpdate('header_logo_url', options.headerLogoG);
    addUpdate('message_icon_url', options.messageIcon);
    addUpdate('theme_color', options.themeColor);
    addUpdate('ai_message_color', options.aiMessageColor);
    addUpdate('ai_message_text_color', options.aiMessageTextColor);
    addUpdate('font_family', options.fontFamily);
    addUpdate('header_title', options.headerTitleG);
    addUpdate('header_subtitle', options.headerSubtitleG);
    addUpdate('title', options.titleG);
    addUpdate('first_message', options.firstMessage);
    addUpdate('product_button_text', options.productButtonText);
    addUpdate('product_button_color', options.productButtonColor);
    addUpdate('product_button_padding', options.productButtonPadding);
    addUpdate('product_image_height_multiplier', options.productImageHeightMultiplier, true);
    addUpdate('product_box_height_multiplier', options.productBoxHeightMultiplier, true);
    addUpdate('enable_livechat', options.enableLivechat);
    addUpdate('use_thumbs_rating', options.useThumbsRating);
    addUpdate('replace_exclamation_with_period', options.replaceExclamationWithPeriod);
    addUpdate('purchase_tracking_enabled', options.purchaseTrackingEnabled);
    addUpdate('show_powered_by', options.showPoweredBy);
    addUpdate('to_human_mail', options.toHumanMail);
    addUpdate('rating_timer_duration', options.ratingTimerDuration, true);
    addUpdate('website_override', options.websiteOverride);
    addUpdate('language_override', options.languageOverride);
    addUpdate('valuta_override', options.valutaOverride);
    addUpdate('dilling_products_kat_override', options.dillingProductsKatOverride);
    addUpdate('dilling_colors', options.dillingColors);
    addUpdate('custom_var1', options.customVar1);
    addUpdate('order_tracking_enabled', options.orderTrackingEnabled);
    addUpdate('order_tracking_url', options.orderTrackingUrl);
    addUpdate('tracking_use_proxy', options.trackingUseProxy);
    addUpdate('tracking_proxy_url', options.trackingProxyUrl);
    addUpdate('tracking_request_method', options.trackingRequestMethod);
    addUpdate('tracking_needs_auth', options.trackingNeedsAuth);
    addUpdate('input_placeholder', options.inputPlaceholder);
    addUpdate('rating_message', options.ratingMessage);
    addUpdate('subtitle_link_text', options.subtitleLinkText);
    addUpdate('subtitle_link_url', options.subtitleLinkUrl);
    addUpdate('freshdesk_group_id', options.freshdeskGroupId, true);
    addUpdate('freshdesk_product_id', options.freshdeskProductId, true);
    addUpdate('freshdesk_email_label', options.freshdeskEmailLabel);
    addUpdate('freshdesk_message_label', options.freshdeskMessageLabel);
    addUpdate('freshdesk_image_label', options.freshdeskImageLabel);
    addUpdate('freshdesk_choose_file_text', options.freshdeskChooseFileText);
    addUpdate('freshdesk_no_file_text', options.freshdeskNoFileText);
    addUpdate('freshdesk_sending_text', options.freshdeskSendingText);
    addUpdate('freshdesk_submit_text', options.freshdeskSubmitText);
    addUpdate('freshdesk_subject_text', options.freshdeskSubjectText);
    addUpdate('freshdesk_name_label', options.freshdeskNameLabel);
    addUpdate('freshdesk_email_required_error', options.freshdeskEmailRequiredError);
    addUpdate('freshdesk_email_invalid_error', options.freshdeskEmailInvalidError);
    addUpdate('freshdesk_form_error_text', options.freshdeskFormErrorText);
    addUpdate('freshdesk_message_required_error', options.freshdeskMessageRequiredError);
    addUpdate('freshdesk_name_required_error', options.freshdeskNameRequiredError);
    addUpdate('freshdesk_submit_error_text', options.freshdeskSubmitErrorText);
    addUpdate('contact_confirmation_text', options.contactConfirmationText);
    addUpdate('freshdesk_confirmation_text', options.freshdeskConfirmationText);
    addUpdate('human_agent_question_text', options.humanAgentQuestionText);
    addUpdate('human_agent_yes_button_text', options.humanAgentYesButtonText);
    addUpdate('human_agent_no_button_text', options.humanAgentNoButtonText);
    addUpdate('lead_mail', options.leadMail);
    addUpdate('lead_field1', options.leadField1);
    addUpdate('lead_field2', options.leadField2);
    addUpdate('privacy_link', options.privacyLink);
    addUpdate('image_api_url', options.imageAPI);
    addUpdate('preloaded_message', options.preloadedMessage);
    addUpdate('statistics_api_url', options.statestikAPI);
    addUpdate('default_header_title', options.defaultHeaderTitle);
    addUpdate('default_header_subtitle', options.defaultHeaderSubtitle);
    
    // Add Pinecone configuration updates
    addUpdate('pinecone_api_key', options.pineconeApiKey);
    addUpdate('knowledgebase_index_endpoint', options.knowledgebaseIndexApiEndpoint);
    addUpdate('flow2_knowledgebase_index', options.flow2KnowledgebaseIndex);
    addUpdate('flow3_knowledgebase_index', options.flow3KnowledgebaseIndex);
    addUpdate('flow4_knowledgebase_index', options.flow4KnowledgebaseIndex);
    addUpdate('apiflow_knowledgebase_index', options.apiFlowKnowledgebaseIndex);
    
    if (updates.length > 0) {
      sqlContent += `-- Update integration options for chatbot: ${chatbotId}
UPDATE chatbot_settings SET
${updates.join(',\n')},
  updated_at = NOW()
WHERE chatbot_id = '${chatbotId}';

`;
    } else {
      sqlContent += `-- No valid integration options found for chatbot: ${chatbotId}

`;
    }
  });

  sqlContent += `
-- =============================================
-- UPDATE COMPLETE
-- =============================================
-- Total chatbots processed: ${optionsArray.length}
-- Correctly parsed JavaScript object structure
-- Generated on: ${new Date().toISOString()}
`;

  // Write to file
  const outputPath = path.join(__dirname, '..', 'ALL_INTEGRATION_OPTIONS_CORRECTED.sql');
  
  try {
    fs.writeFileSync(outputPath, sqlContent, 'utf8');
    console.log(`✅ CORRECTED SQL file generated successfully: ${outputPath}`);
    console.log(`📊 Summary:`);
    console.log(`   - Chatbots: ${optionsArray.length}`);
    console.log(`   - File size: ${(sqlContent.length / 1024).toFixed(1)} KB`);
    console.log(`   - JavaScript object structure: CORRECTLY PARSED`);
    
    return outputPath;
  } catch (error) {
    console.error('❌ Error writing corrected SQL file:', error);
    throw error;
  }
}

// Run the extraction
generateCorrectedIntegrationSQL();
