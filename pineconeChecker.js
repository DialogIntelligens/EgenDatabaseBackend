import { Pinecone } from '@pinecone-database/pinecone';
import pg from 'pg';

const { Pool } = pg;

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

// Helper function to get the API key for a specific index or fallback to user's default key
async function getPineconeApiKeyForIndex(userId, indexName, namespace) {
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
      
      // If found a matching index with API_key, return that key
      if (matchedIndex && matchedIndex.API_key) {
        console.log(`Using index-specific API key for index: ${indexName}, namespace: ${namespace}`);
        return matchedIndex.API_key;
      }
    }
    
    // Fallback to user's default API key
    if (user.pinecone_api_key) {
      console.log(`Using default user API key for index: ${indexName}, namespace: ${namespace}`);
      return user.pinecone_api_key;
    }
    
    throw new Error('No Pinecone API key found for this index or user');
  } catch (error) {
    console.error('Error getting Pinecone API key:', error);
    throw error;
  }
}

// Function to determine if a vector is from the scraper (should be ignored)
function isScraperVector(vectorId, metadata) {
  // Check if ID looks like a hash (scraper pattern)
  const isHashId = vectorId.includes('#') || (vectorId.length > 32 && !vectorId.startsWith('vector-'));
  
  // Check for scraper-specific metadata fields
  const hasScraperMetadata = metadata && (
    metadata.checksum ||
    metadata.chunkOverlap !== undefined ||
    metadata.chunkSize !== undefined ||
    metadata.chunk_id ||
    metadata.item_id ||
    metadata.last_seen_at ||
    metadata.performChunking !== undefined ||
    metadata.full_url ||
    metadata.fake_urls !== undefined
  );
  
  return isHashId || hasScraperMetadata;
}

// Function to get all vectors from a Pinecone index using describe stats and sampling
async function getAllVectorsFromIndex(pineconeClient, indexName, namespace) {
  try {
    const index = pineconeClient.index(indexName);
    
    // For now, return a message indicating limitation
    console.log(`Note: Full vector enumeration is not available in this SDK version.`);
    console.log(`Using alternative approach to check for potential missing chunks...`);
    
    // Return empty array for now - this approach has limitations
    return [];
    
  } catch (error) {
    console.error('Error accessing Pinecone index:', error);
    throw error;
  }
}

// Alternative approach: Check if database records exist in Pinecone
export async function checkMissingChunks(userId, indexName, namespace) {
  try {
    console.log(`Starting database-to-Pinecone check - User: ${userId}, Index: ${indexName}, Namespace: ${namespace}`);
    
    // Get all chunks from our database for this index/namespace
    const dbResult = await pool.query(
      `SELECT pinecone_vector_id, title, text, user_id, id as db_id, created_at
       FROM pinecone_data 
       WHERE pinecone_index_name = $1 AND namespace = $2
       ORDER BY created_at DESC`,
      [indexName, namespace]
    );
    
    console.log(`Found ${dbResult.rows.length} chunks in database`);
    
    if (dbResult.rows.length === 0) {
      return {
        summary: {
          databaseChunks: 0,
          checkedVectors: 0,
          existingInPinecone: 0,
          missingFromPinecone: 0,
          errors: 0
        },
        missingChunks: [],
        note: "No chunks found in database for this index/namespace"
      };
    }

    // Get Pinecone API key
    const pineconeApiKey = await getPineconeApiKeyForIndex(userId, indexName, namespace);
    
    // Initialize Pinecone client
    const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
    const index = pineconeClient.index(indexName);

    // Check each database record to see if it exists in Pinecone
    const missingChunks = [];
    let checkedCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    console.log(`Checking ${dbResult.rows.length} database records against Pinecone...`);

    for (const row of dbResult.rows) {
      try {
        checkedCount++;
        
        // Try to fetch the vector from Pinecone
        const fetchResult = await index.fetch([row.pinecone_vector_id], { 
          namespace: namespace 
        });
        
        if (fetchResult.vectors && fetchResult.vectors[row.pinecone_vector_id]) {
          existingCount++;
          console.log(`✓ Vector ${row.pinecone_vector_id} exists in Pinecone`);
        } else {
          // Vector is missing from Pinecone
          console.log(`✗ Vector ${row.pinecone_vector_id} missing from Pinecone`);
          missingChunks.push({
            vectorId: row.pinecone_vector_id,
            title: row.title || 'No title',
            text: row.text ? (row.text.substring(0, 200) + '...') : 'No text',
            userId: row.user_id,
            dbId: row.db_id,
            createdAt: row.created_at
          });
        }

        // Add a small delay to avoid rate limiting
        if (checkedCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
          console.log(`Checked ${checkedCount}/${dbResult.rows.length} vectors...`);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`Error checking vector ${row.pinecone_vector_id}:`, error.message);
        
        // If it's a 404-type error, consider it missing
        if (error.message.includes('not found') || error.message.includes('404')) {
          missingChunks.push({
            vectorId: row.pinecone_vector_id,
            title: row.title || 'No title',
            text: row.text ? (row.text.substring(0, 200) + '...') : 'No text',
            userId: row.user_id,
            dbId: row.db_id,
            createdAt: row.created_at,
            error: 'Vector not found in Pinecone'
          });
        }
      }
    }
    
    console.log(`Check complete: ${existingCount} found, ${missingChunks.length} missing, ${errorCount} errors`);
    
    // Format the results
    const result = {
      summary: {
        databaseChunks: dbResult.rows.length,
        checkedVectors: checkedCount,
        existingInPinecone: existingCount,
        missingFromPinecone: missingChunks.length,
        errors: errorCount
      },
      missingChunks: missingChunks,
      note: `This check verifies that database records exist as vectors in Pinecone. It does not detect extra vectors in Pinecone that aren't in the database.`
    };
    
    return result;
    
  } catch (error) {
    console.error('Error in checkMissingChunks:', error);
    throw error;
  }
}

// Function to get all available indexes for a user
export async function getUserIndexes(userId) {
  try {
    const userResult = await pool.query('SELECT pinecone_indexes FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    let pineconeIndexes = userResult.rows[0].pinecone_indexes;
    if (typeof pineconeIndexes === 'string') {
      pineconeIndexes = JSON.parse(pineconeIndexes);
    }
    
    return Array.isArray(pineconeIndexes) ? pineconeIndexes : [];
  } catch (error) {
    console.error('Error getting user indexes:', error);
    throw error;
  }
}