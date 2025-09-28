/**
 * AI Streaming Service
 * Handles streaming responses from AI APIs and SSE management
 * Phase 4 Optimized with connection pooling and enhanced error handling
 */
export class AiStreamingService {
  constructor(pool) {
    this.pool = pool;
    this.activeStreams = new Map(); // Track active streaming sessions
    this.streamingStats = {
      totalStreams: 0,
      successfulStreams: 0,
      failedStreams: 0,
      averageStreamDuration: 0
    };
  }

  /**
   * Start streaming response from AI API
   */
  async startStreaming(apiUrl, requestBody, sessionId, configuration) {
    const streamingSessionId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Create streaming session record
      const session = await this.createStreamingSession(streamingSessionId, sessionId, apiUrl);

      // Start the streaming process
      this.processStream(apiUrl, requestBody, streamingSessionId, configuration);

      return {
        id: streamingSessionId,
        session_id: session.session_id,
        status: 'started'
      };
    } catch (error) {
      console.error('Error starting streaming:', error);
      throw error;
    }
  }

  /**
   * Create streaming session record
   */
  async createStreamingSession(streamingSessionId, sessionId, apiUrl) {
    try {
      const result = await this.pool.query(`
        INSERT INTO streaming_sessions (
          streaming_session_id,
          conversation_session_id,
          api_url,
          status,
          created_at
        ) VALUES ($1, $2, $3, 'active', NOW())
        RETURNING id, streaming_session_id
      `, [streamingSessionId, sessionId, apiUrl]);

      return {
        id: result.rows[0].id,
        session_id: sessionId,
        streaming_session_id: result.rows[0].streaming_session_id
      };
    } catch (error) {
      console.error('Error creating streaming session:', error);
      throw error;
    }
  }

  /**
   * Process streaming response from AI API
   * Migrated from frontend streamAnswer function with retry logic
   */
  async processStream(apiUrl, requestBody, streamingSessionId, configuration, retryCount = 0) {
    try {
      console.log('🔄 Backend: Starting AI stream processing for session:', streamingSessionId);
      
      // Start performance tracking for streaming
      const { createPerformanceTrackingService } = await import('./performanceTrackingService.js');
      const performanceService = createPerformanceTrackingService(this.pool);
      const perfTracker = performanceService.startTracking(streamingSessionId, 'streaming');

      // Prepare fetch options for streaming
      const streamingRequestBody = { 
        ...requestBody, 
        streaming: true
      };

      console.log(`📡 Backend: Starting stream to ${apiUrl} for session ${streamingSessionId}`);

      const fetchOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wEfLmtcJ4Mj2DODkFDWq2ggjjJ6gJ125sJJpfMR/Aeg=",
        },
        body: JSON.stringify(streamingRequestBody),
      };

      // Make streaming request (use direct fetch for streaming compatibility)
      perfTracker.startPhase('api_connection');
      let response;
      try {
        response = await fetch(apiUrl, fetchOptions);
        perfTracker.endPhase('api_connection', { status: response.status, ok: response.ok });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Primary SSE call failed: ${errorText}`);
        }
      } catch (error) {
        console.error(`Primary SSE error: ${error.message || 'Unknown streaming error'}`);
        
        // Simple retry logic - retry once on network errors
        if (retryCount === 0 && (error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch'))) {
          console.log('Retrying stream connection due to network error...');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
          return this.processStream(apiUrl, requestBody, streamingSessionId, configuration, 1); // Retry with retryCount = 1
        }
        
        await this.markStreamingSessionFailed(streamingSessionId, error.message || 'Stream connection failed');
        throw new Error(`Streaming error: ${error.message || 'Connection failed or interrupted'}`);
      }

      if (!response.body) {
        throw new Error("ReadableStream not supported in this environment.");
      }

      // Process the stream
      perfTracker.startPhase('stream_processing');
      await this.handleStreamResponse(response, streamingSessionId, configuration, retryCount, perfTracker);
      perfTracker.endPhase('stream_processing');

    } catch (error) {
      console.error('🚨 Backend: Error in stream processing:', error);
      await this.markStreamingSessionFailed(streamingSessionId, error.message);
      
      // Don't re-throw if this was already a retry to prevent infinite loops
      if (retryCount === 0) {
        throw error;
      }
    }
  }

  /**
   * Handle streaming response and emit SSE events
   * Migrated from frontend streamAnswer function
   */
  async handleStreamResponse(response, streamingSessionId, configuration, retryCount = 0, perfTracker = null) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let chunkBuffer = "";
    let isBuffering = false;
    let bufferedContent = "";
    let currentAiText = "";
    let currentAiTextWithMarkers = "";
    let contextChunks = [];

    // Marker tracking variables
    let lastChunk = "";
    let lastFreshChunk = "";
    let lastHumanAgentChunk = "";
    let lastImageChunk = "";

    const freshMarker = "$$";
    const humanAgentMarker = "&&";
    const imageMarker = "i#";

    try {
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        
        if (value) {
          chunkBuffer += decoder.decode(value, { stream: true });
          const lines = chunkBuffer.split(/\r?\n/);
          chunkBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const dataStr = trimmed.replace("data:", "").trim();
            if (dataStr === "[DONE]") {
              done = true;
              break;
            }

            let json;
            try {
              json = JSON.parse(dataStr);
            } catch (err) {
              chunkBuffer = trimmed + "\n" + chunkBuffer;
              continue;
            }

            // Process different event types
            if (json.event === "start") {
              await this.emitSSE(streamingSessionId, 'start', { message: 'Stream started' });
            } else if (json.event === "sourceDocuments") {
              contextChunks = json.data || [];
              await this.emitSSE(streamingSessionId, 'context', { chunks: contextChunks });
            } else if (json.event === "token") {
              // Record token for performance tracking
              if (perfTracker) {
                perfTracker.recordToken();
              }

              const processedToken = await this.processToken(
                json.data, 
                { lastChunk, lastFreshChunk, lastHumanAgentChunk, lastImageChunk },
                { freshMarker, humanAgentMarker, imageMarker },
                { isBuffering, bufferedContent, currentAiText, currentAiTextWithMarkers },
                configuration
              );

              // Update tracking variables
              lastChunk = processedToken.lastChunk;
              lastFreshChunk = processedToken.lastFreshChunk;
              lastHumanAgentChunk = processedToken.lastHumanAgentChunk;
              lastImageChunk = processedToken.lastImageChunk;
              isBuffering = processedToken.isBuffering;
              bufferedContent = processedToken.bufferedContent;
              currentAiText = processedToken.currentAiText;
              currentAiTextWithMarkers = processedToken.currentAiTextWithMarkers;

              // Emit token to frontend
              await this.emitSSE(streamingSessionId, 'token', {
                token: processedToken.displayToken,
                markers: processedToken.markers
              });

            } else if (json.event === "end") {
              // Handle final buffered content
              if (isBuffering && bufferedContent) {
                currentAiText += bufferedContent;
                currentAiTextWithMarkers += bufferedContent;
                await this.emitSSE(streamingSessionId, 'token', { 
                  token: bufferedContent,
                  markers: {}
                });
              }

              // Mark session as completed
              await this.markStreamingSessionCompleted(streamingSessionId, {
                finalText: currentAiText,
                finalTextWithMarkers: currentAiTextWithMarkers,
                contextChunks
              });

              // Save conversation to database with analytics (background task)
              this.saveConversationInBackground(streamingSessionId, {
                finalText: currentAiText,
                finalTextWithMarkers: currentAiTextWithMarkers,
                contextChunks
              }, configuration);

              await this.emitSSE(streamingSessionId, 'end', { 
                finalText: currentAiText,
                contextChunks 
              });
              done = true;
            } else if (json.event === "error") {
              await this.emitSSE(streamingSessionId, 'error', { error: json.data });
              await this.markStreamingSessionFailed(streamingSessionId, json.data);
              done = true;
            }
          }
        }
      }
    } catch (streamError) {
      console.error("Stream reading error:", streamError.message || "Unknown stream error");
      
      // Simple retry logic for stream reading errors - retry once on network errors
      if (retryCount === 0 && (streamError.message.toLowerCase().includes('network') || streamError.message.toLowerCase().includes('fetch'))) {
        console.log('Retrying stream due to network error during reading...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        // Mark current session as failed and start a new one
        await this.markStreamingSessionFailed(streamingSessionId, 'Retrying due to network error');
        throw streamError; // Let the parent function handle retry
      }
      
      await this.markStreamingSessionFailed(streamingSessionId, streamError.message || "Stream reading error");
      await this.emitSSE(streamingSessionId, 'error', { error: streamError.message });
    }
  }

  /**
   * Process individual token and handle markers
   */
  async processToken(token, lastChunks, markers, textState, configuration) {
    let { lastChunk, lastFreshChunk, lastHumanAgentChunk, lastImageChunk } = lastChunks;
    let { freshMarker, humanAgentMarker, imageMarker } = markers;
    let { isBuffering, bufferedContent, currentAiText, currentAiTextWithMarkers } = textState;
    
    let displayToken = token;
    let tokenWithMarkers = token;
    const detectedMarkers = {};

    // Contact form marker (%%)
    const combinedContact = lastChunk + token;
    if (combinedContact.includes("%%")) {
      detectedMarkers.contactForm = true;
      displayToken = combinedContact.replace("%%", "");
    }
    lastChunk = displayToken.slice(-2);

    // Freshdesk marker ($$)
    if (freshMarker) {
      const combinedFresh = lastFreshChunk + token;
      if (combinedFresh.includes(freshMarker)) {
        detectedMarkers.freshdesk = true;
        tokenWithMarkers = combinedFresh.slice(lastFreshChunk.length);
        displayToken = combinedFresh.replaceAll(freshMarker, "").slice(lastFreshChunk.length);
        lastFreshChunk = displayToken.length >= freshMarker.length ? displayToken.slice(-freshMarker.length) : displayToken;
      } else {
        lastFreshChunk = token.length >= freshMarker.length ? token.slice(-freshMarker.length) : token;
      }
    }

    // Human agent marker (&&)
    if (humanAgentMarker) {
      const combinedHuman = lastHumanAgentChunk + token;
      if (combinedHuman.includes(humanAgentMarker)) {
        detectedMarkers.humanAgent = true;
        tokenWithMarkers = combinedHuman.slice(lastHumanAgentChunk.length);
        displayToken = combinedHuman.replaceAll(humanAgentMarker, "").slice(lastHumanAgentChunk.length);
        lastHumanAgentChunk = displayToken.length >= humanAgentMarker.length ? displayToken.slice(-humanAgentMarker.length) : displayToken;
      } else {
        lastHumanAgentChunk = token.length >= humanAgentMarker.length ? token.slice(-humanAgentMarker.length) : token;
      }
    }

    // Image marker (i#)
    if (imageMarker) {
      const combinedImage = lastImageChunk + token;
      if (combinedImage.includes(imageMarker)) {
        detectedMarkers.imageUpload = true;
        tokenWithMarkers = imageMarker;
        displayToken = combinedImage.replaceAll(imageMarker, "").slice(lastImageChunk.length);
        lastImageChunk = displayToken.length >= imageMarker.length ? displayToken.slice(-imageMarker.length) : displayToken;
      } else {
        lastImageChunk = token.length >= imageMarker.length ? token.slice(-imageMarker.length) : token;
      }
    }

    // Product block buffering (XXX...YYY)
    if (!isBuffering) {
      if (displayToken.includes("XXX")) {
        isBuffering = true;
        bufferedContent = displayToken;
        displayToken = "BUFFERING_START"; // Special token to indicate buffering started
        // Don't accumulate to currentAiText for control tokens
      } else {
        currentAiText += displayToken;
        currentAiTextWithMarkers += tokenWithMarkers;
      }
    } else {
      bufferedContent += displayToken;
      if (displayToken.includes("YYY")) {
        currentAiText += bufferedContent;
        currentAiTextWithMarkers += bufferedContent;
        displayToken = bufferedContent + "BUFFERING_END"; // Emit the full product block followed by buffering end marker
        bufferedContent = "";
        isBuffering = false;
      } else {
        displayToken = ""; // Don't emit partial product content
      }
    }

    return {
      displayToken,
      markers: detectedMarkers,
      lastChunk,
      lastFreshChunk,
      lastHumanAgentChunk,
      lastImageChunk,
      isBuffering,
      bufferedContent,
      currentAiText,
      currentAiTextWithMarkers
    };
  }

  /**
   * Emit SSE event to frontend
   */
  async emitSSE(streamingSessionId, eventType, data) {
    try {
      // Safely stringify the data
      let eventDataString;
      try {
        if (typeof data === 'object' && data !== null) {
          eventDataString = JSON.stringify(data);
        } else if (typeof data === 'string') {
          eventDataString = data;
        } else {
          eventDataString = JSON.stringify({ value: data });
        }
      } catch (stringifyError) {
        console.error('Error stringifying event data:', stringifyError, 'Data:', data);
        eventDataString = JSON.stringify({ error: 'Failed to serialize event data' });
      }

      // Store SSE event in database for the frontend to poll
      await this.pool.query(`
        INSERT INTO streaming_events (
          streaming_session_id,
          event_type,
          event_data,
          created_at
        ) VALUES ($1, $2, $3, NOW())
      `, [streamingSessionId, eventType, eventDataString]);

      console.log(`📡 SSE emitted: ${eventType} for session ${streamingSessionId}`);
    } catch (error) {
      console.error('Error emitting SSE event:', error);
    }
  }

  /**
   * Mark streaming session as completed
   */
  async markStreamingSessionCompleted(streamingSessionId, result) {
    try {
      // Safely stringify the result
      let resultString;
      try {
        if (typeof result === 'object' && result !== null) {
          resultString = JSON.stringify(result);
        } else if (typeof result === 'string') {
          resultString = result;
        } else {
          resultString = JSON.stringify({ value: result });
        }
      } catch (stringifyError) {
        console.error('Error stringifying final result:', stringifyError, 'Result:', result);
        resultString = JSON.stringify({ error: 'Failed to serialize final result' });
      }

      await this.pool.query(`
        UPDATE streaming_sessions 
        SET 
          status = 'completed',
          completed_at = NOW(),
          final_result = $2
        WHERE streaming_session_id = $1
      `, [streamingSessionId, resultString]);

      console.log('✅ Backend: Streaming session completed:', streamingSessionId);
    } catch (error) {
      console.error('Error marking streaming session as completed:', error);
    }
  }

  /**
   * Mark streaming session as failed
   */
  async markStreamingSessionFailed(streamingSessionId, errorMessage) {
    try {
      await this.pool.query(`
        UPDATE streaming_sessions 
        SET 
          status = 'failed',
          completed_at = NOW(),
          error_message = $2
        WHERE streaming_session_id = $1
      `, [streamingSessionId, errorMessage]);

      console.log('❌ Backend: Streaming session failed:', streamingSessionId, errorMessage);
    } catch (error) {
      console.error('Error marking streaming session as failed:', error);
    }
  }

  /**
   * Get streaming events for a session (for frontend polling)
   */
  async getStreamingEvents(streamingSessionId, lastEventId = 0) {
    try {
      const result = await this.pool.query(`
        SELECT id, event_type, event_data, created_at
        FROM streaming_events
        WHERE streaming_session_id = $1 AND id > $2
        ORDER BY id ASC
      `, [streamingSessionId, lastEventId]);

      return result.rows.map(row => {
        let eventData = {};
        try {
          // Handle different data types that might be stored
          if (typeof row.event_data === 'string') {
            eventData = JSON.parse(row.event_data);
          } else if (typeof row.event_data === 'object' && row.event_data !== null) {
            eventData = row.event_data;
          } else {
            console.warn('Unexpected event_data type:', typeof row.event_data, row.event_data);
            eventData = {};
          }
        } catch (parseError) {
          console.error('Error parsing event_data:', parseError, 'Raw data:', row.event_data);
          eventData = { error: 'Failed to parse event data' };
        }

        return {
          id: row.id,
          event: row.event_type,
          data: eventData,
          timestamp: row.created_at
        };
      });
    } catch (error) {
      console.error('Error getting streaming events:', error);
      return [];
    }
  }

  /**
   * Get streaming session status
   */
  async getStreamingSessionStatus(streamingSessionId) {
    try {
      const result = await this.pool.query(`
        SELECT status, error_message, final_result, completed_at
        FROM streaming_sessions
        WHERE streaming_session_id = $1
      `, [streamingSessionId]);

      if (result.rows.length === 0) {
        return { status: 'not_found' };
      }

      const session = result.rows[0];
      let finalResult = null;
      
      // Safely parse final_result
      if (session.final_result) {
        try {
          if (typeof session.final_result === 'string') {
            finalResult = JSON.parse(session.final_result);
          } else if (typeof session.final_result === 'object') {
            finalResult = session.final_result;
          }
        } catch (parseError) {
          console.error('Error parsing final_result:', parseError, 'Raw data:', session.final_result);
          finalResult = { error: 'Failed to parse final result' };
        }
      }

      return {
        status: session.status,
        error_message: session.error_message,
        final_result: finalResult,
        completed_at: session.completed_at
      };
    } catch (error) {
      console.error('Error getting streaming session status:', error);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Save conversation in background after streaming completes
   * Migrated from frontend background conversation saving
   */
  async saveConversationInBackground(streamingSessionId, streamingResult, configuration) {
    try {
      // This runs in background - don't block the streaming response
      setTimeout(async () => {
        try {
          console.log('💾 Backend: Starting background conversation save for session:', streamingSessionId);
          
          // Get session information
          const sessionInfo = await this.getSessionInfo(streamingSessionId);
          if (!sessionInfo) {
            console.error('💾 Backend: Session info not found for conversation save');
            return;
          }
          
          // Get existing conversation to build complete message history
          const existingConversation = await this.getExistingConversation(sessionInfo.user_id, sessionInfo.chatbot_id);
          
          // Get chatbot start message from database
          const startMessage = await this.getChatbotStartMessage(sessionInfo.chatbot_id);
          
          // Build complete conversation data (like the old system)
          let allMessages = [];
          
          // Start with existing messages if any
          if (existingConversation && existingConversation.conversation_data) {
            try {
              const existingMessages = typeof existingConversation.conversation_data === 'string' 
                ? JSON.parse(existingConversation.conversation_data)
                : existingConversation.conversation_data;
              
              if (Array.isArray(existingMessages)) {
                allMessages = [...existingMessages];
              }
            } catch (e) {
              console.error('Error parsing existing conversation data:', e);
              allMessages = [];
            }
          } else {
            // If no existing conversation, start with the chatbot's first message (like the old system)
            if (startMessage) {
              allMessages.push({
                text: startMessage,
                textWithMarkers: startMessage,
                isUser: false,
                timestamp: sessionInfo.created_at
              });
              console.log('💾 Backend: Added start message to new conversation');
            }
          }
          
          // Add new user message, including image data
          const userMessage = {
            text: sessionInfo.user_message || '',
            isUser: true,
            timestamp: sessionInfo.created_at
          };

          if (sessionInfo.user_image_data) {
            userMessage.image = sessionInfo.user_image_data;
            userMessage.fileName = sessionInfo.user_image_name || null;
            userMessage.fileMime = sessionInfo.user_image_mime || null;
            userMessage.fileSize = sessionInfo.user_image_size || null;
            userMessage.isFile = sessionInfo.user_image_is_file || (sessionInfo.user_image_data.startsWith('data:') ? false : true);
            userMessage.timestamp = sessionInfo.created_at;
          }

          allMessages.push(userMessage);
          
          // Add AI response
          const aiMessage = {
            text: streamingResult.finalText,
            textWithMarkers: streamingResult.finalTextWithMarkers,
            isUser: false,
            timestamp: new Date().toISOString()
          };

          if (streamingResult.finalImage) {
            aiMessage.image = streamingResult.finalImage.data;
            aiMessage.fileName = streamingResult.finalImage.name || null;
            aiMessage.fileMime = streamingResult.finalImage.mime || null;
            aiMessage.fileSize = streamingResult.finalImage.size || null;
            aiMessage.isFile = streamingResult.finalImage.isFile || false;
          }

          allMessages.push(aiMessage);

          const conversationData = {
            user_id: sessionInfo.user_id,
            chatbot_id: sessionInfo.chatbot_id,
            messages: allMessages,
            split_test_id: configuration.currentSplitTestId || null
          };
          
          // Use analytics service to save with analysis
          const { createConversationAnalyticsService } = await import('./conversationAnalyticsService.js');
          const analyticsService = createConversationAnalyticsService(this.pool);
          
          await analyticsService.saveConversationWithAnalytics(
            conversationData,
            configuration,
            streamingResult.contextChunks || []
          );
          
          console.log('💾 Backend: Background conversation save completed');
          
        } catch (error) {
          console.error('💾 Backend: Error in background conversation save:', error);
        }
      }, 100); // Small delay to ensure streaming response is sent first
      
    } catch (error) {
      console.error('Error setting up background conversation save:', error);
    }
  }

  /**
   * Get session information for conversation saving
   */
  async getSessionInfo(streamingSessionId) {
    try {
      const result = await this.pool.query(`
        SELECT 
          ss.conversation_session_id,
          cs.user_id,
          cs.chatbot_id,
          cs.created_at,
          cs.configuration->>'user_message' as user_message,
          cs.configuration->>'image_data' as user_image_data,
          cs.configuration->>'image_name' as user_image_name,
          cs.configuration->>'image_mime' as user_image_mime,
          (cs.configuration->>'image_size')::bigint as user_image_size,
          (cs.configuration->>'image_is_file')::boolean as user_image_is_file
        FROM streaming_sessions ss
        JOIN conversation_sessions cs ON ss.conversation_session_id = cs.session_id
        WHERE ss.streaming_session_id = $1
      `, [streamingSessionId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting session info:', error);
      return null;
    }
  }

  /**
   * Get existing conversation for a user and chatbot
   */
  async getExistingConversation(userId, chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT id, conversation_data, emne, score, customer_rating
        FROM conversations 
        WHERE user_id = $1 AND chatbot_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId, chatbotId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting existing conversation:', error);
      return null;
    }
  }

  /**
   * Get chatbot start message from database
   * Loads the firstMessage from chatbot_settings table
   */
  async getChatbotStartMessage(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT first_message
        FROM chatbot_settings 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      if (result.rows.length > 0 && result.rows[0].first_message) {
        console.log(`💾 Backend: Loaded start message for ${chatbotId}: ${result.rows[0].first_message.substring(0, 50)}...`);
        return result.rows[0].first_message;
      }

      console.log(`💾 Backend: No start message found for ${chatbotId}`);
      return null;
    } catch (error) {
      console.error('Error getting chatbot start message:', error);
      return null;
    }
  }

  /**
   * Clean up old streaming sessions and events
   */
  async cleanupOldSessions() {
    try {
      // Delete events older than 1 hour
      const eventsResult = await this.pool.query(`
        DELETE FROM streaming_events 
        WHERE created_at < NOW() - INTERVAL '1 hour'
      `);

      // Delete sessions older than 24 hours
      const sessionsResult = await this.pool.query(`
        DELETE FROM streaming_sessions 
        WHERE created_at < NOW() - INTERVAL '24 hours'
      `);

      console.log(`🧹 Cleanup: Removed ${eventsResult.rowCount} old events and ${sessionsResult.rowCount} old sessions`);
    } catch (error) {
      console.error('Error cleaning up streaming sessions:', error);
    }
  }
}

/**
 * Factory function to create service instance
 */
export function createAiStreamingService(pool) {
  return new AiStreamingService(pool);
}
