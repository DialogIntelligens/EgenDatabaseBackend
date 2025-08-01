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
          
          debugInfo.push(`📞 Calling fetch with params: ${JSON.stringify({ vectorCount: vectorIds.length })}`);
          debugInfo.push(`📝 Sample vector IDs: ${vectorIds.slice(0, 3).join(', ')}`);
          const fetchResponse = await index.fetch(vectorIds);
          
          debugInfo.push(`📨 Fetch response received for ${Object.keys(fetchResponse.records || {}).length} vectors`);
          
          Object.values(fetchResponse.records || {}).forEach(vector => {
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

// Function to check all indexes for a user
export async function checkAllIndexesMissingChunks(userId) {
  const debugInfo = [];
  
  try {
    debugInfo.push(`🚀 Starting comprehensive check for all indexes - User: ${userId}`);
    
    // Get all indexes for the user
    debugInfo.push('📋 Fetching all user indexes...');
    const indexesResult = await pool.query(
      `SELECT DISTINCT pinecone_index_name as index_name, namespace 
       FROM pinecone_data 
       WHERE user_id = $1 
       ORDER BY pinecone_index_name, namespace`,
      [userId]
    );
    
    const indexes = indexesResult.rows;
    debugInfo.push(`✅ Found ${indexes.length} index/namespace combinations to check`);
    
    if (indexes.length === 0) {
      return {
        summary: {
          totalIndexes: 0,
          totalPineconeVectors: 0,
          totalScraperVectors: 0,
          totalNonScraperVectors: 0,
          totalDatabaseChunks: 0,
          totalMissingFromDatabase: 0
        },
        missingChunks: [],
        note: 'No indexes found for this user.',
        debugInfo: debugInfo
      };
    }
    
    const allResults = [];
    let totalPineconeVectors = 0;
    let totalScraperVectors = 0;
    let totalNonScraperVectors = 0;
    let totalDatabaseChunks = 0;
    let totalMissingFromDatabase = 0;
    
    // Check each index/namespace combination
    for (let i = 0; i < indexes.length; i++) {
      const { index_name, namespace } = indexes[i];
      debugInfo.push(`\n🔍 [${i + 1}/${indexes.length}] Checking index: ${index_name}, namespace: ${namespace}`);
      
      try {
        const result = await checkMissingChunks(userId, index_name, namespace);
        
        if (result.summary) {
          totalPineconeVectors += result.summary.totalPineconeVectors || 0;
          totalScraperVectors += result.summary.scraperVectors || 0;
          totalNonScraperVectors += result.summary.nonScraperVectors || 0;
          totalDatabaseChunks += result.summary.databaseChunks || 0;
          totalMissingFromDatabase += result.summary.missingFromDatabase || 0;
          
          // Add index info to missing chunks
          const missingChunksWithIndex = (result.missingChunks || []).map(chunk => ({
            ...chunk,
            indexName: index_name,
            namespace: namespace
          }));
          
          allResults.push(...missingChunksWithIndex);
          
          debugInfo.push(`✅ Index ${index_name}/${namespace}: ${result.summary.missingFromDatabase || 0} missing chunks`);
        }
        
      } catch (indexError) {
        debugInfo.push(`❌ Error checking index ${index_name}/${namespace}: ${indexError.message}`);
        // Continue with other indexes even if one fails
      }
    }
    
    debugInfo.push(`\n🎉 Comprehensive check complete!`);
    debugInfo.push(`📊 Total results: ${totalMissingFromDatabase} missing chunks across ${indexes.length} indexes`);
    
    return {
      summary: {
        totalIndexes: indexes.length,
        totalPineconeVectors,
        totalScraperVectors,
        totalNonScraperVectors,
        totalDatabaseChunks,
        totalMissingFromDatabase
      },
      missingChunks: allResults,
      note: `Comprehensive check across ${indexes.length} indexes. This operation checked ${totalNonScraperVectors} non-scraper vectors against your database.`,
      debugInfo: debugInfo
    };
    
  } catch (error) {
    debugInfo.push(`❌ Error in checkAllIndexesMissingChunks: ${error.message}`);
    console.error('Error in checkAllIndexesMissingChunks:', {
      message: error.message,
      stack: error.stack,
      userId
    });
    
    return {
      error: error.message,
      debugInfo: debugInfo
    };
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
        
        // Filter out scraper chunks - only keep vectors with userId (non-scraper chunks)
        debugInfo.push('🔍 Filtering out scraper chunks (keeping only vectors with userId)...');
        const nonScraperVectors = allPineconeVectors.filter(vector => {
          const hasUserId = vector.metadata && vector.metadata.userId;
          if (!hasUserId) {
            debugInfo.push(`🚮 Filtered out scraper chunk: ${vector.id} (no userId)`);
          }
          return hasUserId;
        });
        
        debugInfo.push(`📊 Found ${allPineconeVectors.length} total vectors in Pinecone`);
        debugInfo.push(`📊 Found ${nonScraperVectors.length} non-scraper vectors (with userId)`);
        debugInfo.push(`📊 Found ${allPineconeVectors.length - nonScraperVectors.length} scraper vectors (without userId) - these will be ignored`);
    
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
    
            // Find non-scraper vectors that exist in Pinecone but not in our database
        debugInfo.push('🔍 Comparing non-scraper Pinecone vectors with database records...');
        const missingChunks = nonScraperVectors.filter(vector => {
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
            scraperVectors: allPineconeVectors.length - nonScraperVectors.length,
            nonScraperVectors: nonScraperVectors.length,
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
                note: `This check finds non-scraper vectors (with userId) that exist in Pinecone but are missing from your database. Scraper vectors (without userId) are automatically ignored.`,
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