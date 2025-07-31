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

// Function to get all vectors from a Pinecone index
async function getAllVectorsFromIndex(pineconeClient, indexName, namespace, debugInfo = []) {
  try {
    debugInfo.push(`🔄 Starting getAllVectorsFromIndex - indexName: ${indexName}, namespace: ${namespace}`);
    debugInfo.push('📝 Note: In this system, "namespace" parameter is actually the Pinecone index name');
    
    // In your system, "namespace" is actually the Pinecone index name
    // We connect to that index and then operations like listPaginated() work on that index directly
    const index = pineconeClient.index(namespace);
    
    // Test the connection first
    debugInfo.push('🔗 Testing index connection...');
    const indexStats = await index.describeIndexStats();
    debugInfo.push(`📊 Index stats: ${JSON.stringify(indexStats, null, 2)}`);
    
    const allVectors = [];
    let paginationToken = undefined;
    let pageCount = 0;
    
    debugInfo.push(`🔍 Fetching vectors from index: ${indexName}, namespace: ${namespace}`);
    
    do {
      pageCount++;
      debugInfo.push(`📄 Processing page ${pageCount}...`);
      
      try {
        const listParams = {
          limit: 100,
          namespace: "",  // Use empty string for default namespace
          ...(paginationToken && { paginationToken })
        };
        
        debugInfo.push(`📞 Calling listPaginated with params: ${JSON.stringify(listParams)}`);
        const listResponse = await index.listPaginated(listParams);
        
        debugInfo.push(`📨 List response received: ${JSON.stringify({
          vectorCount: listResponse.vectors?.length || 0,
          hasPagination: !!listResponse.pagination
        })}`);
        
        if (listResponse.vectors && listResponse.vectors.length > 0) {
          // Fetch full vector data including metadata
          const vectorIds = listResponse.vectors.map(v => v.id);
          debugInfo.push(`📦 Fetching metadata for ${vectorIds.length} vectors...`);
          
          // Use empty string for default namespace (where the vectors actually are)
          const fetchParams = { namespace: "" };
          debugInfo.push(`📞 Calling fetch with params: ${JSON.stringify({ vectorCount: vectorIds.length, ...fetchParams })}`);
          const fetchResponse = await index.fetch(vectorIds, fetchParams);
          
          debugInfo.push(`📨 Fetch response received for ${Object.keys(fetchResponse.vectors || {}).length} vectors`);
          
          Object.values(fetchResponse.vectors || {}).forEach(vector => {
            if (vector) {
              allVectors.push({
                id: vector.id,
                metadata: vector.metadata || {}
              });
            }
          });
        }
        
        paginationToken = listResponse.pagination?.next;
        debugInfo.push(`✅ Page ${pageCount} complete. Total vectors: ${allVectors.length}, Next token: ${paginationToken ? 'exists' : 'none'}`);
        
      } catch (pageError) {
        debugInfo.push(`❌ Error processing page ${pageCount}: ${pageError.message}`);
        throw pageError;
      }
      
    } while (paginationToken);
    
    debugInfo.push(`🎉 getAllVectorsFromIndex complete: ${allVectors.length} total vectors fetched across ${pageCount} pages`);
    return allVectors;
    
  } catch (error) {
    console.error('Error in getAllVectorsFromIndex:', {
      message: error.message,
      stack: error.stack,
      indexName,
      namespace
    });
    throw error;
  }
}

// Main function to check for missing chunks - finds vectors in Pinecone that aren't in database
export async function checkMissingChunks(userId, indexName, namespace) {
  const debugInfo = [];
  
  try {
    debugInfo.push(`🚀 Starting Pinecone-to-database check - User: ${userId}, Index: ${indexName}, Namespace: ${namespace}`);
    
    // Get Pinecone API key
    debugInfo.push('🔑 Getting Pinecone API key...');
    const pineconeApiKey = await getPineconeApiKeyForIndex(userId, indexName, namespace);
    debugInfo.push('✅ Pinecone API key retrieved successfully');
    
    // Initialize Pinecone client
    debugInfo.push('🔧 Initializing Pinecone client...');
    const pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
    debugInfo.push('✅ Pinecone client initialized successfully');
    
    // Get all vectors from Pinecone
    debugInfo.push('📥 Fetching all vectors from Pinecone...');
    const allPineconeVectors = await getAllVectorsFromIndex(pineconeClient, indexName, namespace, debugInfo);
    debugInfo.push(`✅ Successfully fetched ${allPineconeVectors.length} vectors from Pinecone`);
    
    // Use all vectors (no filtering)
    debugInfo.push(`📊 Found ${allPineconeVectors.length} total vectors in Pinecone`);
    
    // Get all chunks from our database for this index/namespace
    debugInfo.push('🗄️ Querying database for existing chunks...');
    const dbResult = await pool.query(
      `SELECT pinecone_vector_id, title, text, user_id, id as db_id, created_at
       FROM pinecone_data 
       WHERE pinecone_index_name = $1 AND namespace = $2`,
      [indexName, namespace]
    );
    
    const dbVectorIds = new Set(dbResult.rows.map(row => row.pinecone_vector_id));
    debugInfo.push(`📈 Found ${dbResult.rows.length} chunks in database`);
    
    // Find vectors that exist in Pinecone but not in our database
    debugInfo.push('🔍 Comparing Pinecone vectors with database records...');
    const missingChunks = allPineconeVectors.filter(vector => {
      const isInDatabase = dbVectorIds.has(vector.id);
      if (!isInDatabase) {
        debugInfo.push(`🚨 Found missing chunk: ${vector.id} - ${vector.metadata.title || 'No title'}`);
      }
      return !isInDatabase;
    });
    
    debugInfo.push(`📊 Found ${missingChunks.length} vectors in Pinecone that are missing from database`);
    
    // Format the results
    debugInfo.push('📋 Formatting results...');
    const result = {
      summary: {
        totalPineconeVectors: allPineconeVectors.length,
        databaseChunks: dbResult.rows.length,
        missingFromDatabase: missingChunks.length
      },
      missingChunks: missingChunks.map(vector => ({
        vectorId: vector.id,
        title: vector.metadata.title || 'No title',
        text: vector.metadata.text ? (vector.metadata.text.substring(0, 200) + '...') : 'No text',
        userId: vector.metadata.userId,
        group: vector.metadata.group || 'No group',
        metadata: vector.metadata
      })),
      note: `This check finds all vectors that exist in Pinecone but are missing from your database.`,
      debugInfo: debugInfo
    };
    
    debugInfo.push('✅ checkMissingChunks completed successfully');
    return result;
    
  } catch (error) {
    debugInfo.push(`❌ Error in checkMissingChunks: ${error.message}`);
    console.error('Error in checkMissingChunks:', {
      message: error.message,
      stack: error.stack,
      userId,
      indexName,
      namespace
    });
    
    // Return error with debug info
    return {
      error: error.message,
      debugInfo: debugInfo
    };
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