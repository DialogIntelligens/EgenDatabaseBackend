/**
 * Flow Routing Utilities
 * Helper functions for flow configuration and API endpoint mapping
 */

/**
 * Map flow keys to their corresponding configuration keys
 */
export const FLOW_KEY_MAPPING = {
  main: 'mainPrompt',
  fordelingsflow: 'fordelingsflowPrompt',
  statistics: 'statestikPrompt',
  apiflow: 'apiFlowPrompt',
  apivarflow: 'apiVarFlowPrompt',
  metadata: 'metaDataPrompt',
  metadata2: 'metaData2Prompt',
  flow2: 'flow2Prompt',
  flow3: 'flow3Prompt',
  flow4: 'flow4Prompt',
  image: 'imagePrompt'
};

/**
 * Standard API endpoints for different flow types
 */
export const API_ENDPOINTS = {
  main: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/c88bd6dd-a846-4862-b234-59c8b459b816",
  fordelingsflow: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/52c2cdfa-581f-4a0f-b70e-4f617ed0029e",
  metadata: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/c1b6c8d2-dd76-443d-ae5f-42efaf8c3668",
  metadata2: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/c1b6c8d2-dd76-443d-ae5f-42efaf8c3668",
  statistics: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/53e9c446-b2a3-41ca-8a01-8d48c05fcc7a",
  image: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/eed6c6d2-16ee-40ae-be9f-3cc39f91dc2c",
  // All other flows use the main endpoint
  apiflow: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/c88bd6dd-a846-4862-b234-59c8b459b816",
  flow2: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/c88bd6dd-a846-4862-b234-59c8b459b816",
  flow3: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/c88bd6dd-a846-4862-b234-59c8b459b816",
  flow4: "https://den-utrolige-snebold.onrender.com/api/v1/prediction/c88bd6dd-a846-4862-b234-59c8b459b816"
};

/**
 * Get API endpoint for a specific flow type
 */
export function getApiEndpointForFlow(flowType, questionType, configuration) {
  const { apiFlowKey, metaDataKey, metaData2Key, flow2Key, flow3Key, flow4Key } = configuration;

  // Map question type to flow key
  let flowKey = 'main'; // default
  if (questionType === apiFlowKey) flowKey = 'apiflow';
  else if (questionType === metaDataKey) flowKey = 'metadata';
  else if (questionType === metaData2Key) flowKey = 'metadata2';
  else if (questionType === flow2Key) flowKey = 'flow2';
  else if (questionType === flow3Key) flowKey = 'flow3';
  else if (questionType === flow4Key) flowKey = 'flow4';

  return API_ENDPOINTS[flowKey] || API_ENDPOINTS.main;
}

/**
 * Get required flows based on configuration
 */
export function getRequiredFlows(configuration) {
  const flows = [];
  
  // Always include core flows
  flows.push('fordelingsflow', 'statistics', 'main');
  
  // Add flows that have keys configured
  if (configuration.apiFlowKey) flows.push('apiflow', 'apivarflow');
  if (configuration.metaDataKey) flows.push('metadata');
  if (configuration.metaData2Key) flows.push('metadata2');
  if (configuration.flow2Key) flows.push('flow2');
  if (configuration.flow3Key) flows.push('flow3');
  if (configuration.flow4Key) flows.push('flow4');
  
  // Add image flow if enabled
  if (configuration.imageEnabled || configuration.imageAPI) flows.push('image');
  
  return flows;
}

/**
 * Validate flow configuration completeness
 */
export function validateFlowConfiguration(configuration) {
  const errors = [];
  const warnings = [];

  // Check required flow keys
  const requiredFlows = getRequiredFlows(configuration);
  
  requiredFlows.forEach(flow => {
    const configKey = FLOW_KEY_MAPPING[flow];
    if (configKey && !configuration[configKey]) {
      warnings.push(`Missing prompt configuration for flow: ${flow}`);
    }
  });

  // Check for conflicting configurations
  if (configuration.imageEnabled && !configuration.imageAPI && !configuration.imagePromptEnabled) {
    warnings.push('Image uploads enabled but no image processing API or prompt configured');
  }

  // Check for missing API keys
  if (configuration.apiFlowKey && !configuration.apiFlowPrompt) {
    errors.push('API flow key configured but no prompt available');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    requiredFlows
  };
}

/**
 * Build override configuration for API requests
 */
export function buildOverrideConfig(configuration, flowType, additionalVars = {}) {
  const overrideConfig = {
    vars: { ...additionalVars }
  };

  // Apply website and language overrides
  if (configuration.websiteOverride) overrideConfig.vars.website = configuration.websiteOverride;
  if (configuration.languageOverride) overrideConfig.vars.language = configuration.languageOverride;
  if (configuration.valutaOverride) overrideConfig.vars.valuta = configuration.valutaOverride;
  if (configuration.dillingproductkatoverride) overrideConfig.vars.dillingproductkat = configuration.dillingproductkatoverride;
  if (configuration.dillingcolors) overrideConfig.vars.dillingcolors = configuration.dillingcolors;
  if (configuration.customVar1) overrideConfig.vars.customVar1 = configuration.customVar1;

  // Apply topK settings
  const topK = configuration.topKSettings?.[flowType];
  if (topK !== undefined) {
    overrideConfig.topK = topK;
  }

  // Apply Pinecone configurations
  const flowApiKey = configuration.flowApiKeys?.[flowType];
  if (flowApiKey) {
    overrideConfig.pineconeApiKey = flowApiKey;
  }

  return overrideConfig;
}

/**
 * Extract flow type from question type and configuration
 */
export function extractFlowType(questionType, configuration) {
  const { apiFlowKey, metaDataKey, metaData2Key, flow2Key, flow3Key, flow4Key } = configuration;

  if (questionType === apiFlowKey) return 'apiflow';
  if (questionType === metaDataKey) return 'metadata';
  if (questionType === metaData2Key) return 'metadata2';
  if (questionType === flow2Key) return 'flow2';
  if (questionType === flow3Key) return 'flow3';
  if (questionType === flow4Key) return 'flow4';
  
  return 'main';
}

/**
 * Check if a flow type requires special handling
 */
export function requiresSpecialHandling(flowType) {
  return ['apiflow', 'metadata', 'metadata2'].includes(flowType);
}

/**
 * Get default configuration for a flow type
 */
export function getDefaultFlowConfig(flowType) {
  const defaults = {
    main: {
      promptEnabled: true,
      rephrasePromptEnabled: true,
      topK: undefined
    },
    apiflow: {
      promptEnabled: true,
      rephrasePromptEnabled: true,
      requiresOrderTracking: true,
      topK: undefined
    },
    metadata: {
      promptEnabled: true,
      rephrasePromptEnabled: false, // Metadata flows don't use rephrase
      topK: undefined
    },
    metadata2: {
      promptEnabled: true,
      rephrasePromptEnabled: false, // Metadata flows don't use rephrase
      topK: undefined
    },
    flow2: {
      promptEnabled: true,
      rephrasePromptEnabled: true,
      topK: undefined
    },
    flow3: {
      promptEnabled: true,
      rephrasePromptEnabled: true,
      topK: undefined
    },
    flow4: {
      promptEnabled: true,
      rephrasePromptEnabled: true,
      topK: undefined
    },
    image: {
      promptEnabled: true,
      rephrasePromptEnabled: false,
      topK: undefined
    },
    statistics: {
      promptEnabled: true,
      rephrasePromptEnabled: false,
      topK: undefined
    }
  };

  return defaults[flowType] || defaults.main;
}
