import { searchMagentoOrdersService, getMagentoOrderByIdService } from '../services/magentoService.js';

/**
 * Search for Magento orders
 */
export async function searchMagentoOrdersController(req, res, pool) {
  try {
    const result = await searchMagentoOrdersService(req.body, pool);
    res.json(result);
  } catch (error) {
    console.error('Error fetching Magento orders:', error);
    
    // Determine appropriate status code based on error type
    let statusCode = 500;
    if (error.message.includes('credentials not available')) {
      statusCode = 400;
    } else if (error.message.includes('Magento API error')) {
      // Extract status code from Magento API error if available
      const statusMatch = error.message.match(/Magento API error: (\d+)/);
      if (statusMatch) {
        statusCode = parseInt(statusMatch[1]);
      }
    }
    
    res.status(statusCode).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Get specific Magento order by ID
 */
export async function getMagentoOrderByIdController(req, res) {
  try {
    const result = await getMagentoOrderByIdService(req.params, req.query);
    res.json(result);
  } catch (error) {
    console.error('Error fetching Magento order:', error);
    
    // Determine appropriate status code based on error type
    let statusCode = 500;
    if (error.message.includes('required')) {
      statusCode = 400;
    } else if (error.message.includes('Magento API error')) {
      // Extract status code from Magento API error if available
      const statusMatch = error.message.match(/Magento API error: (\d+)/);
      if (statusMatch) {
        statusCode = parseInt(statusMatch[1]);
      }
    }
    
    res.status(statusCode).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
