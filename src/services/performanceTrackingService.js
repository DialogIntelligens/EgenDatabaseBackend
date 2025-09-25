/**
 * Performance Tracking Service
 * Handles performance monitoring and metrics collection
 * Migrated from frontend performance tracking logic
 */
export class PerformanceTrackingService {
  constructor(pool) {
    this.pool = pool;
    this.activeTrackers = new Map();
  }

  /**
   * Start performance tracking for a conversation session
   * Migrated from frontend createPerfTracker logic
   */
  startTracking(sessionId, label = 'conversation') {
    const tracker = {
      sessionId,
      label,
      startTime: performance.now(),
      phases: [],
      tokenCount: 0,
      firstTokenTime: null,
      lastTokenTime: null,
      openPhases: new Map()
    };

    this.activeTrackers.set(sessionId, tracker);
    console.log(`⏱️ Backend: Started performance tracking for session ${sessionId}`);
    
    return {
      startPhase: (name, metadata = {}) => this.startPhase(sessionId, name, metadata),
      endPhase: (name, metadata = {}) => this.endPhase(sessionId, name, metadata),
      recordToken: () => this.recordToken(sessionId),
      getSummary: () => this.getSummary(sessionId),
      saveToDB: () => this.saveToDatabase(sessionId)
    };
  }

  /**
   * Start a performance phase
   */
  startPhase(sessionId, name, metadata = {}) {
    const tracker = this.activeTrackers.get(sessionId);
    if (!tracker) return;

    const phase = {
      name,
      metadata,
      startTime: performance.now(),
      endTime: null,
      duration: null
    };

    tracker.phases.push(phase);
    tracker.openPhases.set(name, phase);
    
    console.log(`⏱️ Backend: Started phase ${name} for session ${sessionId}`);
  }

  /**
   * End a performance phase
   */
  endPhase(sessionId, name, additionalMetadata = {}) {
    const tracker = this.activeTrackers.get(sessionId);
    if (!tracker) return;

    const phase = tracker.openPhases.get(name);
    if (phase) {
      phase.endTime = performance.now();
      phase.duration = phase.endTime - phase.startTime;
      phase.metadata = { ...phase.metadata, ...additionalMetadata };
      tracker.openPhases.delete(name);
      
      console.log(`⏱️ Backend: Ended phase ${name} for session ${sessionId}: ${Math.round(phase.duration)}ms`);
    }
  }

  /**
   * Record token for streaming performance
   */
  recordToken(sessionId) {
    const tracker = this.activeTrackers.get(sessionId);
    if (!tracker) return;

    tracker.tokenCount++;
    const now = performance.now();
    
    if (tracker.firstTokenTime === null) {
      tracker.firstTokenTime = now;
    }
    tracker.lastTokenTime = now;
  }

  /**
   * Get performance summary
   */
  getSummary(sessionId) {
    const tracker = this.activeTrackers.get(sessionId);
    if (!tracker) return null;

    const totalTime = performance.now() - tracker.startTime;
    const timeToFirstToken = tracker.firstTokenTime ? tracker.firstTokenTime - tracker.startTime : null;
    const streamingDuration = tracker.lastTokenTime && tracker.firstTokenTime ? 
      tracker.lastTokenTime - tracker.firstTokenTime : null;
    const tokensPerSecond = streamingDuration && tracker.tokenCount > 0 ? 
      (tracker.tokenCount / (streamingDuration / 1000)) : null;

    return {
      sessionId: tracker.sessionId,
      label: tracker.label,
      totalTime: Math.round(totalTime),
      timeToFirstToken: timeToFirstToken ? Math.round(timeToFirstToken) : null,
      tokenCount: tracker.tokenCount,
      tokensPerSecond: tokensPerSecond ? parseFloat(tokensPerSecond.toFixed(1)) : null,
      phases: tracker.phases.map(p => ({
        name: p.name,
        duration: p.duration ? Math.round(p.duration) : null,
        metadata: p.metadata
      }))
    };
  }

  /**
   * Save performance metrics to database
   */
  async saveToDatabase(sessionId) {
    try {
      const tracker = this.activeTrackers.get(sessionId);
      if (!tracker) return;

      const summary = this.getSummary(sessionId);
      
      // Get session info
      const sessionInfo = await this.getSessionInfo(sessionId);
      if (!sessionInfo) {
        console.warn('Performance tracking: Session info not found for', sessionId);
        return;
      }

      // Save to conversation_processing_metrics table
      await this.pool.query(`
        INSERT INTO conversation_processing_metrics (
          session_id,
          chatbot_id,
          flow_type,
          total_processing_time_ms,
          time_to_first_token_ms,
          token_count,
          tokens_per_second,
          parallel_execution,
          performance_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        sessionId,
        sessionInfo.chatbot_id,
        summary.metadata?.flowType || 'unknown',
        summary.totalTime,
        summary.timeToFirstToken,
        summary.tokenCount,
        summary.tokensPerSecond,
        summary.metadata?.parallelExecution || false,
        JSON.stringify(summary)
      ]);

      console.log(`⏱️ Backend: Performance metrics saved for session ${sessionId}`);
      
      // Clean up tracker
      this.activeTrackers.delete(sessionId);
      
    } catch (error) {
      console.error('Error saving performance metrics:', error);
    }
  }

  /**
   * Get session info for performance tracking
   */
  async getSessionInfo(sessionId) {
    try {
      // Try to get from conversation_sessions first
      const result = await this.pool.query(`
        SELECT chatbot_id, user_id 
        FROM conversation_sessions 
        WHERE session_id = $1
      `, [sessionId]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Fallback: try to get from streaming_sessions
      const streamingResult = await this.pool.query(`
        SELECT cs.chatbot_id, cs.user_id
        FROM streaming_sessions ss
        JOIN conversation_sessions cs ON ss.conversation_session_id = cs.session_id
        WHERE ss.streaming_session_id = $1
      `, [sessionId]);

      return streamingResult.rows[0] || null;
    } catch (error) {
      console.error('Error getting session info for performance tracking:', error);
      return null;
    }
  }

  /**
   * Get performance statistics for a chatbot
   */
  async getPerformanceStats(chatbotId, startDate = null, endDate = null) {
    try {
      let query = `
        SELECT 
          flow_type,
          COUNT(*) as total_sessions,
          AVG(total_processing_time_ms) as avg_processing_time,
          AVG(time_to_first_token_ms) as avg_time_to_first_token,
          AVG(tokens_per_second) as avg_tokens_per_second,
          COUNT(CASE WHEN parallel_execution = true THEN 1 END) as parallel_sessions
        FROM conversation_processing_metrics 
        WHERE chatbot_id = $1
      `;
      
      const params = [chatbotId];
      
      if (startDate && endDate) {
        query += ` AND created_at BETWEEN $2 AND $3`;
        params.push(startDate, endDate);
      }
      
      query += ` GROUP BY flow_type ORDER BY total_sessions DESC`;
      
      const result = await this.pool.query(query, params);
      
      return result.rows.map(row => ({
        flow_type: row.flow_type,
        total_sessions: parseInt(row.total_sessions),
        avg_processing_time: Math.round(parseFloat(row.avg_processing_time) || 0),
        avg_time_to_first_token: Math.round(parseFloat(row.avg_time_to_first_token) || 0),
        avg_tokens_per_second: parseFloat(row.avg_tokens_per_second)?.toFixed(1) || '0.0',
        parallel_sessions: parseInt(row.parallel_sessions),
        parallel_percentage: ((parseInt(row.parallel_sessions) / parseInt(row.total_sessions)) * 100).toFixed(1) + '%'
      }));
    } catch (error) {
      console.error('Error getting performance stats:', error);
      return [];
    }
  }

  /**
   * Clean up old performance tracking data
   */
  async cleanupOldMetrics() {
    try {
      const result = await this.pool.query(`
        DELETE FROM conversation_processing_metrics 
        WHERE created_at < NOW() - INTERVAL '30 days'
      `);
      
      console.log(`🧹 Performance cleanup: Removed ${result.rowCount} old metrics records`);
      return result.rowCount;
    } catch (error) {
      console.error('Error cleaning up performance metrics:', error);
      return 0;
    }
  }

}

/**
 * Factory function to create service instance
 */
export function createPerformanceTrackingService(pool) {
  return new PerformanceTrackingService(pool);
}
