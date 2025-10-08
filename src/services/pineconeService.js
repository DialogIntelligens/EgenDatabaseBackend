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
  const { title, text, indexName, namespace, expirationTime, group, scheduleTime, isScheduled } = body;
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

  // Convert scheduleTime -> Date or set null
  let scheduledDateTime = null;
  if (isScheduled && scheduleTime) {
    scheduledDateTime = new Date(scheduleTime);
    if (isNaN(scheduledDateTime.getTime())) {
      throw new Error('Invalid scheduleTime format');
    }
  }
  
  // Only generate embedding and store in Pinecone if not scheduled
  let vectorId = null;
  if (!isScheduled) {
    // Fetch Pinecone API key for this user/index/namespace
    const pineconeApiKey = await getPineconeApiKeyForIndex(pool, targetUserId, indexName, namespace);

    // Generate embedding using the utility function
    const embedding = await generateEmbedding(text);

    // Initialize Pinecone using the utility function
    const pineconeClient = initializePineconeClient(pineconeApiKey);
    const index = pineconeClient.index(namespace);

    // Create unique vector ID using the utility function
    vectorId = createVectorId();

    // Prepare vector metadata using the utility function
    const vectorMetadata = prepareVectorMetadata(targetUserId, text, title, group);

    // Prepare vector
    const vector = {
      id: vectorId,
      values: embedding,
      metadata: vectorMetadata
    };

    // Upsert into Pinecone
    await index.upsert([vector], { namespace });
  }

  // Convert expirationTime to a Date if provided
  let expirationDateTime = null;
  if (expirationTime) {
    expirationDateTime = new Date(expirationTime);
    if (isNaN(expirationDateTime.getTime())) {
      throw new Error('Invalid expirationTime format');
    }
  }

  const metadata = prepareDatabaseMetadata(group);

  try {
    // Try with metadata column
    const result = await pool.query(
      `INSERT INTO pinecone_data
        (user_id, title, text, pinecone_vector_id, pinecone_index_name, namespace, expiration_time, scheduled_time, is_scheduled, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [targetUserId, title, text, vectorId, indexName, namespace, expirationDateTime, scheduledDateTime, isScheduled, JSON.stringify(metadata)]
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
        (user_id, title, text, pinecone_vector_id, pinecone_index_name, namespace, expiration_time, scheduled_time, is_scheduled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [targetUserId, title, text, vectorId, indexName, namespace, expirationDateTime, scheduledDateTime, isScheduled]
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
  const { title, text, group, scheduleTime, isScheduled } = body;
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

  const { 
    pinecone_vector_id, 
    pinecone_index_name, 
    namespace, 
    user_id: dataOwnerId, 
    metadata: existingMetadata, 
    is_scheduled: currentlyScheduled,
    scheduled_time: existingScheduledTime 
  } = dataResult.rows[0];

  // Determine scheduling behavior:
  // If isScheduled is provided (explicitly true or false), use it
  // Otherwise, preserve the existing value
  let finalIsScheduled = currentlyScheduled;
  let finalScheduledTime = existingScheduledTime;
  
  if (isScheduled !== undefined) {
    finalIsScheduled = isScheduled;
    
    if (isScheduled && scheduleTime) {
      // User wants to schedule or update schedule time
      finalScheduledTime = new Date(scheduleTime);
      if (isNaN(finalScheduledTime.getTime())) {
        throw new Error('Invalid scheduleTime format');
      }
    } else if (!isScheduled) {
      // User wants immediate upload, clear schedule
      finalScheduledTime = null;
    }
  }
  // If isScheduled is undefined, keep existing scheduled_time as-is

  // Parse existing metadata or create new object
  let metadata = parseExistingMetadata(existingMetadata);
  
  // Update group info in metadata
  if (group !== undefined) {
    metadata.group = group;
  }

  // Handle Pinecone operations based on scheduling status changes
  if (!finalIsScheduled && isScheduled !== undefined) {
    // User wants immediate upload (explicitly changed to non-scheduled)
    if (pinecone_vector_id) {
      // Update existing vector in Pinecone
      const pineconeApiKey = await getPineconeApiKeyForIndex(pool, dataOwnerId, pinecone_index_name, namespace);
      const embedding = await generateEmbedding(text);
      const vectorMetadata = prepareVectorMetadata(dataOwnerId, text, title, group !== undefined ? group : metadata.group);

      const pineconeClient = initializePineconeClient(pineconeApiKey);
      const index = pineconeClient.index(namespace);
      
      await index.upsert([
        {
          id: pinecone_vector_id,
          values: embedding,
          metadata: vectorMetadata
        },
      ], { namespace });
    } else {
      // This was a scheduled upload, now make it immediate - create new vector
      const pineconeApiKey = await getPineconeApiKeyForIndex(pool, dataOwnerId, pinecone_index_name, namespace);
      const embedding = await generateEmbedding(text);
      const vectorMetadata = prepareVectorMetadata(dataOwnerId, text, title, group !== undefined ? group : metadata.group);
      
      const pineconeClient = initializePineconeClient(pineconeApiKey);
      const index = pineconeClient.index(namespace);
      const vectorId = createVectorId();
      
      await index.upsert([
        {
          id: vectorId,
          values: embedding,
          metadata: vectorMetadata
        },
      ], { namespace });
      
      // Update with the new vector ID
      await pool.query(
        'UPDATE pinecone_data SET pinecone_vector_id = $1 WHERE id = $2',
        [vectorId, id]
      );
    }
  } else if (finalIsScheduled && !currentlyScheduled && isScheduled !== undefined) {
    // User wants to schedule an existing immediate upload - delete from Pinecone
    if (pinecone_vector_id) {
      const pineconeApiKey = await getPineconeApiKeyForIndex(pool, dataOwnerId, pinecone_index_name, namespace);
      const pineconeClient = initializePineconeClient(pineconeApiKey);
      const index = pineconeClient.index(namespace);
      
      await index.deleteOne(pinecone_vector_id, { namespace: namespace });
      
      // Clear the vector ID since it's now scheduled
      await pool.query(
        'UPDATE pinecone_data SET pinecone_vector_id = NULL WHERE id = $1',
        [id]
      );
    }
  } else if (!finalIsScheduled && pinecone_vector_id && isScheduled === undefined) {
    // Content update for existing non-scheduled upload (e.g., from AIHelp)
    // Update the vector in Pinecone with new content
    const pineconeApiKey = await getPineconeApiKeyForIndex(pool, dataOwnerId, pinecone_index_name, namespace);
    const embedding = await generateEmbedding(text);
    const vectorMetadata = prepareVectorMetadata(dataOwnerId, text, title, group !== undefined ? group : metadata.group);

    const pineconeClient = initializePineconeClient(pineconeApiKey);
    const index = pineconeClient.index(namespace);
    
    await index.upsert([
      {
        id: pinecone_vector_id,
        values: embedding,
        metadata: vectorMetadata
      },
    ], { namespace });
  }
  // If finalIsScheduled && !pinecone_vector_id, it's already/still scheduled - no Pinecone operation needed

  try {
    // Try to update with metadata and scheduling fields
    const result = await pool.query(
      'UPDATE pinecone_data SET title = $1, text = $2, metadata = $3, scheduled_time = $4, is_scheduled = $5 WHERE id = $6 RETURNING *',
      [title, text, JSON.stringify(metadata), finalScheduledTime, finalIsScheduled, id]
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
      'UPDATE pinecone_data SET title = $1, text = $2, scheduled_time = $3, is_scheduled = $4 WHERE id = $5 RETURNING *',
      [title, text, finalScheduledTime, finalIsScheduled, id]
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
  const { userId: queryUserId } = query;
  const userId = user.userId;
  const isAdmin = user.isAdmin === true;

  // For admin users, allow filtering by userId
  const targetUserId = (isAdmin && queryUserId) ? parseInt(queryUserId) : userId;

  // Retrieve data entries
  const dataResult = await pool.query(
    `SELECT pd.*, pdv.has_viewed 
     FROM pinecone_data pd
     LEFT JOIN (
       SELECT pinecone_data_id, TRUE as has_viewed 
       FROM pinecone_data_views 
       WHERE user_id = $1
     ) pdv ON pd.id = pdv.pinecone_data_id
     WHERE pd.user_id = $2
     ORDER BY pd.id DESC`,
    [userId, targetUserId]
  );

  return formatPineconeDataResponse(dataResult.rows);
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
  
  // Retrieve existing record - for admins or based on namespace access
  const queryText = isAdmin 
    ? 'SELECT * FROM pinecone_data WHERE id = $1'
    : 'SELECT * FROM pinecone_data WHERE id = $1 AND namespace = ANY($2)';
  
  const queryParams = isAdmin ? [id] : [id, userNamespaces];
  
  const dataResult = await pool.query(queryText, queryParams);
  
  if (dataResult.rows.length === 0) {
    throw new Error('Data not found or you do not have permission to delete it. Ensure you have access to the namespace.');
  }

  const { pinecone_vector_id, pinecone_index_name, namespace, user_id: dataOwnerId } = dataResult.rows[0];

  if (pinecone_vector_id) {
    // Get API key and initialize Pinecone
    const pineconeApiKey = await getPineconeApiKeyForIndex(pool, dataOwnerId, pinecone_index_name, namespace);
    const pineconeClient = initializePineconeClient(pineconeApiKey);
    const index = pineconeClient.index(namespace);

    // Delete from Pinecone
    await index.deleteOne(pinecone_vector_id, { namespace: namespace });
  }

  // Delete from database
  await pool.query('DELETE FROM pinecone_data WHERE id = $1', [id]);

  return { message: 'Data deleted successfully from database and Pinecone' };
}

/**
 * Mark Pinecone data as viewed
 */
export async function markPineconeDataViewedService(data_id, user, pool) {
  const userId = user.userId;

  // Insert or update the view record
  await pool.query(
    `INSERT INTO pinecone_data_views (user_id, pinecone_data_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, pinecone_data_id) DO NOTHING`,
    [userId, data_id]
  );

  return { message: 'Data marked as viewed successfully' };
}