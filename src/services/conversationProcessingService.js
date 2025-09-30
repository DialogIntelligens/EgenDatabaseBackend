import { createFlowRoutingService } from './flowRoutingService.js';
import { createAiStreamingService } from './aiStreamingService.js';
import { createOrderTrackingService } from './orderTrackingService.js';
import { createConfigurationService } from './configurationService.js';
import { createImageProcessingService } from './imageProcessingService.js';
import { createConversationAnalyticsService } from './conversationAnalyticsService.js';
import { createPerformanceTrackingService } from './performanceTrackingService.js';
import { getEmneAndScore } from '../utils/mainUtils.js';
import { buildPrompt, buildRephrasePrompt } from '../../promptTemplateV2Routes.js';

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
      message_text = '', // Default to empty string for image-only messages
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

      // Step 1: Process image if provided
      let imageDescription = '';
      if (image_data && (configuration.image_enabled || configuration.imageEnabled || configuration.imageAPI)) {
        perfTracker.startPhase('image_processing');
        console.log('📷 Backend: Processing image for description generation');
        imageDescription = await this.imageProcessing.processImage(image_data, message_text || '', configuration);
        perfTracker.endPhase('image_processing', { has_image: true, description_length: imageDescription.length });
        console.log('📷 Backend: Image processed, description length:', imageDescription.length);
      } else {
        console.log('📷 Backend: Skipping image processing - config:', {
          image_enabled: configuration.image_enabled,
          imageEnabled: configuration.imageEnabled,
          imageAPI: configuration.imageAPI,
          has_image_data: !!image_data
        });
      }

      // Step 2: Create session for tracking
      perfTracker.startPhase('session_creation');
      const session = await this.createSession(user_id, chatbot_id, session_id, message_text, image_data);
      perfTracker.endPhase('session_creation');

      // Step 2.5: Build complete conversation history from database
      perfTracker.startPhase('history_reconstruction');
      const completeHistory = await this.buildCompleteConversationHistory(user_id, chatbot_id, conversation_history);
      perfTracker.endPhase('history_reconstruction', { 
        frontend_history_length: conversation_history?.length || 0,
        complete_history_length: completeHistory.length 
      });

      // Step 3: Determine conversation flow type
      // For image-only messages, use default message text for flow determination
      const effectiveMessageText = message_text || (image_data ? 'Hvad kan du se på dette billede?' : '');
      if (!message_text && image_data) {
        console.log('📷 Backend: Image-only message detected, using default question for flow determination');
      }
      
      
      perfTracker.startPhase('flow_determination');
      const flowResult = await this.flowRouting.determineFlow(
        effectiveMessageText,
        completeHistory,
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
        effectiveMessageText,
        completeHistory,
        imageDescription,
        configuration,
        session.id,
        {
          rawMessage: message_text || '',
          imageData: image_data || null
        }
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
   * Build complete conversation history from database
   * This ensures AI has access to all previous messages, not just what frontend sends
   */
  async buildCompleteConversationHistory(userId, chatbotId, frontendHistory = []) {
    try {
      console.log('📚 Backend: Building complete conversation history from database');
      
      // Get existing conversation from database
      const existingConversation = await this.aiStreaming.getExistingConversation(userId, chatbotId);
      
      if (!existingConversation || !existingConversation.conversation_data) {
        console.log('📚 Backend: No existing conversation found, using frontend history');
        return frontendHistory || [];
      }

      // Parse conversation data from database
      let dbMessages = [];
      try {
        dbMessages = typeof existingConversation.conversation_data === 'string' 
          ? JSON.parse(existingConversation.conversation_data)
          : existingConversation.conversation_data;
      } catch (e) {
        console.error('📚 Backend: Error parsing conversation data, using frontend history:', e);
        return frontendHistory || [];
      }

      if (!Array.isArray(dbMessages)) {
        console.log('📚 Backend: Invalid conversation data format, using frontend history');
        return frontendHistory || [];
      }

      // Convert database format to flowise history format
      const historyForFlowise = dbMessages
        .filter(msg => msg.text && msg.text.trim() !== '') // Only include messages with content
        .map(msg => ({
          content: msg.text,
          role: msg.isUser ? "userMessage" : "apiMessage"
        }));

      console.log(`📚 Backend: Built complete history: ${historyForFlowise.length} messages (${dbMessages.length} total in DB)`);
      return historyForFlowise;

    } catch (error) {
      console.error('📚 Backend: Error building conversation history:', error);
      console.log('📚 Backend: Falling back to frontend history');
      return frontendHistory || [];
    }
  }

  /**
   * Create or update conversation session
   */
  async createSession(userId, chatbotId, sessionId = null, messageText = '', imageData = null) {
    try {
      const sessionConfig = {
        user_message: messageText || '',
        timestamp: new Date().toISOString()
      };

      if (imageData) {
        sessionConfig.image_data = imageData.data || imageData;
        if (imageData.name) sessionConfig.image_name = imageData.name;
        if (imageData.mime) sessionConfig.image_mime = imageData.mime;
        if (imageData.size) sessionConfig.image_size = imageData.size;
        if (typeof imageData.isFile === 'boolean') sessionConfig.image_is_file = imageData.isFile;
      }

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
        JSON.stringify(sessionConfig)
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
  async executeFlow(flowResult, messageText, conversationHistory, imageDescription, configuration, sessionId, messageMetadata = {}) {
    const { questionType, selectedMetaData } = flowResult;
    
    console.log(`🔍 Backend: Executing flow for questionType: ${questionType}`);
    console.log(`🔍 Backend: Available flow keys:`, {
      apiFlowKey: configuration.apiFlowKey,
      metaDataKey: configuration.metaDataKey,
      metaData2Key: configuration.metaData2Key,
      flow2Key: configuration.flow2Key,
      flow3Key: configuration.flow3Key,
      flow4Key: configuration.flow4Key
    });
    
    // CRITICAL: Determine the correct flow for streaming
    // If questionType matches a metadata flow, we need to find the actual flow to use
    let actualQuestionType = questionType;
    
    if (questionType === configuration.metaDataKey || questionType === configuration.metaData2Key) {
      console.log(`🔍 Backend: QuestionType '${questionType}' is a metadata flow - finding actual streaming flow`);
      
      // Check if this questionType also matches any other flow keys
      if (questionType === configuration.flow2Key) {
        actualQuestionType = 'flow2';
        console.log(`✅ Backend: Metadata questionType '${questionType}' also matches flow2Key - using flow2 for streaming`);
      } else if (questionType === configuration.flow3Key) {
        actualQuestionType = 'flow3';
        console.log(`✅ Backend: Metadata questionType '${questionType}' also matches flow3Key - using flow3 for streaming`);
      } else if (questionType === configuration.flow4Key) {
        actualQuestionType = 'flow4';
        console.log(`✅ Backend: Metadata questionType '${questionType}' also matches flow4Key - using flow4 for streaming`);
      } else if (questionType === configuration.apiFlowKey) {
        actualQuestionType = 'apiflow';
        console.log(`✅ Backend: Metadata questionType '${questionType}' also matches apiFlowKey - using apiflow for streaming`);
      } else {
        actualQuestionType = 'main';
        console.log(`⚠️ Backend: Metadata questionType '${questionType}' doesn't match any other flow - using main flow for streaming`);
      }
    }

    // Log the final flow key being used for streaming
    console.log(`🎯 Backend: FINAL STREAMING FLOW - Using flow key: '${actualQuestionType}' (from questionType: '${questionType}')`);
    
    // Build final question with image description if present
    let finalQuestion = messageText;
    if (imageDescription) {
      finalQuestion += " image description(act as if this is an image that you are viewing): " +
        imageDescription +
        " Omkring denne billedbeskrivelse: sig ikke at det lyder som om, men at det ligner. Opfør dig som om at teksten er det billede du ser. ";
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

    // Apply metadata filters if available (this is the key part!)
    if (Object.keys(selectedMetaData).length > 0) {
      requestBody.overrideConfig = {
        pineconeMetadataFilter: selectedMetaData,
      };
      console.log(`🔍 Backend: Applied metadata filters:`, selectedMetaData);
    }

    // Apply flow-specific configurations (use actualQuestionType for streaming)
    console.log(`🔧 Backend: Calling applyFlowConfiguration with actualQuestionType: ${actualQuestionType}`);
    try {
      await this.applyFlowConfiguration(requestBody, actualQuestionType, configuration);
    } catch (promptError) {
      // If prompt configuration fails, throw a user-friendly error
      console.error(`🚨 Backend: Prompt configuration failed for flow '${actualQuestionType}':`, promptError.message);
      throw new Error(`Configuration error: ${promptError.message}`);
    }

    // Determine API URL based on actual flow type (not metadata flow)
    const apiUrl = this.getApiUrlForFlow(actualQuestionType, configuration);

    // Log complete override configuration being sent to AI API
    console.log(`🔍 Backend: Final streaming will use questionType: ${actualQuestionType}, API: ${apiUrl}`);
    console.log(`📋 Backend: COMPLETE OVERRIDE CONFIG:`, JSON.stringify(requestBody.overrideConfig || {}, null, 2));

    return {
      apiUrl,
      requestBody,
      orderDetails,
      questionType: actualQuestionType // Return the actual streaming question type
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

    console.log(`🔧 Backend: applyFlowConfiguration called with questionType: ${questionType}`);

    // Apply website and language overrides
    this.applyOverrides(requestBody, configuration);

    // Get and apply prompt template for the flow with fallback logic
    try {
      const flowKey = this.getFlowKeyFromQuestionType(questionType, configuration);
      console.log(`🔧 Backend: getFlowKeyFromQuestionType(${questionType}) returned: ${flowKey}`);
      
      if (flowKey) {
        let prompt = await buildPrompt(this.pool, chatbot_id, flowKey);
        let usedFlowKey = flowKey;
        
        // If no prompt found for the determined flow, try fallback to main
        if (!prompt || prompt.trim() === '') {
          console.log(`⚠️ No prompt found for ${flowKey} flow, trying fallback to main flow`);
          
          if (flowKey !== 'main') {
            prompt = await buildPrompt(this.pool, chatbot_id, 'main');
            usedFlowKey = 'main';
            
            if (!prompt || prompt.trim() === '') {
              throw new Error(`No template content available for flow '${flowKey}' and fallback 'main' flow also has no template. Please configure a template for this chatbot.`);
            } else {
              console.log(`✅ Using fallback main prompt for ${flowKey} flow (length: ${prompt?.length || 0})`);
            }
          } else {
            throw new Error(`No template content available for main flow. Please configure a template for this chatbot.`);
          }
        }
        
        if (prompt) {
          requestBody.overrideConfig = requestBody.overrideConfig || {};
          requestBody.overrideConfig.vars = requestBody.overrideConfig.vars || {};
          requestBody.overrideConfig.vars.masterPrompt = prompt;
          console.log(`✅ Applied prompt template for ${usedFlowKey} flow (length: ${prompt?.length || 0})`);

          // Try to fetch and apply rephrase prompt for this flow
          try {
            const rephrasePrompt = await buildRephrasePrompt(this.pool, chatbot_id, usedFlowKey);
            if (rephrasePrompt && rephrasePrompt.trim() !== '') {
              requestBody.overrideConfig.vars.masterRephrasePrompt = rephrasePrompt;
              console.log(`✅ Applied rephrase prompt for ${usedFlowKey} flow (length: ${rephrasePrompt?.length || 0})`);
            } else {
              console.log(`ℹ️ No rephrase prompt found for ${usedFlowKey} flow`);
            }
          } catch (rephraseError) {
            console.log(`ℹ️ Could not fetch rephrase prompt for ${usedFlowKey}: ${rephraseError.message}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error applying prompt template for ${questionType}:`, error.message);
      throw error; // Don't continue without prompt - throw error to prevent AI response without prompt
    }

    // Apply topK settings (questionType here is actually the flow type like 'flow4')
    const topK = await this.getTopKForFlow(questionType, configuration);
    if (topK !== undefined) {
      requestBody.overrideConfig = requestBody.overrideConfig || {};
      requestBody.overrideConfig.topK = topK;
      console.log(`✅ Applied topK setting for ${questionType}: ${topK}`);
    }

    // Apply Pinecone index and API key overrides (questionType here is actually the flow type like 'flow4')
    const pineconeIndex = await this.getPineconeIndexForFlow(questionType, configuration);
    const pineconeApiKey = await this.getPineconeApiKeyForFlow(questionType, configuration);
    
    if (pineconeIndex) {
      requestBody.overrideConfig = requestBody.overrideConfig || {};
      requestBody.overrideConfig.pineconeIndex = pineconeIndex;
      console.log(`✅ Applied Pinecone index for ${questionType}: ${pineconeIndex}`);
    } else {
      console.log(`⚠️ No Pinecone index found for ${questionType} flow`);
    }
    
    if (pineconeApiKey) {
      requestBody.overrideConfig = requestBody.overrideConfig || {};
      requestBody.overrideConfig.pineconeApiKey = pineconeApiKey;
      console.log(`✅ Applied Pinecone API key for ${questionType}: ${pineconeApiKey.substring(0, 20)}...`);
    } else {
      console.log(`⚠️ No Pinecone API key found for ${questionType} flow`);
    }

    // Log final override config for this flow configuration
    console.log(`📋 Backend: ${questionType.toUpperCase()} FLOW OVERRIDE CONFIG:`, JSON.stringify(requestBody.overrideConfig || {}, null, 2));
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
   * Get flow key from question type (now uses database flow keys)
   * This method should receive the ACTUAL flow type (like 'flow4'), not the questionType
   */
  getFlowKeyFromQuestionType(questionType, configuration) {
    const { flow2Key, flow3Key, flow4Key, apiFlowKey, metaDataKey, metaData2Key } = configuration;

    // Map questionType to the correct flow key for template lookup
    if (questionType === flow2Key) return 'flow2';
    else if (questionType === flow3Key) return 'flow3';
    else if (questionType === flow4Key) return 'flow4';
    else if (questionType === apiFlowKey) return 'apiflow';
    else if (questionType === metaDataKey) return 'metadata';
    else if (questionType === metaData2Key) return 'metadata2';
    else if (questionType === 'other') return 'main'; // Special case
    else return 'main'; // Default fallback
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
      // Enhanced error categorization
      const errorCategory = this.categorizeError(error);
      const recoveryAction = this.getRecoveryAction(error);

      await this.pool.query(`
        INSERT INTO error_logs (chatbot_id, user_id, error_category, error_message, error_details, stack_trace)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        context.chatbot_id || null,
        context.user_id || null,
        errorCategory,
        error.message || 'Unknown error',
        JSON.stringify({
          context,
          errorCategory,
          recoveryAction,
          timestamp: new Date().toISOString(),
          error_type: error.constructor.name,
          systemState: this.getSystemState()
        }),
        error.stack || null
      ]);

      console.log(`🚨 Backend: Error logged - Category: ${errorCategory}, Recovery: ${recoveryAction}`);
    } catch (logError) {
      console.error('Failed to log error to database:', logError);
    }
  }

  /**
   * Categorize errors for better tracking
   */
  categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('pinecone') || message.includes('404')) {
      return 'PINECONE_ERROR';
    }
    if (message.includes('template') || message.includes('prompt')) {
      return 'TEMPLATE_ERROR';
    }
    if (message.includes('database') || message.includes('sql')) {
      return 'DATABASE_ERROR';
    }
    if (message.includes('streaming') || message.includes('sse')) {
      return 'STREAMING_ERROR';
    }
    
    return 'CONVERSATION_PROCESSING_ERROR';
  }

  /**
   * Get recovery action for error type
   */
  getRecoveryAction(error) {
    const category = this.categorizeError(error);
    
    const recoveryActions = {
      'NETWORK_ERROR': 'Retry with exponential backoff',
      'PINECONE_ERROR': 'Check Pinecone configuration and API keys',
      'TEMPLATE_ERROR': 'Verify template assignments and prompt content',
      'DATABASE_ERROR': 'Check database connectivity and schema',
      'STREAMING_ERROR': 'Restart streaming session',
      'CONVERSATION_PROCESSING_ERROR': 'Manual investigation required'
    };
    
    return recoveryActions[category] || 'Manual investigation required';
  }

  /**
   * Get current system state for debugging
   */
  getSystemState() {
    return {
      timestamp: new Date().toISOString(),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
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
