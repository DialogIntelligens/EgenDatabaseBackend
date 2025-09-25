import { getEmneAndScore } from '../utils/mainUtils.js';

/**
 * Conversation Analytics Service
 * Handles statistics analysis and conversation analytics
 * Migrated from frontend analytics logic
 */
export class ConversationAnalyticsService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Analyze conversation and get statistics
   * Migrated from frontend getEmneAndScore calls
   */
  async analyzeConversation(conversationData, configuration) {
    try {
      console.log('📊 Backend: Starting conversation analysis');
      
      // Build conversation text for analysis
      const conversationText = this.buildConversationText(conversationData);
      
      // Get statistics analysis using existing backend function
      const analysis = await getEmneAndScore(
        conversationText,
        conversationData.user_id,
        conversationData.chatbot_id,
        this.pool
      );
      
      console.log('📊 Backend: Analysis completed:', {
        emne: analysis.emne,
        score: analysis.score,
        lacking_info: analysis.lacking_info,
        fallback: analysis.fallback,
        ligegyldig: analysis.ligegyldig,
        tags: analysis.tags?.length || 0
      });
      
      return analysis;
      
    } catch (error) {
      console.error('📊 Backend: Error in conversation analysis:', error);
      return {
        emne: null,
        score: null,
        lacking_info: false,
        fallback: null,
        ligegyldig: null,
        tags: null
      };
    }
  }

  /**
   * Save conversation with analytics
   * Migrated from frontend saveConversationToDatabase logic
   */
  async saveConversationWithAnalytics(conversationData, configuration, contextChunks = []) {
    try {
      console.log('💾 Backend: Saving conversation with analytics');
      
      // Analyze the conversation
      const analysis = await this.analyzeConversation(conversationData, configuration);
      
      // Apply exclamation mark replacement if enabled
      let processedConversationData = conversationData;
      if (configuration.replaceExclamationWithPeriod) {
        processedConversationData = this.applyExclamationReplacement(conversationData);
      }
      
      // Save to database using existing conversation service
      const savedConversation = await this.saveToDatabase(
        processedConversationData,
        analysis,
        configuration
      );
      
      // Save context chunks if available
      if (contextChunks.length > 0 && savedConversation?.id) {
        await this.saveContextChunks(savedConversation.id, contextChunks);
      }
      
      console.log('💾 Backend: Conversation saved with ID:', savedConversation?.id);
      return savedConversation;
      
    } catch (error) {
      console.error('💾 Backend: Error saving conversation:', error);
      throw error;
    }
  }

  /**
   * Build conversation text for analysis
   */
  buildConversationText(conversationData) {
    if (!conversationData.messages || !Array.isArray(conversationData.messages)) {
      return '';
    }
    
    return conversationData.messages
      .map(msg => `${msg.isUser ? 'User' : 'AI'}: ${msg.text || ''}`)
      .join('\n');
  }

  /**
   * Apply exclamation mark replacement
   */
  applyExclamationReplacement(conversationData) {
    if (!conversationData.messages) return conversationData;
    
    return {
      ...conversationData,
      messages: conversationData.messages.map(msg => ({
        ...msg,
        text: msg.text ? msg.text.replace(/! /g, ". ") : msg.text
      }))
    };
  }

  /**
   * Save conversation to database
   * Migrated from frontend - updates existing conversation instead of creating new ones
   */
  async saveToDatabase(conversationData, analysis, configuration) {
    try {
      // First try to update existing conversation (like the old system)
      const updateResult = await this.pool.query(`
        UPDATE conversations
        SET conversation_data = $3,
            emne = COALESCE($4, emne),
            score = COALESCE($5, score),
            customer_rating = COALESCE($6, customer_rating),
            lacking_info = COALESCE($7, lacking_info),
            fallback = COALESCE($8, fallback),
            ligegyldig = COALESCE($9, ligegyldig),
            tags = COALESCE($10, tags),
            form_data = COALESCE($11, form_data),
            split_test_id = COALESCE($12, split_test_id),
            purchase_tracking_enabled = COALESCE($13, purchase_tracking_enabled),
            created_at = NOW()
        WHERE user_id = $1 AND chatbot_id = $2
        RETURNING id, created_at
      `, [
        conversationData.user_id,
        conversationData.chatbot_id,
        JSON.stringify(conversationData.messages),
        analysis.emne,
        analysis.score,
        conversationData.customer_rating || null,
        analysis.lacking_info,
        analysis.fallback,
        analysis.ligegyldig,
        analysis.tags ? JSON.stringify(analysis.tags) : null,
        conversationData.form_data ? JSON.stringify(conversationData.form_data) : null,
        conversationData.split_test_id || null,
        configuration.purchaseTrackingEnabled || false
      ]);

      if (updateResult.rows.length > 0) {
        console.log('💾 Backend: Updated existing conversation:', updateResult.rows[0].id);
        return updateResult.rows[0];
      }

      // If no existing conversation, create new one
      const insertResult = await this.pool.query(`
        INSERT INTO conversations (
          user_id, chatbot_id, conversation_data, emne, score, 
          customer_rating, lacking_info, fallback, ligegyldig, tags,
          form_data, is_livechat, split_test_id, purchase_tracking_enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, created_at
      `, [
        conversationData.user_id,
        conversationData.chatbot_id,
        JSON.stringify(conversationData.messages),
        analysis.emne,
        analysis.score,
        conversationData.customer_rating || null,
        analysis.lacking_info,
        analysis.fallback,
        analysis.ligegyldig,
        analysis.tags ? JSON.stringify(analysis.tags) : null,
        conversationData.form_data ? JSON.stringify(conversationData.form_data) : null,
        conversationData.is_livechat || false,
        conversationData.split_test_id || null,
        configuration.purchaseTrackingEnabled || false
      ]);

      console.log('💾 Backend: Created new conversation:', insertResult.rows[0].id);
      return insertResult.rows[0];
    } catch (error) {
      console.error('Error saving conversation to database:', error);
      throw error;
    }
  }

  /**
   * Save context chunks for conversation
   */
  async saveContextChunks(conversationId, contextChunks) {
    try {
      if (!contextChunks || contextChunks.length === 0) return;
      
      console.log(`💾 Backend: Saving ${contextChunks.length} context chunks for conversation ${conversationId}`);
      
      // Clear existing chunks for this conversation
      await this.pool.query(
        'DELETE FROM message_context_chunks WHERE conversation_id = $1',
        [conversationId]
      );
      
      // Insert new chunks
      for (let i = 0; i < contextChunks.length; i++) {
        const chunk = contextChunks[i];
        await this.pool.query(
          `INSERT INTO message_context_chunks 
           (conversation_id, message_index, chunk_content, chunk_metadata, similarity_score)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            conversationId,
            0, // Assuming these are for the AI response (index 0)
            chunk.pageContent || chunk.content || '',
            JSON.stringify(chunk.metadata || {}),
            chunk.score || null
          ]
        );
      }
      
      console.log(`💾 Backend: Successfully saved ${contextChunks.length} context chunks`);
    } catch (error) {
      console.error('Error saving context chunks:', error);
    }
  }

  /**
   * Get conversation analytics for a chatbot
   */
  async getConversationAnalytics(chatbotId, startDate = null, endDate = null) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_conversations,
          AVG(score::numeric) as avg_score,
          AVG(customer_rating::numeric) as avg_rating,
          COUNT(CASE WHEN lacking_info = true THEN 1 END) as lacking_info_count,
          COUNT(CASE WHEN fallback = true THEN 1 END) as fallback_count,
          COUNT(CASE WHEN ligegyldig = true THEN 1 END) as ligegyldig_count,
          COUNT(CASE WHEN customer_rating >= 4 THEN 1 END) as satisfied_count,
          COUNT(CASE WHEN customer_rating IS NOT NULL THEN 1 END) as rated_count
        FROM conversations 
        WHERE chatbot_id = $1
      `;
      
      const params = [chatbotId];
      
      if (startDate && endDate) {
        query += ` AND created_at BETWEEN $2 AND $3`;
        params.push(startDate, endDate);
      }
      
      const result = await this.pool.query(query, params);
      const stats = result.rows[0];
      
      return {
        total_conversations: parseInt(stats.total_conversations),
        avg_score: stats.avg_score ? parseFloat(stats.avg_score).toFixed(2) : null,
        avg_rating: stats.avg_rating ? parseFloat(stats.avg_rating).toFixed(2) : null,
        lacking_info_rate: stats.total_conversations > 0 ? 
          ((stats.lacking_info_count / stats.total_conversations) * 100).toFixed(1) + '%' : '0%',
        fallback_rate: stats.total_conversations > 0 ? 
          ((stats.fallback_count / stats.total_conversations) * 100).toFixed(1) + '%' : '0%',
        ligegyldig_rate: stats.total_conversations > 0 ? 
          ((stats.ligegyldig_count / stats.total_conversations) * 100).toFixed(1) + '%' : '0%',
        satisfaction_rate: stats.rated_count > 0 ? 
          ((stats.satisfied_count / stats.rated_count) * 100).toFixed(1) + '%' : '0%',
        total_ratings: parseInt(stats.rated_count)
      };
    } catch (error) {
      console.error('Error getting conversation analytics:', error);
      return null;
    }
  }
}

/**
 * Factory function to create service instance
 */
export function createConversationAnalyticsService(pool) {
  return new ConversationAnalyticsService(pool);
}
