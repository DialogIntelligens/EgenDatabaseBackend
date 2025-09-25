import { createFlowRoutingService } from './flowRoutingService.js';
import { createAiStreamingService } from './aiStreamingService.js';
import { createOrderTrackingService } from './orderTrackingService.js';
import { createConfigurationService } from './configurationService.js';
import { createImageProcessingService } from './imageProcessingService.js';
import { createConversationAnalyticsService } from './conversationAnalyticsService.js';
import { createPerformanceTrackingService } from './performanceTrackingService.js';
import { getEmneAndScore } from '../utils/mainUtils.js';
import { buildPrompt } from '../../promptTemplateV2Routes.js';

/**
 * Main conversation processing service
 * Orchestrates the entire conversation flow from user input to AI response
 */
export class ConversationProcessingService {
  constructor(pool) {
    this.pool = pool;
    this.flowRouting = createFlowRoutingService(pool);
    this.aiStreaming = createAiStreamingService(pool);
    this.orderTracking = createOrderTrackingService(pool);
    this.configuration = createConfigurationService(pool);
    this.imageProcessing = createImageProcessingService(pool);
    this.analytics = createConversationAnalyticsService(pool);
    this.performance = createPerformanceTrackingService(pool);
  }

  /**
   * Process a user message and return streaming response
   * This is the main entry point that replaces frontend sendMessage logic
   */
  async processMessage(messageData) {
    const {
      user_id,
      chatbot_id,
      message_text,
      image_data,
      conversation_history,
      session_id,
      configuration
    } = messageData;

    console.log('🔄 Backend: Starting conversation processing for:', {
      user_id,
      chatbot_id,
      message_length: message_text?.length,
      has_image: !!image_data,
      session_id
    });

    try {
      // Start performance tracking (migrated from frontend)
      const perfTracker = this.performance.startTracking(session_id || user_id, 'conversation');
      perfTracker.startPhase('total_processing');

      // Step 1: Create session for tracking
      perfTracker.startPhase('session_creation');
      const session = await this.createSession(user_id, chatbot_id, session_id, message_text);
      perfTracker.endPhase('session_creation');

      // Step 2: Process image if provided
      let imageDescription = '';
      if (image_data && (configuration.imageEnabled || configuration.imageAPI)) {
        perfTracker.startPhase('image_processing');
        imageDescription = await this.imageProcessing.processImage(image_data, message_text, configuration);
        perfTracker.endPhase('image_processing', { has_image: true, description_length: imageDescription.length });
      }

      // Step 3: Determine conversation flow type
      perfTracker.startPhase('flow_determination');
      const flowResult = await this.flowRouting.determineFlow(
        message_text,
        conversation_history,
        configuration,
        imageDescription
      );
      perfTracker.endPhase('flow_determination', { 
        flow_type: flowResult.questionType, 
        execution_method: flowResult.method,
        execution_time: flowResult.executionTime 
      });

      // Step 4: Execute the determined flow
      perfTracker.startPhase('flow_execution');
      const processingResult = await this.executeFlow(
        flowResult,
        message_text,
        conversation_history,
        imageDescription,
        configuration,
        session.id
      );
      perfTracker.endPhase('flow_execution', { 
        has_order_details: !!processingResult.orderDetails,
        api_url: processingResult.apiUrl
      });

      // Step 5: Start streaming response
      perfTracker.startPhase('streaming_start');
      const streamingSession = await this.aiStreaming.startStreaming(
        processingResult.apiUrl,
        processingResult.requestBody,
        session.session_id, // Pass the session_id string, not the database ID
        configuration
      );
      perfTracker.endPhase('streaming_start');
      perfTracker.endPhase('total_processing');

      // Save performance metrics to database
      perfTracker.saveToDB();

      return {
        success: true,
        session_id: session.session_id, // Return the session_id string
        streaming_session_id: streamingSession.id,
        flow_type: flowResult.questionType,
        order_details: processingResult.orderDetails || null,
        performance_summary: perfTracker.getSummary()
      };

    } catch (error) {
      console.error('🚨 Backend: Error processing message:', error);
      await this.logError(error, { user_id, chatbot_id, message_text });
      throw error;
    }
  }

  /**
   * Create or update conversation session
   */
  async createSession(userId, chatbotId, sessionId = null, messageText = '') {
    try {
      const result = await this.pool.query(`
        INSERT INTO conversation_sessions (
          user_id, 
          chatbot_id, 
          session_id, 
          configuration,
          created_at, 
          last_activity
        ) VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (user_id, chatbot_id) 
        DO UPDATE SET 
          session_id = EXCLUDED.session_id,
          configuration = EXCLUDED.configuration,
          last_activity = NOW()
        RETURNING id, session_id
      `, [
        userId, 
        chatbotId, 
        sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        JSON.stringify({ user_message: messageText, timestamp: new Date().toISOString() })
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error creating conversation session:', error);
      throw new Error('Failed to create conversation session');
    }
  }


  /**
   * Execute the determined conversation flow
   */
  async executeFlow(flowResult, messageText, conversationHistory, imageDescription, configuration, sessionId) {
    const { questionType, selectedMetaData } = flowResult;
    
    // Build final question with image description if present
    let finalQuestion = messageText;
    if (imageDescription) {
      finalQuestion += " image description(act as if this is an image that you are viewing): " +
        imageDescription +
        " Omkring denne billedbeskrivelse: sig ikke at det lyder som om, men at det ligner. Opfør dig som om at teksten er et billede du ser. ";
    }

    // Handle order tracking if this is an API flow
    let orderDetails = null;
    if (questionType === configuration.apiFlowKey) {
      orderDetails = await this.handleOrderTracking(messageText, conversationHistory, configuration);
      
      if (orderDetails) {
        const orderSummary = this.buildOrderSummary(orderDetails);
        finalQuestion += ` Orderdetails (the user has not seen these details): ${orderSummary} COMPLETE_DATA: ${JSON.stringify(orderDetails)}`;
      }
    }

    // Build request body for AI API
    const requestBody = {
      question: finalQuestion,
      history: conversationHistory,
    };

    // Apply metadata filters if available
    if (Object.keys(selectedMetaData).length > 0) {
      requestBody.overrideConfig = {
        pineconeMetadataFilter: selectedMetaData,
      };
    }

    // Apply flow-specific configurations
    await this.applyFlowConfiguration(requestBody, questionType, configuration);

    // Determine API URL based on flow type
    const apiUrl = this.getApiUrlForFlow(questionType, configuration);

    return {
      apiUrl,
      requestBody,
      orderDetails,
      questionType
    };
  }

  /**
   * Handle order tracking for API flows
   * Migrated from frontend API flow logic
   */
  async handleOrderTracking(messageText, conversationHistory, configuration) {
    try {
      console.log("🚨 FLOW ROUTING: Entering order tracking logic");
      
      // First extract order variables using apiVarFlow
      const orderVariables = await this.orderTracking.extractOrderVariables(messageText, conversationHistory, configuration);
      
      if (Object.keys(orderVariables).length === 0) {
        console.log("🚨 FLOW ROUTING: No order variables extracted");
        return null;
      }
      
      console.log("🔍 ORDER VARIABLES: Extracted variables:", Object.keys(orderVariables));
      console.log("🔍 ORDER VARIABLES: Values:", JSON.stringify(orderVariables, null, 2));
      
      // Handle order tracking based on the extracted variables
      const orderDetails = await this.orderTracking.handleOrderTracking(orderVariables, configuration);
      
      if (orderDetails) {
        console.log("🚨 FLOW ROUTING: ✅ orderDetails found, processing...");
        
        // Extract relevant order details for AI context
        const relevantOrderDetails = this.orderTracking.extractRelevantOrderDetails(orderDetails);
        
        if (relevantOrderDetails) {
          return {
            ...orderDetails,
            relevantOrderDetails
          };
        }
      }
      
      console.log("🚨 FLOW ROUTING: ❌ No orderDetails found");
      return null;
      
    } catch (error) {
      console.error("🚨 FLOW ROUTING: Error in order tracking:", error);
      return null;
    }
  }

  /**
   * Build order summary for AI context
   */
  buildOrderSummary(orderDetails) {
    if (!orderDetails || !orderDetails.relevantOrderDetails) {
      return '';
    }

    const details = orderDetails.relevantOrderDetails;
    let summary = '';

    if (details.orderNumber) summary += `Order ${details.orderNumber}`;
    if (details.orderDate) summary += ` placed on ${details.orderDate}`;
    if (details.customer?.firstName || details.customer?.lastName) {
      const name = [details.customer.firstName, details.customer.lastName].filter(Boolean).join(' ');
      summary += ` for ${name}`;
    }
    if (details.status) summary += ` (Status: ${details.status})`;
    if (details.shipping?.trackingInfo) summary += ` TRACKING: ${details.shipping.trackingInfo}`;

    return summary;
  }

  /**
   * Apply flow-specific configuration to request body
   */
  async applyFlowConfiguration(requestBody, questionType, configuration) {
    const { chatbot_id } = configuration;

    // Apply website and language overrides
    this.applyOverrides(requestBody, configuration);

    // Get and apply prompt template for the flow
    try {
      const flowKey = this.getFlowKeyFromQuestionType(questionType, configuration);
      if (flowKey) {
        const prompt = await buildPrompt(this.pool, chatbot_id, flowKey);
        if (prompt) {
          requestBody.overrideConfig = requestBody.overrideConfig || {};
          requestBody.overrideConfig.vars = requestBody.overrideConfig.vars || {};
          requestBody.overrideConfig.vars.masterPrompt = prompt;
        }
      }
    } catch (error) {
      console.error('Error applying prompt template:', error);
      // Continue without prompt override
    }

    // Apply topK settings
    const topK = await this.getTopKForFlow(questionType, configuration);
    if (topK !== undefined) {
      requestBody.overrideConfig = requestBody.overrideConfig || {};
      requestBody.overrideConfig.topK = topK;
    }

    // Apply Pinecone index and API key overrides
    const pineconeIndex = await this.getPineconeIndexForFlow(questionType, configuration);
    const pineconeApiKey = await this.getPineconeApiKeyForFlow(questionType, configuration);
    
    if (pineconeIndex) {
      requestBody.overrideConfig = requestBody.overrideConfig || {};
      requestBody.overrideConfig.pineconeIndex = pineconeIndex;
    }
    
    if (pineconeApiKey) {
      requestBody.overrideConfig = requestBody.overrideConfig || {};
      requestBody.overrideConfig.pineconeApiKey = pineconeApiKey;
      const flowKey = this.getFlowKeyFromQuestionType(questionType, configuration);
      console.log(`Applied Pinecone API key for ${flowKey} flow: ${pineconeApiKey.substring(0, 20)}...`);
    }
  }

  /**
   * Apply website and language overrides
   */
  applyOverrides(requestBody, configuration) {
    const { websiteOverride, languageOverride, valutaOverride, dillingproductkatoverride, dillingcolors, customVar1 } = configuration;

    if (websiteOverride || languageOverride || valutaOverride || dillingproductkatoverride || dillingcolors || customVar1) {
      requestBody.overrideConfig = requestBody.overrideConfig || {};
      requestBody.overrideConfig.vars = requestBody.overrideConfig.vars || {};
      
      if (websiteOverride) requestBody.overrideConfig.vars.website = websiteOverride;
      if (languageOverride) requestBody.overrideConfig.vars.language = languageOverride;
      if (valutaOverride) requestBody.overrideConfig.vars.valuta = valutaOverride;
      if (dillingproductkatoverride) requestBody.overrideConfig.vars.dillingproductkat = dillingproductkatoverride;
      if (dillingcolors) requestBody.overrideConfig.vars.dillingcolors = dillingcolors;
      if (customVar1) requestBody.overrideConfig.vars.customVar1 = customVar1;
    }
  }

  /**
   * Get flow key from question type
   */
  getFlowKeyFromQuestionType(questionType, configuration) {
    const { apiFlowKey, metaDataKey, metaData2Key, flow2Key, flow3Key, flow4Key } = configuration;

    if (questionType === apiFlowKey) return 'apiflow';
    if (questionType === metaDataKey) return 'metadata';
    if (questionType === metaData2Key) return 'metadata2';
    if (questionType === flow2Key) return 'flow2';
    if (questionType === flow3Key) return 'flow3';
    if (questionType === flow4Key) return 'flow4';
    
    return 'main'; // Default flow
  }

  /**
   * Get topK setting for flow
   */
  async getTopKForFlow(questionType, configuration) {
    try {
      const flowKey = this.getFlowKeyFromQuestionType(questionType, configuration);
      const result = await this.pool.query(
        'SELECT top_k FROM flow_topk_settings WHERE chatbot_id = $1 AND flow_key = $2',
        [configuration.chatbot_id, flowKey]
      );
      return result.rows[0]?.top_k;
    } catch (error) {
      console.error('Error getting topK setting:', error);
      return undefined;
    }
  }

  /**
   * Get Pinecone index for flow
   */
  async getPineconeIndexForFlow(questionType, configuration) {
    try {
      const flowKey = this.getFlowKeyFromQuestionType(questionType, configuration);
      
      // Check for flow-specific index configurations
      const flowIndexMap = {
        'flow2': configuration.flow2KnowledgebaseIndex,
        'flow3': configuration.flow3KnowledgebaseIndex,
        'flow4': configuration.flow4KnowledgebaseIndex,
        'apiflow': configuration.apiFlowKnowledgebaseIndex
      };
      
      // Return flow-specific index or default
      return flowIndexMap[flowKey] || configuration.knowledgebaseIndexApiEndpoint || null;
    } catch (error) {
      console.error('Error getting Pinecone index for flow:', error);
      return configuration.knowledgebaseIndexApiEndpoint || null;
    }
  }

  /**
   * Get Pinecone API key for flow
   */
  async getPineconeApiKeyForFlow(questionType, configuration) {
    try {
      const flowKey = this.getFlowKeyFromQuestionType(questionType, configuration);
      
      // Get flow-specific API key from configuration
      const flowApiKey = configuration.flowApiKeys?.[flowKey];
      if (flowApiKey) {
        console.log(`Using flow-specific API key for ${flowKey} flow`);
        return flowApiKey;
      }
      
      // Fallback to default API key
      if (configuration.pineconeApiKey) {
        console.log(`Using default API key for ${flowKey} flow`);
        return configuration.pineconeApiKey;
      }
      
      console.warn(`No Pinecone API key found for ${flowKey} flow`);
      return null;
    } catch (error) {
      console.error('Error getting Pinecone API key for flow:', error);
      return null;
    }
  }

  /**
   * Get API URL for flow type
   */
  getApiUrlForFlow(questionType, configuration) {
    // All flows currently use the same standardized endpoint
    return "https://den-utrolige-snebold.onrender.com/api/v1/prediction/c88bd6dd-a846-4862-b234-59c8b459b816";
  }

  /**
   * Log errors to the database
   */
  async logError(error, context = {}) {
    try {
      await this.pool.query(`
        INSERT INTO error_logs (chatbot_id, user_id, error_category, error_message, error_details, stack_trace)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        context.chatbot_id || null,
        context.user_id || null,
        'CONVERSATION_PROCESSING_ERROR',
        error.message || 'Unknown error',
        JSON.stringify({
          context,
          timestamp: new Date().toISOString(),
          error_type: error.constructor.name
        }),
        error.stack || null
      ]);
    } catch (logError) {
      console.error('Failed to log error to database:', logError);
    }
  }

  /**
   * Save conversation to database with statistics analysis
   */
  async saveConversation(conversationData, configuration, orderDetails = null) {
    try {
      // Build conversation text for analysis
      const conversationText = conversationData
        .map(msg => `${msg.isUser ? 'User' : 'AI'}: ${msg.text}`)
        .join('\n');

      // Get statistics analysis
      const { emne, score, lacking_info, fallback, ligegyldig, tags } = await getEmneAndScore(
        conversationText,
        conversationData.user_id,
        conversationData.chatbot_id,
        this.pool
      );

      // Save to database
      const result = await this.pool.query(`
        INSERT INTO conversations (
          user_id, chatbot_id, conversation_data, emne, score, 
          customer_rating, lacking_info, fallback, ligegyldig, tags,
          form_data, is_livechat, split_test_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `, [
        conversationData.user_id,
        conversationData.chatbot_id,
        JSON.stringify(conversationData.messages),
        emne,
        score,
        conversationData.customer_rating || null,
        lacking_info,
        fallback,
        ligegyldig,
        tags ? JSON.stringify(tags) : null,
        conversationData.form_data ? JSON.stringify(conversationData.form_data) : null,
        conversationData.is_livechat || false,
        conversationData.split_test_id || null
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error saving conversation:', error);
      throw error;
    }
  }

  /**
   * Get conversation configuration for a chatbot
   * Uses the configuration service for complete configuration loading
   */
  async getConversationConfiguration(chatbotId, runtimeConfig = {}) {
    try {
      // Get complete configuration from database
      const databaseConfig = await this.configuration.getFrontendConfiguration(chatbotId);
      
      // Merge with runtime configuration
      const mergedConfig = this.configuration.mergeRuntimeConfiguration(databaseConfig, runtimeConfig);
      
      // Validate configuration
      const validation = this.configuration.validateConfiguration(mergedConfig);
      if (!validation.isValid) {
        console.warn('Configuration validation failed:', validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn('Configuration warnings:', validation.warnings);
      }
      
      return mergedConfig;
    } catch (error) {
      console.error('Error getting conversation configuration:', error);
      throw error;
    }
  }
}

/**
 * Factory function to create service instance
 */
export function createConversationProcessingService(pool) {
  return new ConversationProcessingService(pool);
}
