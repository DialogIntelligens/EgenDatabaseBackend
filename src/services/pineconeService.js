import {
  generateEmbedding,
  getPineconeApiKeyForIndex,
  initializePineconeClient,
  createVectorId,
  prepareVectorMetadata,
  extractUserNamespaces,
  prepareDatabaseMetadata,
  parseExistingMetadata,
  formatPineconeDataResponse
} from '../utils/pineconeUtils.js';

/**
 * Create Pinecone data entry
 */
export async function createPineconeDataService(body, user, pool) {
  const { title, text, indexName, namespace, expirationTime, group } = body;
  const authenticatedUserId = user.userId;
  
  // Check if user is admin and if a userId parameter was provided
  const isAdmin = user.isAdmin === true;
  const targetUserId = isAdmin && body.userId ? parseInt(body.userId) : authenticatedUserId;

  if (!title || !text || !indexName || !namespace) {
    throw new Error('Title, text, indexName, and namespace are required');
  }

  // If admin is creating data for another user, verify the user exists
  if (isAdmin && targetUserId !== authenticatedUserId) {
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
    if (userCheck.rows.length === 0) {
      throw new Error('Target user not found');
    }
  }
  
  // Get the appropriate Pinecone API key for this index
  const pineconeApiKey = await getPineconeApiKeyForIndex(pool, targetUserId, indexName, namespace);
  
  // Generate embedding
  const embedding = await generateEmbedding(text);

  // Initialize Pinecone
  const pineconeClient = initializePineconeClient(pineconeApiKey);
  const index = pineconeClient.index(namespace);

  // Create unique vector ID
  const vectorId = createVectorId();

  // Prepare vector metadata
  const vectorMetadata = prepareVectorMetadata(targetUserId, text, title, group);

  // Prepare vector
  const vector = {
    id: vectorId,
    values: embedding,
    metadata: vectorMetadata
  };

  // Upsert into Pinecone
  await index.upsert([vector], { namespace });

  // Convert expirationTime -> Date or set null
  let expirationDateTime = null;
  if (expirationTime) {
    expirationDateTime = new Date(expirationTime);
    if (isNaN(expirationDateTime.getTime())) {
      throw new Error('Invalid expirationTime format');
    }
  }

  // Add group to the metadata field in the database
  const metadata = prepareDatabaseMetadata(group);

  try {
    // Try with metadata column
    const result = await pool.query(
      `INSERT INTO pinecone_data 
        (user_id, title, text, pinecone_vector_id, pinecone_index_name, namespace, expiration_time, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [targetUserId, title, text, vectorId, indexName, namespace, expirationDateTime, JSON.stringify(metadata)]
    );
    
    // Mark as viewed by the uploader
    const newPineconeDataId = result.rows[0].id;
    await pool.query(
      `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
      [targetUserId, newPineconeDataId]
    );
    
    return result.rows[0];
  } catch (dbError) {
    // If metadata column doesn't exist, try without it
    console.error('Error with metadata column, trying without it:', dbError);
    const fallbackResult = await pool.query(
      `INSERT INTO pinecone_data 
        (user_id, title, text, pinecone_vector_id, pinecone_index_name, namespace, expiration_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [targetUserId, title, text, vectorId, indexName, namespace, expirationDateTime]
    );
    
    // Mark as viewed by the uploader (fallback)
    const newPineconeDataIdFallback = fallbackResult.rows[0].id;
    await pool.query(
      `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
      [targetUserId, newPineconeDataIdFallback]
    );
    
    return fallbackResult.rows[0];
  }
}

/**
 * Update Pinecone data entry
 */
export async function updatePineconeDataService(id, body, user, pool) {
  const { title, text, group } = body;
  const userId = user.userId;
  const isAdmin = user.isAdmin === true;

  if (!title || !text) {
    throw new Error('Title and text are required');
  }

  // Get the user's namespaces from their profile
  const userResult = await pool.query('SELECT pinecone_indexes FROM users WHERE id = $1', [userId]);
  
  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }
  
  // Extract namespaces from the user's pinecone_indexes
  const userNamespaces = extractUserNamespaces(userResult.rows[0].pinecone_indexes);
  
  // Retrieve existing record - for admins or based on namespace access
  const queryText = isAdmin 
    ? 'SELECT * FROM pinecone_data WHERE id = $1'
    : 'SELECT * FROM pinecone_data WHERE id = $1 AND namespace = ANY($2)';
  
  const queryParams = isAdmin ? [id] : [id, userNamespaces];
  
  const dataResult = await pool.query(queryText, queryParams);
  
  if (dataResult.rows.length === 0) {
    throw new Error('Data not found or you do not have permission to modify it. Ensure you have access to the namespace.');
  }

  const { pinecone_vector_id, pinecone_index_name, namespace, user_id: dataOwnerId, metadata: existingMetadata } = dataResult.rows[0];

  // Get the appropriate Pinecone API key for this index
  const pineconeApiKey = await getPineconeApiKeyForIndex(pool, dataOwnerId, pinecone_index_name, namespace);
  
  // Generate new embedding
  const embedding = await generateEmbedding(text);
  
  // Parse existing metadata or create new object
  let metadata = parseExistingMetadata(existingMetadata);
  
  // Update group info in metadata
  if (group !== undefined) {
    metadata.group = group;
  }

  // Prepare vector metadata
  const vectorMetadata = prepareVectorMetadata(dataOwnerId, text, title, group !== undefined ? group : metadata.group);

  // Update in Pinecone
  const pineconeClient = initializePineconeClient(pineconeApiKey);
  const index = pineconeClient.index(namespace);
  
  await index.upsert([
    {
      id: pinecone_vector_id,
      values: embedding,
      metadata: vectorMetadata
    },
  ], { namespace });

  try {
    // Try to update with metadata
    const result = await pool.query(
      'UPDATE pinecone_data SET title = $1, text = $2, metadata = $3 WHERE id = $4 RETURNING *',
      [title, text, JSON.stringify(metadata), id]
    );

    // Reset viewed status for all users for this chunk, then mark as viewed for the updater
    const updatedPineconeDataId = result.rows[0].id;
    await pool.query('DELETE FROM pinecone_data_views WHERE pinecone_data_id = $1', [updatedPineconeDataId]);
    await pool.query(
      `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
      [userId, updatedPineconeDataId]
    );

    return result.rows[0];
  } catch (dbError) {
    // If metadata column doesn't exist, try without it
    console.error('Error with metadata column, trying without it:', dbError);
    const fallbackResult = await pool.query(
      'UPDATE pinecone_data SET title = $1, text = $2 WHERE id = $3 RETURNING *',
      [title, text, id]
    );

    // Reset viewed status for all users (fallback), then mark as viewed for the updater
    const updatedPineconeDataIdFallback = fallbackResult.rows[0].id;
    await pool.query('DELETE FROM pinecone_data_views WHERE pinecone_data_id = $1', [updatedPineconeDataIdFallback]);
    await pool.query(
      `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
      [userId, updatedPineconeDataIdFallback]
    );

    return fallbackResult.rows[0];
  }
}

/**
 * Get Pinecone data entries
 */
export async function getPineconeDataService(query, user, pool) {
  // Get the authenticated user's ID
  const authenticatedUserId = user.userId;
  
  // Check if user is admin and if a userId parameter was provided
  const isAdmin = user.isAdmin === true;
  const requestedUserId = isAdmin && query.userId ? parseInt(query.userId) : authenticatedUserId;
  
  // Get the user record to extract their associated namespaces
  const userQuery = isAdmin && requestedUserId !== authenticatedUserId
    ? 'SELECT id, pinecone_indexes FROM users WHERE id = $1'
    : 'SELECT id, pinecone_indexes FROM users WHERE id = $1';
  
  const userResult = await pool.query(userQuery, [requestedUserId]);
  
  if (userResult.rows.length === 0) {
    throw new Error('Requested user not found');
  }
  
  // Extract namespaces from the user's pinecone_indexes
  const userNamespaces = extractUserNamespaces(userResult.rows[0].pinecone_indexes);
  
  if (userNamespaces.length === 0) {
    // If no namespaces found, return empty array
    return [];
  }
  
  // Query pinecone_data where namespace matches any of the user's namespaces
  // Also, join with pinecone_data_views to check if the authenticated user has viewed the data
  const result = await pool.query(
    `SELECT 
       pd.*, 
       CASE WHEN pdv.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_viewed
     FROM pinecone_data pd
     LEFT JOIN pinecone_data_views pdv ON pd.id = pdv.pinecone_data_id AND pdv.user_id = $1
     WHERE pd.namespace = ANY($2) 
     ORDER BY pd.created_at DESC`,
    [authenticatedUserId, userNamespaces] // Use authenticatedUserId for the view check
  );
  
  return formatPineconeDataResponse(result.rows);
}

/**
 * Delete Pinecone data entry
 */
export async function deletePineconeDataService(id, user, pool) {
  const userId = user.userId;
  const isAdmin = user.isAdmin === true;

  // Get the user's namespaces from their profile
  const userResult = await pool.query('SELECT pinecone_indexes FROM users WHERE id = $1', [userId]);
  
  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }
  
  // Extract namespaces from the user's pinecone_indexes
  const userNamespaces = extractUserNamespaces(userResult.rows[0].pinecone_indexes);

  // Retrieve the record - for admins or based on namespace access
  const queryText = isAdmin 
    ? 'SELECT pinecone_vector_id, pinecone_index_name, namespace, user_id FROM pinecone_data WHERE id = $1'
    : 'SELECT pinecone_vector_id, pinecone_index_name, namespace, user_id FROM pinecone_data WHERE id = $1 AND namespace = ANY($2)';
  
  const queryParams = isAdmin ? [id] : [id, userNamespaces];
  
  const dataResult = await pool.query(queryText, queryParams);
  
  if (dataResult.rows.length === 0) {
    throw new Error('Data not found or you do not have permission to delete it. Ensure you have access to the namespace.');
  }

  const { pinecone_vector_id, pinecone_index_name, namespace, user_id: dataOwnerId } = dataResult.rows[0];

  // Get the appropriate Pinecone API key for this index
  const pineconeApiKey = await getPineconeApiKeyForIndex(pool, dataOwnerId, pinecone_index_name, namespace);
  
  // Delete from Pinecone
  const pineconeClient = initializePineconeClient(pineconeApiKey);
  const index = pineconeClient.index(namespace);
  await index.deleteOne(pinecone_vector_id, { namespace: namespace });

  // Delete from DB
  await pool.query('DELETE FROM pinecone_data WHERE id = $1', [id]);

  return { message: 'Data deleted successfully' };
}

/**
 * Mark Pinecone data as viewed
 */
export async function markPineconeDataViewedService(dataId, userId, pool) {
  if (!dataId) {
    throw new Error('data_id is required');
  }

  // Check if the pinecone_data entry exists
  const dataCheck = await pool.query('SELECT id FROM pinecone_data WHERE id = $1', [dataId]);
  if (dataCheck.rows.length === 0) {
    throw new Error('Pinecone data not found');
  }

  // Insert a record into pinecone_data_views, or do nothing if it already exists
  await pool.query(
    `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
    [userId, dataId]
  );

  return { message: 'Data marked as viewed successfully' };
}
