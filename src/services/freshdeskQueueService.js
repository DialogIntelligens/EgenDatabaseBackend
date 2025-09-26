import { createFreshdeskTicket } from '../utils/freshdeskUtils.js';
import { logErrorService } from './errorsService.js';

/**
 * Service for managing Freshdesk ticket queue operations
 */
export class FreshdeskQueueService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Add a ticket to the processing queue
   * @param {Object} ticketData - The ticket data to queue
   * @param {string} chatbotId - The chatbot ID
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Queue entry result
   */
  async queueTicket(ticketData, chatbotId = null, userId = null) {
    try {
      const result = await this.pool.query(`
        INSERT INTO freshdesk_ticket_queue 
        (ticket_data, chatbot_id, user_id, next_attempt_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id, created_at
      `, [
        JSON.stringify(ticketData),
        chatbotId,
        userId
      ]);

      const queueEntry = result.rows[0];
      console.log(`Freshdesk ticket queued successfully: queue_id=${queueEntry.id}`);
      
      return {
        success: true,
        queue_id: queueEntry.id,
        queued_at: queueEntry.created_at,
        message: 'Ticket queued for processing'
      };
    } catch (error) {
      console.error('Failed to queue Freshdesk ticket:', error);
      throw new Error(`Queue operation failed: ${error.message}`);
    }
  }

  /**
   * Get pending tickets ready for processing
   * @param {number} limit - Maximum number of tickets to retrieve
   * @returns {Promise<Array>} Array of pending tickets
   */
  async getPendingTickets(limit = 10) {
    try {
      const result = await this.pool.query(`
        SELECT id, ticket_data, attempts, max_attempts, chatbot_id, user_id
        FROM freshdesk_ticket_queue
        WHERE status = 'pending' 
          AND next_attempt_at <= NOW()
          AND attempts < max_attempts
        ORDER BY created_at ASC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      console.error('Failed to get pending tickets:', error);
      return [];
    }
  }

  /**
   * Mark a ticket as being processed
   * @param {number} queueId - The queue entry ID
   */
  async markAsProcessing(queueId) {
    await this.pool.query(`
      UPDATE freshdesk_ticket_queue 
      SET status = 'processing', 
          attempts = attempts + 1
      WHERE id = $1
    `, [queueId]);
  }

  /**
   * Mark a ticket as successfully completed
   * @param {number} queueId - The queue entry ID
   * @param {string} freshdeskTicketId - The created Freshdesk ticket ID
   */
  async markAsCompleted(queueId, freshdeskTicketId) {
    await this.pool.query(`
      UPDATE freshdesk_ticket_queue 
      SET status = 'completed',
          processed_at = NOW(),
          freshdesk_ticket_id = $2,
          error_message = NULL
      WHERE id = $1
    `, [queueId, freshdeskTicketId]);

    console.log(`Freshdesk ticket completed: queue_id=${queueId}, ticket_id=${freshdeskTicketId}`);
  }

  /**
   * Mark a ticket as failed with exponential backoff
   * @param {number} queueId - The queue entry ID
   * @param {string} errorMessage - The error message
   * @param {number} attempts - Current attempt count
   * @param {number} maxAttempts - Maximum attempts allowed
   */
  async markAsFailed(queueId, errorMessage, attempts, maxAttempts) {
    // Calculate exponential backoff: 2^attempts minutes
    const backoffMinutes = Math.pow(2, attempts);
    const nextAttemptAt = new Date(Date.now() + (backoffMinutes * 60 * 1000));

    if (attempts >= maxAttempts) {
      // Permanently failed
      await this.pool.query(`
        UPDATE freshdesk_ticket_queue 
        SET status = 'failed',
            error_message = $2,
            processed_at = NOW()
        WHERE id = $1
      `, [queueId, errorMessage]);

      console.error(`Freshdesk ticket permanently failed: queue_id=${queueId}, error=${errorMessage}`);
    } else {
      // Retry later with exponential backoff
      await this.pool.query(`
        UPDATE freshdesk_ticket_queue 
        SET status = 'pending',
            error_message = $2,
            next_attempt_at = $3
        WHERE id = $1
      `, [queueId, errorMessage, nextAttemptAt]);

      console.warn(`Freshdesk ticket retry scheduled: queue_id=${queueId}, next_attempt=${nextAttemptAt.toISOString()}, attempts=${attempts}/${maxAttempts}`);
    }
  }

  /**
   * Process a single queued ticket
   * @param {Object} queueEntry - The queue entry to process
   */
  async processTicket(queueEntry) {
    const { id, ticket_data, attempts, max_attempts } = queueEntry;
    
    try {
      console.log(`Processing Freshdesk ticket: queue_id=${id}, attempt=${attempts + 1}/${max_attempts}`);
      
      // Mark as processing
      await this.markAsProcessing(id);

      // Skip actual Freshdesk processing in development environment
      if (process.env.NODE_ENV === 'development') {
        console.log(`Development mode: Simulating Freshdesk ticket processing for queue_id=${id}, email=${ticket_data?.email || 'unknown'}`);
        
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Mark as completed with a fake ticket ID
        const fakeTicketId = `dev-ticket-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        await this.markAsCompleted(id, fakeTicketId);
        
        return { success: true, ticket_id: fakeTicketId, development_mode: true };
      }

      // Attempt to create the Freshdesk ticket
      // ticket_data is already parsed from JSONB, no need to JSON.parse again
      const ticketData = ticket_data;
      const result = await createFreshdeskTicket(ticketData);

      // Mark as completed
      await this.markAsCompleted(id, result.id);

      return { success: true, ticket_id: result.id };
    } catch (error) {
      console.error(`Failed to process Freshdesk ticket: queue_id=${id}`, error);
      
      // Log to error monitoring system
      try {
        const errorLogData = {
          chatbot_id: queueEntry.chatbot_id || 'queue_system',
          user_id: queueEntry.user_id,
          error_category: 'FRESHDESK_ERROR',
          error_message: error.message || 'Freshdesk queue processing failed',
          error_details: {
            queue_id: id,
            attempt: attempts + 1,
            max_attempts: max_attempts,
            ticket_data_keys: Object.keys(ticket_data || {}),
            error_stack: error.stack,
            error_name: error.name,
            ticket_email: ticket_data?.email || 'unknown'
          },
          stack_trace: error.stack
        };
        
        const logResult = await logErrorService(errorLogData, this.pool);
        if (logResult.statusCode === 201) {
          console.log(`Error logged to monitoring system for queue_id=${id}`);
        } else {
          console.warn(`Error logging returned status ${logResult.statusCode} for queue_id=${id}`);
        }
      } catch (logError) {
        console.error(`Failed to log queue processing error: queue_id=${id}`, logError);
      }
      
      // Mark as failed (with potential retry)
      await this.markAsFailed(id, error.message, attempts + 1, max_attempts);
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Process all pending tickets in the queue
   * @param {number} batchSize - Number of tickets to process at once
   */
  async processPendingTickets(batchSize = 5) {
    const pendingTickets = await this.getPendingTickets(batchSize);
    
    if (pendingTickets.length === 0) {
      return { processed: 0, message: 'No pending tickets to process' };
    }

    console.log(`Processing ${pendingTickets.length} pending Freshdesk tickets...`);
    
    const results = await Promise.allSettled(
      pendingTickets.map(ticket => this.processTicket(ticket))
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    console.log(`Freshdesk batch processing complete: ${successful} successful, ${failed} failed`);
    
    return {
      processed: results.length,
      successful,
      failed,
      message: `Processed ${results.length} tickets: ${successful} successful, ${failed} failed`
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    try {
      const result = await this.pool.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM freshdesk_ticket_queue
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY status
        ORDER BY status
      `);

      const stats = {};
      result.rows.forEach(row => {
        stats[row.status] = parseInt(row.count);
      });

      return stats;
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      return {};
    }
  }

  /**
   * Clean up old completed/failed tickets (older than 7 days)
   */
  async cleanupOldTickets() {
    try {
      const result = await this.pool.query(`
        DELETE FROM freshdesk_ticket_queue 
        WHERE status IN ('completed', 'failed') 
          AND processed_at < NOW() - INTERVAL '7 days'
      `);

      const deletedCount = result.rowCount;
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old Freshdesk queue entries`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old tickets:', error);
      return 0;
    }
  }
}

/**
 * Factory function to create FreshdeskQueueService instance
 */
export function createFreshdeskQueueService(pool) {
  return new FreshdeskQueueService(pool);
}
