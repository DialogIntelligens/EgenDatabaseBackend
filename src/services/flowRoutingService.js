import { buildPrompt } from '../../promptTemplateV2Routes.js';

/**
 * Flow Routing Service
 * Handles flow determination, parallel execution, and metadata processing
 */
export class FlowRoutingService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Determine which conversation flow to use
   * This replaces the frontend flow routing logic
   */
  async determineFlow(messageText, conversationHistory, configuration, imageDescription = '') {
    console.log('🔍 Backend: Starting flow determination for message:', messageText.substring(0, 50));

    try {
      // Check if any flow keys are configured at all
      const hasFlowKeys = this.hasAnyFlowKeys(configuration);

      if (!hasFlowKeys) {
        // No flow keys configured - go straight to main flow
        console.log('🔍 Backend: No flow keys configured, using main flow directly');
        return {
          questionType: 'main',
          method: 'direct',
          executionTime: 0
        };
      }

      // Check if fordelingsflow template is assigned
      const hasFordelingsflow = await this.checkFordelingsflowTemplate(configuration.chatbot_id);

      if (hasFordelingsflow) {
        // Use parallel execution for optimal performance
        return await this.executeParallelFlows(messageText, conversationHistory, configuration, imageDescription);
      } else {
        // Fallback to sequential execution
        return await this.executeSequentialFlow(messageText, conversationHistory, configuration);
      }
    } catch (error) {
      console.error('🚨 Backend: Error in flow determination:', error);
      throw error;
    }
  }

  /**
   * Check if any flow keys are configured (not just fordelingsflow)
   */
  hasAnyFlowKeys(configuration) {
    const flowKeys = [
      configuration.flow2Key,
      configuration.flow3Key,
      configuration.flow4Key,
      configuration.apiFlowKey,
      configuration.metaDataKey,
      configuration.metaData2Key
    ];

    // Check if any flow key is configured (not null/undefined/empty)
    return flowKeys.some(key => key && key.trim() !== '');
  }

  /**
   * Check if fordelingsflow template is assigned
   */
  async checkFordelingsflowTemplate(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT template_id 
        FROM flow_template_assignments 
        WHERE chatbot_id = $1 AND flow_key = 'fordelingsflow'
      `, [chatbotId]);

      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking fordelingsflow template:', error);
      return false;
    }
  }

  /**
   * Check if a specific flow has a template assignment
   */
  async hasTemplateAssignment(chatbotId, flowKey) {
    try {
      const result = await this.pool.query(`
        SELECT template_id 
        FROM flow_template_assignments 
        WHERE chatbot_id = $1 AND flow_key = $2
      `, [chatbotId, flowKey]);

      return result.rows.length > 0;
    } catch (error) {
      console.error(`Error checking ${flowKey} template assignment:`, error);
      return false;
    }
  }

  /**
   * Execute parallel flows (fordelingsflow + metadata) for optimal latency
   */
  async executeParallelFlows(messageText, conversationHistory, configuration, imageDescription) {
    console.log('🚀 Backend: Starting parallel execution of fordelingsflow and metadata flows');
    
    const parallelStartTime = performance.now();
    
    // Check if metadata flows are available (use database flow keys)
    const hasMetadataFlow = configuration.metaDataKey && await this.hasTemplateAssignment(configuration.chatbot_id, 'metadata');
    const hasMetadata2Flow = configuration.metaData2Key && await this.hasTemplateAssignment(configuration.chatbot_id, 'metadata2');
    
    if (!hasMetadataFlow && !hasMetadata2Flow) {
      console.log('🚀 Backend: No metadata flows available, falling back to sequential execution');
      return await this.executeSequentialFlow(messageText, conversationHistory, configuration);
    }

    // Prepare question with image description for metadata flows
    let finalQuestionForMetadata = messageText;
    if (imageDescription) {
      finalQuestionForMetadata += " image description(act as if this is an image that you are viewing): " +
        imageDescription +
        " Omkring denne billedbeskrivelse: sig ikke at det lyder som om, men at det ligner. Opfør dig som om at teksten er det billede du ser. ";
    }

    // Execute fordelingsflow and metadata flows in parallel
    const [fordelingsflowResult, metadataResults] = await Promise.all([
      this.executeFordelingsflow(messageText, conversationHistory, configuration),
      this.executeMetadataFlows(finalQuestionForMetadata, conversationHistory, configuration, hasMetadataFlow, hasMetadata2Flow)
    ]);

    const questionType = fordelingsflowResult.text;
    const needsMetadata = questionType === configuration.metaDataKey || questionType === configuration.metaData2Key;
    
    let selectedMetaData = {};
    if (needsMetadata) {
      console.log(`🔍 Backend: Fordelingsflow determined metadata is needed for questionType: ${questionType}`);
      if (questionType === configuration.metaDataKey && metadataResults.metadata) {
        selectedMetaData = metadataResults.metadata;
        console.log(`🔍 Backend: Using metadata flow result:`, selectedMetaData);
      } else if (questionType === configuration.metaData2Key && metadataResults.metadata2) {
        selectedMetaData = metadataResults.metadata2;
        console.log(`🔍 Backend: Using metadata2 flow result:`, selectedMetaData);
      }
    } else {
      console.log(`🔍 Backend: Fordelingsflow determined no metadata needed for questionType: ${questionType}`);
    }

    const totalDuration = performance.now() - parallelStartTime;
    console.log(`🚀 Backend: Parallel execution completed in ${totalDuration.toFixed(0)}ms`);

    return {
      questionType,
      selectedMetaData,
      executionTime: totalDuration,
      method: 'parallel'
    };
  }

  /**
   * Execute fordelingsflow to determine question type
   * Migrated from frontend query() function with full logic
   */
  async executeFordelingsflow(messageText, conversationHistory, configuration) {
    try {
      console.log("🔄 ROUTING: Checking for fordelingsflow template assignment");
      
      // Check if there's a fordelingsflow template assigned
      const checkTemplateResponse = await this.pool.query(`
        SELECT template_id FROM flow_template_assignments 
        WHERE chatbot_id = $1 AND flow_key = 'fordelingsflow'
      `, [configuration.chatbot_id]);
      
      if (checkTemplateResponse.rows.length > 0) {
        // Use new routing API with prompt override
        console.log("🔄 ROUTING: Found fordelingsflow template, using new routing API");
        const routingAPI = "https://den-utrolige-snebold.onrender.com/api/v1/prediction/52c2cdfa-581f-4a0f-b70e-4f617ed0029e";
        
        // Fetch the fordelingsflow prompt
        const fordelingsflowPrompt = await buildPrompt(this.pool, configuration.chatbot_id, 'fordelingsflow');
        console.log("🔄 ROUTING: Loaded fordelingsflow prompt, length:", fordelingsflowPrompt?.length || 0);
        
        // Create body with prompt override
        const bodyWithOverride = {
          question: messageText,
          history: conversationHistory,
          overrideConfig: {
            vars: {
              fordelingsprompt: fordelingsflowPrompt
            }
          }
        };

        // Apply Pinecone API key for fordelingsflow
        const pineconeApiKey = this.getPineconeApiKeyForFlow('fordelingsflow', configuration);
        if (pineconeApiKey) {
          bodyWithOverride.overrideConfig.pineconeApiKey = pineconeApiKey;
          console.log(`Applied Pinecone API key for fordelingsflow: ${pineconeApiKey.substring(0, 20)}...`);
        }

        // Log complete override config for fordelingsflow
        console.log(`📋 Backend: FORDELINGSFLOW OVERRIDE CONFIG:`, JSON.stringify(bodyWithOverride.overrideConfig || {}, null, 2));
        
        const { makeAiApiRequest } = await import('../utils/connectionPoolUtils.js');
        const response = await makeAiApiRequest(routingAPI, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyWithOverride)
        });
        
        if (!response.ok) {
          throw new Error(`Fordelingsflow API failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('🔍 Backend: Fordelingsflow result:', result.text);
        return result;
      } else {
        console.log("🔄 ROUTING: No fordelingsflow template assigned, falling back to main flow");
        // Fallback: return default endpoint for main flow
        return { text: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/c88bd6dd-a846-4862-b234-59c8b459b816" };
      }
    } catch (error) {
      console.error('Error executing fordelingsflow:', error);
      // Fallback on error
      console.log("🔄 ROUTING: Error in fordelingsflow, falling back to main flow");
      return { text: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/c88bd6dd-a846-4862-b234-59c8b459b816" };
    }
  }

  /**
   * Execute metadata flows in parallel
   */
  async executeMetadataFlows(questionText, conversationHistory, configuration, hasMetadataFlow, hasMetadata2Flow) {
    const metadataPromises = [];

    if (hasMetadataFlow) {
      metadataPromises.push(this.executeMetadataFlow(questionText, conversationHistory, configuration, 'metadata'));
    }

    if (hasMetadata2Flow) {
      metadataPromises.push(this.executeMetadataFlow(questionText, conversationHistory, configuration, 'metadata2'));
    }

    const results = await Promise.allSettled(metadataPromises);
    
    const metadataResults = {};
    results.forEach((result, index) => {
      const flowType = index === 0 ? (hasMetadataFlow ? 'metadata' : 'metadata2') : 'metadata2';
      
      if (result.status === 'fulfilled' && result.value) {
        metadataResults[flowType] = result.value;
      } else {
        console.error(`Metadata flow ${flowType} failed:`, result.reason);
        metadataResults[flowType] = {};
      }
    });

    return metadataResults;
  }

  /**
   * Execute a specific metadata flow (non-streaming, for filter extraction only)
   * This should NEVER be streamed to the user - only used for metadata filters
   */
  async executeMetadataFlow(questionText, conversationHistory, configuration, flowType) {
    try {
      const isMetadata2 = flowType === 'metadata2';
      const promptKey = isMetadata2 ? 'metadata2' : 'metadata';
      
      console.log(`🔍 Backend: Executing ${flowType} flow for metadata extraction (non-streaming)`);
      
      const metadataPrompt = await buildPrompt(this.pool, configuration.chatbot_id, promptKey);
      
      const requestBody = {
        question: questionText,
        history: conversationHistory,
        overrideConfig: {
          vars: {
            masterPrompt: metadataPrompt
          }
        }
      };

      // Apply configuration overrides
      this.applyConfigurationOverrides(requestBody, configuration);

      // Apply Pinecone API key for metadata flows
      const pineconeApiKey = this.getPineconeApiKeyForFlow(flowType, configuration);
      if (pineconeApiKey) {
        requestBody.overrideConfig = requestBody.overrideConfig || {};
        requestBody.overrideConfig.pineconeApiKey = pineconeApiKey;
        console.log(`Applied Pinecone API key for ${flowType} flow: ${pineconeApiKey.substring(0, 20)}...`);
      }

      // Log complete override config for metadata flow
      console.log(`📋 Backend: ${flowType.toUpperCase()} OVERRIDE CONFIG:`, JSON.stringify(requestBody.overrideConfig || {}, null, 2));

      // IMPORTANT: This is a NON-STREAMING call - just get the metadata, don't stream to user
      const { makeAiApiRequest } = await import('../utils/connectionPoolUtils.js');
      const response = await makeAiApiRequest("https://den-utrolige-snebold.onrender.com/api/v1/prediction/c1b6c8d2-dd76-443d-ae5f-42efaf8c3668", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer YOUR_API_KEY",
        },
        body: JSON.stringify(requestBody) // Note: NO streaming: true
      });

      if (!response.ok) {
        throw new Error(`Metadata flow ${flowType} API failed: ${response.status}`);
      }

      const result = await response.json();
      let responseText = result.text || "";

      // Parse metadata response (same logic as frontend)
      return this.parseMetadataResponse(responseText, flowType);

    } catch (error) {
      console.error(`Error executing ${flowType} flow:`, error);
      return {};
    }
  }

  /**
   * Parse metadata response (handles both special character format and regular JSON)
   */
  parseMetadataResponse(responseText, flowType) {
    // Try special character format (# for { and ! for })
    if (responseText.includes("#") && responseText.includes("!")) {
      try {
        const modifiedText = responseText.replace(/#/g, "{").replace(/!/g, "}");
        const parsed = JSON.parse(modifiedText);
        console.log(`🔍 Backend: ${flowType} flow parsed (special format):`, parsed);
        return parsed;
      } catch (error) {
        console.warn(`${flowType} flow special format parsing failed:`, error.message);
      }
    }

    // Try regular JSON format
    if (responseText.includes("{") && responseText.includes("}")) {
      try {
        const parsed = JSON.parse(responseText);
        console.log(`🔍 Backend: ${flowType} flow parsed (regular JSON):`, parsed);
        return parsed;
      } catch (error) {
        console.warn(`${flowType} flow regular JSON parsing failed:`, error.message);
      }
    }

    console.log(`🔍 Backend: ${flowType} flow returning empty metadata (unparseable response)`);
    return {};
  }

  /**
   * Execute sequential flow (fallback when parallel is not available)
   */
  async executeSequentialFlow(messageText, conversationHistory, configuration) {
    console.log('🔍 Backend: Using sequential flow execution');

    try {
      // Use basic routing to determine question type
      const questionTypeResult = await this.executeBasicRouting(messageText, conversationHistory, configuration);
      
      return {
        questionType: questionTypeResult.text,
        selectedMetaData: {},
        executionTime: 0,
        method: 'sequential'
      };
    } catch (error) {
      console.error('Error in sequential flow execution:', error);
      throw error;
    }
  }

  /**
   * Execute basic routing (fallback)
   */
  async executeBasicRouting(messageText, conversationHistory, configuration) {
    const requestBody = {
      question: messageText,
      history: conversationHistory,
    };

    const response = await fetch("https://den-utrolige-snebold.onrender.com/api/v1/prediction/c88bd6dd-a846-4862-b234-59c8b459b816", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Basic routing API failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Get Pinecone API key for a specific flow
   */
  getPineconeApiKeyForFlow(flowType, configuration) {
    try {
      // Get flow-specific API key from configuration
      const flowApiKey = configuration.flowApiKeys?.[flowType];
      if (flowApiKey) {
        return flowApiKey;
      }
      
      // Fallback to default API key
      if (configuration.pineconeApiKey) {
        return configuration.pineconeApiKey;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting Pinecone API key for flow:', error);
      return null;
    }
  }

  /**
   * Apply configuration overrides to request body
   */
  applyConfigurationOverrides(requestBody, configuration) {
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
   * Validate flow configuration
   */
  async validateFlowConfiguration(questionType, configuration) {
    const { chatbot_id, flow2Key, flow3Key, flow4Key, apiFlowKey, metaDataKey, metaData2Key } = configuration;

    // Check if the determined flow has a valid prompt configured
    let flowKey = 'main'; // Default
    if (questionType === flow2Key) flowKey = 'flow2';
    else if (questionType === flow3Key) flowKey = 'flow3';
    else if (questionType === flow4Key) flowKey = 'flow4';
    else if (questionType === apiFlowKey) flowKey = 'apiflow';
    else if (questionType === metaDataKey) flowKey = 'metadata';
    else if (questionType === metaData2Key) flowKey = 'metadata2';

    try {
      const prompt = await buildPrompt(this.pool, chatbot_id, flowKey);
      if (!prompt || prompt.trim() === '') {
        throw new Error(`No prompt configured for flow: ${flowKey}`);
      }
      return { isValid: true, flowKey, prompt };
    } catch (error) {
      console.error(`Flow validation failed for ${flowKey}:`, error);
      return { isValid: false, flowKey, error: error.message };
    }
  }
}

/**
 * Factory function to create service instance
 */
export function createFlowRoutingService(pool) {
  return new FlowRoutingService(pool);
}
