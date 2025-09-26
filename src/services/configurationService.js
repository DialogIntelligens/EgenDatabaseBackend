/**
 * Configuration Service
 * Handles dynamic loading and merging of chatbot configurations
 * Phase 4 Optimized with caching and enhanced performance
 */
export class ConfigurationService {
  constructor(pool) {
    this.pool = pool;
    this.configCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache TTL
  }

  /**
   * Get complete configuration for frontend
   * This replaces all the frontend configuration loading logic
   */
  async getFrontendConfiguration(chatbotId) {
    try {
      // Check cache first
      const cacheKey = `config:${chatbotId}`;
      const cached = this.configCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        console.log('🔧 Using cached configuration for chatbot:', chatbotId);
        return cached.data;
      }

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
        
        // Add flow keys from database configuration
        ...this.extractFlowKeys(basicSettings),
        
        // Add prompt enabled flags
        ...this.extractPromptFlags(templateAssignments)
      };

      console.log('🔧 Configuration loaded with keys:', Object.keys(configuration));
      
      // Cache the configuration
      this.configCache.set(cacheKey, {
        data: configuration,
        timestamp: Date.now()
      });

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
          image_enabled, 
          camera_button_enabled,
          pinecone_api_key,
          knowledgebase_index_endpoint,
          flow2_knowledgebase_index,
          flow3_knowledgebase_index,
          flow4_knowledgebase_index,
          apiflow_knowledgebase_index,
          first_message,
          flow2_key,
          flow3_key,
          flow4_key,
          apiflow_key,
          metadata_key,
          metadata2_key
        FROM chatbot_settings 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      const settings = result.rows[0] || {};
      
      return {
        image_enabled: settings.image_enabled || false,
        camera_button_enabled: settings.camera_button_enabled || false,
        // Pinecone configuration from integration scripts
        pineconeApiKey: settings.pinecone_api_key || null,
        knowledgebaseIndexApiEndpoint: settings.knowledgebase_index_endpoint || null,
        flow2KnowledgebaseIndex: settings.flow2_knowledgebase_index || null,
        flow3KnowledgebaseIndex: settings.flow3_knowledgebase_index || null,
        flow4KnowledgebaseIndex: settings.flow4_knowledgebase_index || null,
        apiFlowKnowledgebaseIndex: settings.apiflow_knowledgebase_index || null,
        // Start message configuration from integration scripts
        firstMessage: settings.first_message || null,
        // Flow keys from integration scripts (Phase 4: Now from database)
        flow2_key: settings.flow2_key || null,
        flow3_key: settings.flow3_key || null,
        flow4_key: settings.flow4_key || null,
        apiflow_key: settings.apiflow_key || null,
        metadata_key: settings.metadata_key || null,
        metadata2_key: settings.metadata2_key || null
      };
    } catch (error) {
      console.error('Error getting basic settings:', error);
      return {
        image_enabled: false,
        camera_button_enabled: false,
        pineconeApiKey: null,
        knowledgebaseIndexApiEndpoint: null,
        flow2KnowledgebaseIndex: null,
        flow3KnowledgebaseIndex: null,
        flow4KnowledgebaseIndex: null,
        apiFlowKnowledgebaseIndex: null,
        firstMessage: null,
        flow2_key: null,
        flow3_key: null,
        flow4_key: null,
        apiflow_key: null,
        metadata_key: null,
        metadata2_key: null
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
   * Extract flow keys from database configuration
   * Phase 4: Now enabled with database flow keys
   */
  extractFlowKeys(basicSettings) {
    const flowKeys = {};
    
    // Use flow keys directly from database (chatbot_settings table)
    if (basicSettings.flow2_key) flowKeys.flow2Key = basicSettings.flow2_key;
    if (basicSettings.flow3_key) flowKeys.flow3Key = basicSettings.flow3_key;
    if (basicSettings.flow4_key) flowKeys.flow4Key = basicSettings.flow4_key;
    if (basicSettings.apiflow_key) flowKeys.apiFlowKey = basicSettings.apiflow_key;
    if (basicSettings.metadata_key) flowKeys.metaDataKey = basicSettings.metadata_key;
    if (basicSettings.metadata2_key) flowKeys.metaData2Key = basicSettings.metadata2_key;

    console.log('🔧 Backend: Extracted flow keys from database:', flowKeys);
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
