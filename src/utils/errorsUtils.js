export const validCategories = [
  'API_ERROR', 'DATABASE_ERROR', 'AUTHENTICATION_ERROR', 'VALIDATION_ERROR',
  'NETWORK_ERROR', 'PARSING_ERROR', 'AI_SERVICE_ERROR', 'VECTOR_DATABASE_ERROR',
  'FRESHDESK_ERROR', 'FRESHDESK_QUEUE_ERROR', 'UNKNOWN_ERROR'
];

export function categorizeError(errorMessage = '', errorDetails = null) {
  const message = String(errorMessage || '').toLowerCase();

  if (message.includes('freshdesk queue') || message.includes('queue processing')) {
    return 'FRESHDESK_QUEUE_ERROR';
  } else if (message.includes('freshdesk') || message.includes('ticket creation') || message.includes('freshdesk ticket')) {
    return 'FRESHDESK_ERROR';
  } else if (message.includes('api') || message.includes('fetch') || message.includes('request')) {
    return 'API_ERROR';
  } else if (message.includes('database') || message.includes('sql') || message.includes('query')) {
    return 'DATABASE_ERROR';
  } else if (message.includes('auth') || message.includes('token') || message.includes('unauthorized')) {
    return 'AUTHENTICATION_ERROR';
  } else if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
    return 'VALIDATION_ERROR';
  } else if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
    return 'NETWORK_ERROR';
  } else if (message.includes('parsing') || message.includes('json') || message.includes('syntax')) {
    return 'PARSING_ERROR';
  } else if (message.includes('openai') || message.includes('embedding') || message.includes('gpt')) {
    return 'AI_SERVICE_ERROR';
  } else if (message.includes('pinecone') || message.includes('vector')) {
    return 'VECTOR_DATABASE_ERROR';
  } else {
    return 'UNKNOWN_ERROR';
  }
}
