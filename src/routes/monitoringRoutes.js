/**
 * Monitoring Routes
 * Phase 4 monitoring endpoints for conversation processing system
 */

export function registerMonitoringRoutes(app, pool, authenticateToken) {
  /**
   * Get conversation processing health status
   */
  app.get('/api/monitoring/conversation-health', async (req, res) => {
    try {
      // Check database connectivity
      await pool.query('SELECT 1');
      
      // Get active sessions count
      const sessionsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recent_sessions
        FROM conversation_sessions
      `);
      
      // Get streaming sessions count
      const streamingResult = await pool.query(`
        SELECT 
          COUNT(*) as total_streaming,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_streaming,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_streaming,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_streaming
        FROM streaming_sessions
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);

      // Get performance metrics
      const performanceResult = await pool.query(`
        SELECT 
          AVG(total_processing_time_ms) as avg_processing_time,
          AVG(time_to_first_token_ms) as avg_time_to_first_token,
          AVG(tokens_per_second) as avg_tokens_per_second,
          COUNT(*) as total_conversations
        FROM conversation_processing_metrics
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);

      // Get error statistics
      const errorResult = await pool.query(`
        SELECT 
          error_category,
          COUNT(*) as error_count
        FROM error_logs
        WHERE created_at > NOW() - INTERVAL '1 hour'
        GROUP BY error_category
        ORDER BY error_count DESC
      `);

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        sessions: sessionsResult.rows[0],
        streaming: streamingResult.rows[0],
        performance: performanceResult.rows[0],
        errors: errorResult.rows,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      };

      res.json(health);
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get connection pool statistics
   */
  app.get('/api/monitoring/connection-pools', async (req, res) => {
    try {
      const { getAllPoolStats } = await import('../utils/connectionPoolUtils.js');
      const stats = getAllPoolStats();
      
      res.json({
        success: true,
        pools: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting pool stats:', error);
      res.status(500).json({
        error: 'Failed to get connection pool statistics',
        details: error.message
      });
    }
  });

  /**
   * Get cache statistics
   */
  app.get('/api/monitoring/cache-stats', async (req, res) => {
    try {
      const { configurationCache, promptCache, templateCache } = await import('../utils/cacheUtils.js');
      
      const stats = {
        configuration: configurationCache.getStats(),
        prompts: promptCache.getStats(),
        templates: templateCache.getStats(),
        timestamp: new Date().toISOString()
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Error getting cache stats:', error);
      res.status(500).json({
        error: 'Failed to get cache statistics',
        details: error.message
      });
    }
  });

  /**
   * Clear all caches (admin only)
   */
  app.post('/api/monitoring/clear-cache', authenticateToken, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { clearAllCaches } = await import('../utils/cacheUtils.js');
      clearAllCaches();
      
      res.json({
        success: true,
        message: 'All caches cleared',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error clearing caches:', error);
      res.status(500).json({
        error: 'Failed to clear caches',
        details: error.message
      });
    }
  });

  /**
   * Get conversation processing metrics
   */
  app.get('/api/monitoring/processing-metrics', authenticateToken, async (req, res) => {
    try {
      const { timeframe = '24h' } = req.query;
      
      let interval;
      switch (timeframe) {
        case '1h': interval = '1 hour'; break;
        case '24h': interval = '24 hours'; break;
        case '7d': interval = '7 days'; break;
        default: interval = '24 hours';
      }

      const metricsResult = await pool.query(`
        SELECT 
          chatbot_id,
          flow_type,
          COUNT(*) as conversation_count,
          AVG(total_processing_time_ms) as avg_processing_time,
          AVG(time_to_first_token_ms) as avg_time_to_first_token,
          AVG(tokens_per_second) as avg_tokens_per_second,
          COUNT(CASE WHEN parallel_execution THEN 1 END) as parallel_executions,
          MIN(created_at) as first_conversation,
          MAX(created_at) as last_conversation
        FROM conversation_processing_metrics
        WHERE created_at > NOW() - INTERVAL '${interval}'
        GROUP BY chatbot_id, flow_type
        ORDER BY conversation_count DESC
      `);

      res.json({
        success: true,
        timeframe,
        metrics: metricsResult.rows,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting processing metrics:', error);
      res.status(500).json({
        error: 'Failed to get processing metrics',
        details: error.message
      });
    }
  });

  /**
   * Reset connection pool statistics (admin only)
   */
  app.post('/api/monitoring/reset-pool-stats', authenticateToken, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { resetAllPoolStats } = await import('../utils/connectionPoolUtils.js');
      resetAllPoolStats();
      
      res.json({
        success: true,
        message: 'Connection pool statistics reset',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error resetting pool stats:', error);
      res.status(500).json({
        error: 'Failed to reset pool statistics',
        details: error.message
      });
    }
  });
}
