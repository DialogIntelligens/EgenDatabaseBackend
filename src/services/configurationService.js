/**
 * Configuration Service
 * Handles dynamic loading and merging of chatbot configurations
 * Migrated from frontend configuration management
 */
export class ConfigurationService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get complete configuration for frontend
   * This replaces all the frontend configuration loading logic
   */
  async getFrontendConfiguration(chatbotId) {
    try {
      console.log('🔧 Loading complete frontend configuration for chatbot:', chatbotId);

      // Get all configuration components in parallel
      const [
        basicSettings,
        languageSettings,
        topKSettings,
        flowApiKeys,
        shopifySettings,
        magentoSettings,
        templateAssignments,
        promptOverrides
      ] = await Promise.all([
        this.getBasicSettings(chatbotId),
        this.getLanguageSettings(chatbotId),
        this.getTopKSettings(chatbotId),
        this.getFlowApiKeys(chatbotId),
        this.getShopifySettings(chatbotId),
        this.getMagentoSettings(chatbotId),
        this.getTemplateAssignments(chatbotId),
        this.getPromptOverrides(chatbotId)
      ]);

      // Merge all configuration
      const configuration = {
        chatbot_id: chatbotId,
        ...basicSettings, // This now includes Pinecone settings
        ...languageSettings,
        topKSettings,
        flowApiKeys,
        ...shopifySettings,
        ...magentoSettings,
        templateAssignments,
        promptOverrides,
        
        // Add flow keys from template assignments
        ...this.extractFlowKeys(templateAssignments),
        
        // Add prompt enabled flags
        ...this.extractPromptFlags(templateAssignments)
      };

      console.log('🔧 Configuration loaded with keys:', Object.keys(configuration));
      return configuration;

    } catch (error) {
      console.error('Error loading frontend configuration:', error);
      throw error;
    }
  }

  /**
   * Get basic chatbot settings including Pinecone configuration
   */
  async getBasicSettings(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT 
          -- Basic settings
          image_enabled, camera_button_enabled,
          -- Pinecone configuration
          pinecone_api_key, knowledgebase_index_endpoint,
          flow2_knowledgebase_index, flow3_knowledgebase_index, 
          flow4_knowledgebase_index, apiflow_knowledgebase_index,
          -- Start message and titles
          first_message, title, header_title,
          -- Flow keys
          flow2_key, flow3_key, flow4_key, apiflow_key, metadata_key, metadata2_key,
          -- UI and styling
          header_logo_url, message_icon_url, theme_color, ai_message_color, ai_message_text_color,
          font_family, product_button_text, product_button_color, product_button_padding,
          product_image_height_multiplier, product_box_height_multiplier,
          -- Feature flags
          enable_livechat, use_thumbs_rating, replace_exclamation_with_period,
          purchase_tracking_enabled, show_powered_by,
          -- Timer and tracking
          rating_timer_duration,
          -- Override variables
          website_override, language_override, valuta_override,
          dilling_products_kat_override, dilling_colors, custom_var1,
          -- Order tracking
          order_tracking_enabled, order_tracking_url, tracking_use_proxy,
          tracking_proxy_url, tracking_request_method, tracking_needs_auth,
          -- Form and UI text
          input_placeholder, rating_message, subtitle_link_text, subtitle_link_url,
          -- Freshdesk configuration
          freshdesk_email_label, freshdesk_message_label, freshdesk_image_label,
          freshdesk_choose_file_text, freshdesk_no_file_text, freshdesk_sending_text,
          freshdesk_submit_text, freshdesk_subject_text, freshdesk_name_label,
          -- Freshdesk error messages
          freshdesk_email_required_error, freshdesk_email_invalid_error, freshdesk_form_error_text,
          freshdesk_message_required_error, freshdesk_name_required_error, freshdesk_submit_error_text,
          -- Confirmation messages
          contact_confirmation_text, freshdesk_confirmation_text,
          -- Human agent request
          human_agent_question_text, human_agent_yes_button_text, human_agent_no_button_text,
          -- Lead generation
          lead_mail, lead_field1, lead_field2,
          -- Other options
          privacy_link, image_api, preloaded_message, statestik_api,
          default_header_title, default_header_subtitle,
          -- Freshdesk IDs
          freshdesk_group_id, freshdesk_product_id
        FROM chatbot_settings 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      const settings = result.rows[0] || {};
      
      return {
        // Basic settings
        image_enabled: settings.image_enabled || false,
        camera_button_enabled: settings.camera_button_enabled || false,
        
        // Pinecone configuration
        pineconeApiKey: settings.pinecone_api_key || null,
        knowledgebaseIndexApiEndpoint: settings.knowledgebase_index_endpoint || null,
        flow2KnowledgebaseIndex: settings.flow2_knowledgebase_index || null,
        flow3KnowledgebaseIndex: settings.flow3_knowledgebase_index || null,
        flow4KnowledgebaseIndex: settings.flow4_knowledgebase_index || null,
        apiFlowKnowledgebaseIndex: settings.apiflow_knowledgebase_index || null,
        
        // Start message and titles
        firstMessage: settings.first_message || null,
        title: settings.title || null,
        headerTitle: settings.header_title || null,
        
        // Flow keys
        flow2Key: settings.flow2_key || null,
        flow3Key: settings.flow3_key || null,
        flow4Key: settings.flow4_key || null,
        apiFlowKey: settings.apiflow_key || null,
        metaDataKey: settings.metadata_key || null,
        metaData2Key: settings.metadata2_key || null,
        
        // UI and styling
        headerLogoG: settings.header_logo_url || null,
        messageIcon: settings.message_icon_url || null,
        themeColor: settings.theme_color || null,
        aiMessageColor: settings.ai_message_color || null,
        aiMessageTextColor: settings.ai_message_text_color || null,
        fontFamily: settings.font_family || null,
        productButtonText: settings.product_button_text || 'SE PRODUKT',
        productButtonColor: settings.product_button_color || null,
        productButtonPadding: settings.product_button_padding || null,
        productImageHeightMultiplier: settings.product_image_height_multiplier || 1,
        productBoxHeightMultiplier: settings.product_box_height_multiplier || 1,
        
        // Feature flags
        enableLivechat: settings.enable_livechat || false,
        useThumbsRating: settings.use_thumbs_rating || false,
        replaceExclamationWithPeriod: settings.replace_exclamation_with_period || false,
        purchaseTrackingEnabled: settings.purchase_tracking_enabled || false,
        showPoweredBy: settings.show_powered_by !== false, // Default to true
        
        // Timer and tracking
        ratingTimerDuration: settings.rating_timer_duration || 18000,
        
        // Override variables
        websiteOverride: settings.website_override || null,
        languageOverride: settings.language_override || null,
        valutaOverride: settings.valuta_override || null,
        dillingProductsKatOverride: settings.dilling_products_kat_override || null,
        dillingColors: settings.dilling_colors || null,
        customVar1: settings.custom_var1 || null,
        
        // Order tracking
        orderTrackingEnabled: settings.order_tracking_enabled || false,
        orderTrackingUrl: settings.order_tracking_url || null,
        trackingUseProxy: settings.tracking_use_proxy || false,
        trackingProxyUrl: settings.tracking_proxy_url || null,
        trackingRequestMethod: settings.tracking_request_method || 'GET',
        trackingNeedsAuth: settings.tracking_needs_auth !== false, // Default to true
        
        // Form and UI text
        inputPlaceholder: settings.input_placeholder || 'Skriv dit spørgsmål her...',
        ratingMessage: settings.rating_message || 'Fik du besvaret dit spørgsmål?',
        subtitleLinkText: settings.subtitle_link_text || null,
        subtitleLinkUrl: settings.subtitle_link_url || null,
        
        // Freshdesk configuration
        freshdeskEmailLabel: settings.freshdesk_email_label || 'Din email:',
        freshdeskMessageLabel: settings.freshdesk_message_label || 'Besked til kundeservice:',
        freshdeskImageLabel: settings.freshdesk_image_label || 'Upload billede (valgfrit):',
        freshdeskChooseFileText: settings.freshdesk_choose_file_text || 'Vælg fil',
        freshdeskNoFileText: settings.freshdesk_no_file_text || 'Ingen fil valgt',
        freshdeskSendingText: settings.freshdesk_sending_text || 'Sender...',
        freshdeskSubmitText: settings.freshdesk_submit_text || 'Send henvendelse',
        freshdeskSubjectText: settings.freshdesk_subject_text || 'Din henvendelse',
        freshdeskNameLabel: settings.freshdesk_name_label || 'Dit navn:',
        
        // Freshdesk error messages
        freshdeskEmailRequiredError: settings.freshdesk_email_required_error || 'Email er påkrævet',
        freshdeskEmailInvalidError: settings.freshdesk_email_invalid_error || 'Indtast venligst en gyldig email adresse',
        freshdeskFormErrorText: settings.freshdesk_form_error_text || 'Ret venligst fejlene i formularen',
        freshdeskMessageRequiredError: settings.freshdesk_message_required_error || 'Besked er påkrævet',
        freshdeskNameRequiredError: settings.freshdesk_name_required_error || 'Navn er påkrævet',
        freshdeskSubmitErrorText: settings.freshdesk_submit_error_text || 'Der opstod en fejl ved afsendelse af henvendelsen. Prøv venligst igen.',
        
        // Confirmation messages
        contactConfirmationText: settings.contact_confirmation_text || 'Tak for din henvendelse, vi vender tilbage hurtigst muligt.',
        freshdeskConfirmationText: settings.freshdesk_confirmation_text || 'Tak for din henvendelse, vi vender tilbage hurtigst muligt.',
        
        // Human agent request
        humanAgentQuestionText: settings.human_agent_question_text || 'Vil du gerne tale med en medarbejder?',
        humanAgentYesButtonText: settings.human_agent_yes_button_text || 'Ja tak',
        humanAgentNoButtonText: settings.human_agent_no_button_text || 'Nej tak',
        
        // Lead generation
        leadMail: settings.lead_mail || null,
        leadField1: settings.lead_field1 || null,
        leadField2: settings.lead_field2 || null,
        
        // Other options
        privacyLink: settings.privacy_link || null,
        imageAPI: settings.image_api || null,
        preloadedMessage: settings.preloaded_message || null,
        statestikAPI: settings.statestik_api || null,
        defaultHeaderTitle: settings.default_header_title || null,
        defaultHeaderSubtitle: settings.default_header_subtitle || 'Vores virtuelle assistent er her for at hjælpe dig.',
        
        // Freshdesk IDs
        freshdeskGroupId: settings.freshdesk_group_id || null,
        freshdeskProductId: settings.freshdesk_product_id || null
      };
    } catch (error) {
      console.error('Error getting basic settings:', error);
      return {
        // Return minimal defaults on error
        image_enabled: false,
        camera_button_enabled: false,
        pineconeApiKey: null,
        knowledgebaseIndexApiEndpoint: null,
        firstMessage: null,
        // All other fields default to null/false
        ...Object.fromEntries(
          ['flow2Key', 'flow3Key', 'flow4Key', 'apiFlowKey', 'metaDataKey', 'metaData2Key',
           'headerLogoG', 'messageIcon', 'themeColor', 'fontFamily', 'privacyLink'].map(key => [key, null])
        ),
        useThumbsRating: false,
        purchaseTrackingEnabled: false,
        showPoweredBy: true,
        ratingTimerDuration: 18000
      };
    }
  }

  /**
   * Get language settings
   */
  async getLanguageSettings(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT language 
        FROM chatbot_language_settings 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      return {
        language: result.rows[0]?.language || 'danish',
        uiLanguage: result.rows[0]?.language || 'danish'
      };
    } catch (error) {
      console.error('Error getting language settings:', error);
      return {
        language: 'danish',
        uiLanguage: 'danish'
      };
    }
  }

  /**
   * Get topK settings for all flows
   */
  async getTopKSettings(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT flow_key, top_k 
        FROM flow_topk_settings 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      const topKSettings = {};
      result.rows.forEach(row => {
        topKSettings[row.flow_key] = row.top_k;
      });

      return topKSettings;
    } catch (error) {
      console.error('Error getting topK settings:', error);
      return {};
    }
  }

  /**
   * Get flow-specific API keys
   */
  async getFlowApiKeys(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT flow_key, pinecone_api_key 
        FROM flow_pinecone_api_keys 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      const flowApiKeys = {};
      result.rows.forEach(row => {
        flowApiKeys[row.flow_key] = row.pinecone_api_key;
      });

      return flowApiKeys;
    } catch (error) {
      console.error('Error getting flow API keys:', error);
      return {};
    }
  }

  /**
   * Get Shopify settings
   */
  async getShopifySettings(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT shopify_enabled, shopify_store 
        FROM shopify_credentials 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      return {
        shopifyEnabled: result.rows[0]?.shopify_enabled || false,
        shopifyStore: result.rows[0]?.shopify_store || '',
        orderTrackingUseProxy: true,
        orderTrackingProxyUrl: 'https://egendatabasebackend.onrender.com/api/shopify/orders',
        orderTrackingRequestMethod: 'POST',
        trackingRequiredFields: ['email', 'phone', 'order_number']
      };
    } catch (error) {
      console.error('Error getting Shopify settings:', error);
      return {
        shopifyEnabled: false,
        shopifyStore: '',
        orderTrackingUseProxy: true,
        orderTrackingProxyUrl: 'https://egendatabasebackend.onrender.com/api/shopify/orders',
        orderTrackingRequestMethod: 'POST',
        trackingRequiredFields: ['email', 'phone', 'order_number']
      };
    }
  }

  /**
   * Get Magento settings
   */
  async getMagentoSettings(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT magento_enabled, magento_base_url 
        FROM magento_credentials 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      return {
        magentoEnabled: result.rows[0]?.magento_enabled || false,
        magentoBaseUrl: result.rows[0]?.magento_base_url || '',
        orderTrackingUseProxy: true,
        orderTrackingProxyUrl: 'https://egendatabasebackend.onrender.com/api/magento/orders',
        orderTrackingRequestMethod: 'POST'
      };
    } catch (error) {
      console.error('Error getting Magento settings:', error);
      return {
        magentoEnabled: false,
        magentoBaseUrl: '',
        orderTrackingUseProxy: true,
        orderTrackingProxyUrl: 'https://egendatabasebackend.onrender.com/api/magento/orders',
        orderTrackingRequestMethod: 'POST'
      };
    }
  }


  /**
   * Get template assignments
   */
  async getTemplateAssignments(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT flow_key, template_id 
        FROM flow_template_assignments 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      const assignments = {};
      result.rows.forEach(row => {
        assignments[row.flow_key] = row.template_id;
      });

      return assignments;
    } catch (error) {
      console.error('Error getting template assignments:', error);
      return {};
    }
  }

  /**
   * Get prompt overrides
   */
  async getPromptOverrides(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT flow_key, section_key, action, content 
        FROM prompt_overrides 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      const overrides = {};
      result.rows.forEach(row => {
        if (!overrides[row.flow_key]) {
          overrides[row.flow_key] = {};
        }
        overrides[row.flow_key][row.section_key] = {
          action: row.action,
          content: row.content
        };
      });

      return overrides;
    } catch (error) {
      console.error('Error getting prompt overrides:', error);
      return {};
    }
  }

  /**
   * Extract flow keys from template assignments
   */
  extractFlowKeys(templateAssignments) {
    const flowKeys = {};
    
    // Map template assignments to flow keys
    Object.keys(templateAssignments).forEach(flowKey => {
      switch (flowKey) {
        case 'apiflow':
          flowKeys.apiFlowKey = 'apiflow';
          break;
        case 'metadata':
          flowKeys.metaDataKey = 'metadata';
          break;
        case 'metadata2':
          flowKeys.metaData2Key = 'metadata2';
          break;
        case 'flow2':
          flowKeys.flow2Key = 'flow2';
          break;
        case 'flow3':
          flowKeys.flow3Key = 'flow3';
          break;
        case 'flow4':
          flowKeys.flow4Key = 'flow4';
          break;
      }
    });

    return flowKeys;
  }

  /**
   * Extract prompt enabled flags from template assignments
   */
  extractPromptFlags(templateAssignments) {
    const promptFlags = {};
    
    // Enable prompts for flows that have template assignments
    Object.keys(templateAssignments).forEach(flowKey => {
      switch (flowKey) {
        case 'main':
          promptFlags.mainPromptEnabled = true;
          break;
        case 'apiflow':
          promptFlags.apiFlowPromptEnabled = true;
          promptFlags.apiVarFlowPromptEnabled = true; // apivarflow depends on apiflow
          break;
        case 'metadata':
          promptFlags.metaDataPromptEnabled = true;
          break;
        case 'metadata2':
          promptFlags.metaData2PromptEnabled = true;
          break;
        case 'flow2':
          promptFlags.flow2PromptEnabled = true;
          break;
        case 'flow3':
          promptFlags.flow3PromptEnabled = true;
          break;
        case 'flow4':
          promptFlags.flow4PromptEnabled = true;
          break;
        case 'image':
          promptFlags.imagePromptEnabled = true;
          break;
        case 'statistics':
          promptFlags.statestikPromptEnabled = true;
          break;
      }
    });

    // Always enable core flows
    promptFlags.mainPromptEnabled = promptFlags.mainPromptEnabled !== false;
    promptFlags.statestikPromptEnabled = promptFlags.statestikPromptEnabled !== false;

    return promptFlags;
  }

  /**
   * Get runtime configuration (from frontend integration options)
   * This merges with database configuration
   */
  mergeRuntimeConfiguration(databaseConfig, runtimeConfig) {
    return {
      ...databaseConfig,
      ...runtimeConfig,
      
      // Ensure database config takes precedence for critical settings
      chatbot_id: databaseConfig.chatbot_id,
      topKSettings: databaseConfig.topKSettings,
      flowApiKeys: databaseConfig.flowApiKeys,
      
      // Allow runtime overrides for dynamic settings
      websiteOverride: runtimeConfig.websiteOverride || databaseConfig.websiteOverride,
      languageOverride: runtimeConfig.languageOverride || databaseConfig.languageOverride,
      valutaOverride: runtimeConfig.valutaOverride || databaseConfig.valutaOverride,
      dillingproductkatoverride: runtimeConfig.dillingproductkatoverride || databaseConfig.dillingproductkatoverride,
      dillingcolors: runtimeConfig.dillingcolors || databaseConfig.dillingcolors,
      customVar1: runtimeConfig.customVar1 || databaseConfig.customVar1
    };
  }

  /**
   * Validate configuration completeness
   */
  validateConfiguration(configuration) {
    const errors = [];
    const warnings = [];

    // Check for required flows - only main is truly required
    const requiredFlows = ['main'];
    
    requiredFlows.forEach(flow => {
      const hasTemplate = configuration.templateAssignments[flow];
      if (!hasTemplate) {
        errors.push(`Missing template assignment for required flow: ${flow}`);
      }
    });

    // Check for optional flows
    const optionalFlows = ['statistics', 'fordelingsflow'];
    optionalFlows.forEach(flow => {
      const hasTemplate = configuration.templateAssignments[flow];
      if (!hasTemplate) {
        warnings.push(`Optional template assignment missing for flow: ${flow}`);
      }
    });

    // Check for image configuration consistency
    if (configuration.image_enabled && !configuration.imagePromptEnabled && !configuration.imageAPI) {
      warnings.push('Image uploads enabled but no image processing configured');
    }

    // Check for order tracking configuration
    if (configuration.apiFlowKey && !configuration.apiFlowPromptEnabled) {
      warnings.push('API flow configured but no prompt template assigned');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * Factory function to create service instance
 */
export function createConfigurationService(pool) {
  return new ConfigurationService(pool);
}
