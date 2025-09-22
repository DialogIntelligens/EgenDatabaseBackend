import {
  createPineconeDataController,
  updatePineconeDataController,
  getPineconeDataController,
  deletePineconeDataController,
  markPineconeDataViewedController
} from '../controllers/pineconeController.js';

/**
 * Register all Pinecone-related routes
 */
export function registerPineconeRoutes(app, pool, authenticateToken) {
  // POST create Pinecone data
  app.post('/pinecone-data', authenticateToken, (req, res) => createPineconeDataController(req, res, pool));

  // PUT update Pinecone data
  app.put('/pinecone-data-update/:id', authenticateToken, (req, res) => updatePineconeDataController(req, res, pool));

  // GET Pinecone data
  app.get('/pinecone-data', authenticateToken, (req, res) => getPineconeDataController(req, res, pool));

  // DELETE Pinecone data
  app.delete('/pinecone-data/:id', authenticateToken, (req, res) => deletePineconeDataController(req, res, pool));

  // POST mark Pinecone data as viewed
  app.post('/pinecone-data/:data_id/mark-viewed', authenticateToken, (req, res) => markPineconeDataViewedController(req, res, pool));
}
