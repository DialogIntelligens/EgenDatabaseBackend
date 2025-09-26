import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate OpenAI embedding for text
 */
export async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding: ' + error.message);
  }
}

/**
 * Get the API key for a specific index or fallback to user's default key
 */
export async function getPineconeApiKeyForIndex(pool, userId, indexName, namespace) {
  try {
    // Get user data
    const userResult = await pool.query('SELECT pinecone_api_key, pinecone_indexes FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const user = userResult.rows[0];
    let pineconeIndexes = user.pinecone_indexes;
    
    // Parse indexes if it's a string
    if (typeof pineconeIndexes === 'string') {
      pineconeIndexes = JSON.parse(pineconeIndexes);
    }
    
    // Check if pineconeIndexes is an array
    if (Array.isArray(pineconeIndexes)) {
      // Look for the matching index with the specified namespace and index_name
      const matchedIndex = pineconeIndexes.find(index => 
        index.namespace === namespace && 
        index.index_name === indexName && 
        index.API_key
      );
      
      if (matchedIndex) {
        console.log(`Using specific API key for index: ${indexName}, namespace: ${namespace}`);
        return matchedIndex.API_key;
      }
    }
    
    // If no specific API key found, use the user's default API key
    if (user.pinecone_api_key) {
      console.log(`Using default user API key for index: ${indexName}, namespace: ${namespace}`);
      return user.pinecone_api_key;
    }
    
    throw new Error('No Pinecone API key found for this user and index');
  } catch (error) {
    console.error('Error getting Pinecone API key:', error);
    throw error;
  }
}

/**
 * Initialize Pinecone client with API key
 */
export function initializePineconeClient(apiKey) {
  return new Pinecone({ apiKey });
}

/**
 * Create a unique vector ID
 */
export function createVectorId() {
  return `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Prepare vector metadata for Pinecone
 */
export function prepareVectorMetadata(userId, text, title, group = null) {
  const metadata = {
    user_id: userId,
    text: text,
    title: title,
    timestamp: new Date().toISOString()
  };
  
  // Only add group if it's provided and not null/undefined
  if (group !== null && group !== undefined) {
    metadata.group = group;
  }
  
  return metadata;
}

/**
 * Parse user's pinecone indexes from database
 */
export function parseUserPineconeIndexes(pineconeIndexes) {
  if (typeof pineconeIndexes === 'string') {
    return JSON.parse(pineconeIndexes);
  }
  return pineconeIndexes || [];
}

/**
 * Extract namespaces from user's pinecone indexes
 */
export function extractUserNamespaces(pineconeIndexes) {
  const parsed = parseUserPineconeIndexes(pineconeIndexes);
  return Array.isArray(parsed) ? parsed.map(index => index.namespace).filter(Boolean) : [];
}

/**
 * Prepare metadata for database storage
 */
export function prepareDatabaseMetadata(group) {
  return group ? { group } : {};
}

/**
 * Parse existing metadata from database
 */
export function parseExistingMetadata(existingMetadata) {
  let metadata = {};
  if (existingMetadata) {
    try {
      metadata = typeof existingMetadata === 'string'
        ? JSON.parse(existingMetadata)
        : existingMetadata;
    } catch (e) {
      console.error('Error parsing existing metadata:', e);
      metadata = {};
    }
  }
  return metadata;
}

/**
 * Format Pinecone data response for API
 */
export function formatPineconeDataResponse(rows) {
  return rows.map((row) => {
    // Extract group from metadata if available
    let group = null;
    if (row.metadata) {
      try {
        const metadata = typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : row.metadata;
        group = metadata.group;
      } catch (e) {
        console.error('Error parsing metadata:', e);
      }
    }
    
    return {
      title: row.title,
      text: row.text,
      id: row.id,
      pinecone_index_name: row.pinecone_index_name,
      namespace: row.namespace,
      expiration_time: row.expiration_time,
      scheduled_time: row.scheduled_time, // Include scheduled time
      is_scheduled: row.is_scheduled, // Include scheduling status
      group: group, // Include group information
      has_viewed: row.has_viewed // Include the has_viewed status
    };
  });
}