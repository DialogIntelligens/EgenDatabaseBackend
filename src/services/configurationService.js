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
        promptOverrides,
        pineconeSettings
      ] = await Promise.all([
        this.getBasicSettings(chatbotId),
        this.getLanguageSettings(chatbotId),
        this.getTopKSettings(chatbotId),
        this.getFlowApiKeys(chatbotId),
        this.getShopifySettings(chatbotId),
        this.getMagentoSettings(chatbotId),
        this.getTemplateAssignments(chatbotId),
        this.getPromptOverrides(chatbotId),
        this.getPineconeSettings(chatbotId)
      ]);

      // Merge all configuration
      const configuration = {
        chatbot_id: chatbotId,
        ...basicSettings,
        ...languageSettings,
        ...pineconeSettings,
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
   * Get basic chatbot settings
   */
  async getBasicSettings(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT image_enabled, camera_button_enabled
        FROM chatbot_settings 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      return result.rows[0] || {
        image_enabled: false,
        camera_button_enabled: false
      };
    } catch (error) {
      console.error('Error getting basic settings:', error);
      return {
        image_enabled: false,
        camera_button_enabled: false
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
   * Get Pinecone settings (API key and indexes)
   */
  async getPineconeSettings(chatbotId) {
    try {
      // Get the user who owns this chatbot to get their Pinecone API key
      const userResult = await this.pool.query(`
        SELECT pinecone_api_key, pinecone_indexes 
        FROM users 
        WHERE $1 = ANY(chatbot_ids)
      `, [chatbotId]);

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        let pineconeIndexes = user.pinecone_indexes;
        
        // Parse indexes if it's a string
        if (typeof pineconeIndexes === 'string') {
          try {
            pineconeIndexes = JSON.parse(pineconeIndexes);
          } catch (e) {
            console.error('Error parsing pinecone_indexes:', e);
            pineconeIndexes = [];
          }
        }

        return {
          pineconeApiKey: user.pinecone_api_key,
          pineconeIndexes: pineconeIndexes || []
        };
      }

      console.warn(`No user found for chatbot ${chatbotId}, Pinecone settings unavailable`);
      return {
        pineconeApiKey: null,
        pineconeIndexes: []
      };
    } catch (error) {
      console.error('Error getting Pinecone settings:', error);
      return {
        pineconeApiKey: null,
        pineconeIndexes: []
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
