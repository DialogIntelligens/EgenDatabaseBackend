import {
  createPineconeDataService,
  updatePineconeDataService,
  getPineconeDataService,
  deletePineconeDataService,
  markPineconeDataViewedService
} from '../services/pineconeService.js';

/**
 * Create Pinecone data entry
 */
export async function createPineconeDataController(req, res, pool) {
  try {
    const result = await createPineconeDataService(req.body, req.user, pool);
    res.status(201).json(result);
  } catch (err) {
    console.error('Error upserting data:', err);
    if (err.message === 'Title, text, indexName, and namespace are required') {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === 'Target user not found') {
      return res.status(404).json({ error: err.message });
    }
    if (err.message === 'Invalid expirationTime format') {
      return res.status(400).json({ error: err.message });
    }
    if (err.message.includes('No Pinecone API key found')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error', details: err.message });
  }
}

/**
 * Update Pinecone data entry
 */
export async function updatePineconeDataController(req, res, pool) {
  const { id } = req.params;
  
  try {
    const result = await updatePineconeDataService(id, req.body, req.user, pool);
    res.json(result);
  } catch (err) {
    console.error('Error updating data:', err);
    if (err.message === 'Title and text are required') {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === 'User not found') {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('Data not found or you do not have permission')) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('No Pinecone API key found')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error', details: err.message });
  }
}

/**
 * Get Pinecone data entries
 */
export async function getPineconeDataController(req, res, pool) {
  try {
    const result = await getPineconeDataService(req.query, req.user, pool);
    res.json(result);
  } catch (err) {
    console.error('Error retrieving data:', err);
    if (err.message === 'Requested user not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error', details: err.message });
  }
}

/**
 * Delete Pinecone data entry
 */
export async function deletePineconeDataController(req, res, pool) {
  const { id } = req.params;
  
  try {
    const result = await deletePineconeDataService(id, req.user, pool);
    res.json(result);
  } catch (err) {
    console.error('Error deleting data:', err);
    if (err.message === 'User not found') {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('Data not found or you do not have permission')) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('No Pinecone API key found')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error', details: err.message });
  }
}

/**
 * Mark Pinecone data as viewed
 */
export async function markPineconeDataViewedController(req, res, pool) {
  const { data_id } = req.params;
  const userId = req.user.userId;

  try {
    const result = await markPineconeDataViewedService(data_id, userId, pool);
    res.status(200).json(result);
  } catch (err) {
    console.error('Error marking data as viewed:', err);
    if (err.message === 'data_id is required') {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === 'Pinecone data not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error', details: err.message });
  }
}
