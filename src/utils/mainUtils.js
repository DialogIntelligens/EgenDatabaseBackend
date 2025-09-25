import { analyzeConversations } from '../../textAnalysis.js';
import { processScheduledUploads } from '../services/scheduledUploadsService.js';


/**
 * Get emne and score analysis for conversation text
 * @param {string} conversationText - The conversation text to analyze
 * @param {number} userId - User ID for settings
 * @param {number} chatbotId - Chatbot ID for prompt templates
 * @param {Object} pool - Database connection pool
 * @returns {Object} Analysis results with emne, score, etc.
 */
export const getEmneAndScore = async (conversationText, userId, chatbotId, pool) => {
  try {
    // Use the standard statistics API endpoint
    const statisticsAPI = "https://den-utrolige-snebold.onrender.com/api/v1/prediction/53e9c446-b2a3-41ca-8a01-8d48c05fcc7a";

    const bodyObject = { question: conversationText };

    // Get statistics prompt from prompt templates (same as chatbot)
    try {
      // Import and use the buildPrompt function to get the statistics prompt
      const { buildPrompt } = await import('../../promptTemplateV2Routes.js');
      const statisticsPrompt = await buildPrompt(pool, chatbotId, 'statistics');

      if (statisticsPrompt) {
        bodyObject.overrideConfig = bodyObject.overrideConfig || {};
        bodyObject.overrideConfig.vars = bodyObject.overrideConfig.vars || {};
        bodyObject.overrideConfig.vars.statestik_prompt = statisticsPrompt;
        console.log("Statistics prompt override added for user", userId, "chatbot", chatbotId);
      }
    } catch (promptError) {
      console.warn('Could not load statistics prompt:', promptError);
      // Continue without custom prompt - use defaults
    }

    // Get other user settings that might exist
    try {

      // Get topK setting for statistics flow
      const topKResult = await pool.query(
        'SELECT top_k FROM flow_top_k_settings WHERE user_id = $1 AND flow_key = $2',
        [userId, 'statistics']
      );

      if (topKResult.rows.length > 0) {
        const topKValue = topKResult.rows[0].top_k;
        bodyObject.overrideConfig = bodyObject.overrideConfig || {};
        bodyObject.overrideConfig.topK = topKValue;
        console.log(`Applied topK setting for statistics flow: ${topKValue}`);
      }

      // Get flow-specific Pinecone API key for statistics flow
      const apiKeyResult = await pool.query(
        'SELECT pinecone_api_key FROM flow_pinecone_api_keys WHERE user_id = $1 AND flow_key = $2',
        [userId, 'statistics']
      );

      if (apiKeyResult.rows.length > 0) {
        const apiKey = apiKeyResult.rows[0].pinecone_api_key;
        bodyObject.overrideConfig = bodyObject.overrideConfig || {};
        bodyObject.overrideConfig.pineconeApiKey = apiKey;
        console.log(`Applied flow-specific API key for statistics flow: ${apiKey.substring(0, 20)}...`);
      }

    } catch (settingsError) {
      console.warn('Could not load user statistics settings:', settingsError);
      // Continue without settings - use defaults
    }

    const response = await fetch(statisticsAPI, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyObject),
    });

    if (!response.ok) {
      throw new Error(`Statistics API responded with status: ${response.status}`);
    }

    const result = await response.json();
    const text = result.text;

    const emneMatch = text.match(/Emne\(([^)]+)\)/);
    const scoreMatch = text.match(/Happy\(([^)]+)\)/);
    const infoMatch = text.match(/info\(([^)]+)\)/i);
    const fallbackMatch = text.match(/fallback\(([^)]+)\)/i);
    const ligegyldigMatch = text.match(/ligegyldig\(([^)]+)\)/i);
    const tagsMatch = text.match(/tags\(([^)]+)\)/i);

    const emne = emneMatch ? emneMatch[1] : null;
    const score = scoreMatch ? scoreMatch[1] : null;
    const lacking_info = infoMatch && infoMatch[1].toLowerCase() === 'yes' ? true : false;
    const fallback = fallbackMatch ? fallbackMatch[1].toLowerCase() === 'yes' : null;
    const ligegyldig = ligegyldigMatch ? ligegyldigMatch[1].toLowerCase() === 'yes' : null;
    const tags = tagsMatch ? tagsMatch[1].split(',').map(tag => tag.trim()) : null;

    return { emne, score, lacking_info, fallback, ligegyldig, tags };
  } catch (error) {
    console.error('Error getting emne, score, and lacking_info:', error);
    return { emne: null, score: null, lacking_info: false, fallback: null, ligegyldig: null, tags: null };
  }
};

/**
 * Process conversations in chunks to reduce memory usage and CPU load
 * @param {Array} chatbotIds - Array of chatbot IDs
 * @param {string} selectedEmne - Optional topic filter
 * @param {string} start_date - Optional start date filter
 * @param {string} end_date - Optional end date filter
 * @param {Object} pool - Database connection pool
 * @param {number} chunkSize - Size of each chunk (default: 500)
 * @returns {Object} Result object with rows array containing all conversations
 */
export async function processConversationsInChunks(chatbotIds, selectedEmne, start_date, end_date, pool, chunkSize = 500) {
  let offset = 0;
  let allResults = [];
  let totalProcessed = 0;

  console.log(`Starting chunked conversation processing with chunk size: ${chunkSize}`);

  while (true) {
    // Build query for this chunk
    let queryText = `
      SELECT id, created_at, conversation_data, score, emne, customer_rating
      FROM conversations
      WHERE chatbot_id = ANY($1) AND score IS NOT NULL
    `;
    let queryParams = [chatbotIds];
    let paramIndex = 2;

    // Add emne filter if selected
    if (selectedEmne) {
      queryText += ` AND emne = $${paramIndex++}`;
      queryParams.push(selectedEmne);
    }

    // Add date filters if provided
    if (start_date && end_date) {
      queryText += ` AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      queryParams.push(start_date, end_date);
    }

    // Add ordering and pagination
    queryText += ` ORDER BY created_at DESC LIMIT ${chunkSize} OFFSET ${offset}`;

    // Execute query for this chunk
    const chunkResult = await pool.query(queryText, queryParams);

    // If no more results, break the loop
    if (chunkResult.rows.length === 0) {
      break;
    }

    // Add results to our collection
    allResults.push(...chunkResult.rows);
    totalProcessed += chunkResult.rows.length;
    offset += chunkSize;

    // Log progress for large datasets
    if (totalProcessed % 1000 === 0 || chunkResult.rows.length < chunkSize) {
      console.log(`Processed ${totalProcessed} conversations in chunks...`);
    }

    // Check memory usage and adjust processing if needed (adjusted for 4GB RAM)
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    if (memUsedMB > 3000) { // If memory usage exceeds 3GB
      const delayMultiplier = Math.min(4, 1 + (memUsedMB - 3000) / 250); // Cap at 4x delay
      const delay = Math.min(50 * delayMultiplier, 500); // Cap at 500ms max
      console.log(`High memory usage detected (${memUsedMB}MB), adding ${Math.round(delay)}ms delay between chunks`);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    } else if (memUsedMB > 2000) { // Minor slowdown at 2GB
      await new Promise(resolve => setTimeout(resolve, 100));
    } else {
      // Small delay to prevent CPU spikes
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // If we got fewer results than chunk size, we're done
    if (chunkResult.rows.length < chunkSize) {
      break;
    }
  }

  console.log(`Chunked processing completed. Total conversations loaded: ${totalProcessed}`);

  // Return in the same format as the original query
  return { rows: allResults };
}

/**
 * Analyze conversations in chunks to prevent memory overload and timeouts
 * @param {Array} conversations - Array of all conversations to analyze
 * @param {number} chunkSize - Size of each chunk for analysis (default: 1000)
 * @returns {Object} Combined analysis results
 */
export async function analyzeConversationsInChunks(conversations, chunkSize = 1000) {
  console.log(`Starting chunked text analysis for ${conversations.length} conversations with chunk size: ${chunkSize}`);

  // If we have fewer conversations than chunk size, just analyze normally
  if (conversations.length <= chunkSize) {
    console.log(`Conversation count (${conversations.length}) is within chunk size, analyzing normally`);
    return await analyzeConversations(conversations);
  }

  let combinedResults = {
    frequentlyAskedQuestions: [],
    avgRatingPerTopic: [],
    avgScorePerTopic: [],
    correlations: {},
    trainingSize: 0,
    testingSize: 0,
    validTrainingSize: 0,
    validTestingSize: 0
  };

  // Process conversations in chunks
  for (let i = 0; i < conversations.length; i += chunkSize) {
    const chunk = conversations.slice(i, i + chunkSize);
    const chunkNumber = Math.floor(i / chunkSize) + 1;
    const totalChunks = Math.ceil(conversations.length / chunkSize);

    console.log(`Processing text analysis chunk ${chunkNumber}/${totalChunks} (${chunk.length} conversations)`);

    try {
      // Analyze this chunk
      const chunkResults = await analyzeConversations(chunk);

      if (chunkResults && !chunkResults.error) {
        // Merge results from this chunk
        if (chunkResults.frequentlyAskedQuestions) {
          combinedResults.frequentlyAskedQuestions.push(...chunkResults.frequentlyAskedQuestions);
        }

        if (chunkResults.avgRatingPerTopic) {
          combinedResults.avgRatingPerTopic.push(...chunkResults.avgRatingPerTopic);
        }

        if (chunkResults.avgScorePerTopic) {
          combinedResults.avgScorePerTopic.push(...chunkResults.avgScorePerTopic);
        }

        // Accumulate training/testing sizes
        combinedResults.trainingSize += chunkResults.trainingSize || 0;
        combinedResults.testingSize += chunkResults.testingSize || 0;
        combinedResults.validTrainingSize += chunkResults.validTrainingSize || 0;
        combinedResults.validTestingSize += chunkResults.validTestingSize || 0;

        // Merge correlations (take the last one for now, could be improved)
        if (chunkResults.correlations) {
          combinedResults.correlations = { ...combinedResults.correlations, ...chunkResults.correlations };
        }

        console.log(`Chunk ${chunkNumber}/${totalChunks} completed successfully`);
      } else {
        console.error(`Chunk ${chunkNumber}/${totalChunks} failed:`, chunkResults?.error || "Unknown error");
      }
    } catch (error) {
      console.error(`Error processing chunk ${chunkNumber}/${totalChunks}:`, error.message);
      // Continue with next chunk even if this one fails
    }

    // Add delay between chunks to prevent CPU overload
    if (i + chunkSize < conversations.length) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between chunks

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  // Post-process combined results
  console.log("Post-processing combined text analysis results...");

  // Deduplicate and sort FAQs by frequency, then limit to top 5
  if (combinedResults.frequentlyAskedQuestions.length > 0) {
    const faqMap = new Map();
    combinedResults.frequentlyAskedQuestions.forEach(faq => {
      const key = faq.question.toLowerCase().trim();
      if (faqMap.has(key)) {
        const existing = faqMap.get(key);
        existing.frequency += faq.frequency;
        // Recalculate percentage based on combined frequency
        existing.percentage = existing.frequency; // Will be recalculated below
      } else {
        faqMap.set(key, { ...faq });
      }
    });

    // Sort by frequency and take top 5
    const sortedFAQs = Array.from(faqMap.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5); // Limit to top 5 FAQs

    // Recalculate percentages for the top 5 based on total conversations processed
    const totalConversations = combinedResults.trainingSize + combinedResults.testingSize;
    if (totalConversations > 0) {
      sortedFAQs.forEach(faq => {
        faq.percentage = ((faq.frequency / totalConversations) * 100).toFixed(1);
      });
    }

    combinedResults.frequentlyAskedQuestions = sortedFAQs;
    console.log(`Combined and limited FAQs to top 5 from ${faqMap.size} unique questions`);
  }

  // Merge topic ratings by averaging
  if (combinedResults.avgRatingPerTopic.length > 0) {
    const topicRatingMap = new Map();
    combinedResults.avgRatingPerTopic.forEach(topic => {
      if (topicRatingMap.has(topic.topic)) {
        const existing = topicRatingMap.get(topic.topic);
        // Weighted average based on count
        const totalCount = existing.count + topic.count;
        const weightedAvg = (existing.averageRating * existing.count + topic.averageRating * topic.count) / totalCount;
        existing.averageRating = weightedAvg;
        existing.count = totalCount;
      } else {
        topicRatingMap.set(topic.topic, { ...topic });
      }
    });
    combinedResults.avgRatingPerTopic = Array.from(topicRatingMap.values());
  }

  // Merge topic scores by averaging
  if (combinedResults.avgScorePerTopic.length > 0) {
    const topicScoreMap = new Map();
    combinedResults.avgScorePerTopic.forEach(topic => {
      if (topicScoreMap.has(topic.topic)) {
        const existing = topicScoreMap.get(topic.topic);
        // Weighted average based on count
        const totalCount = existing.count + topic.count;
        const weightedAvg = (existing.averageScore * existing.count + topic.averageScore * topic.count) / totalCount;
        existing.averageScore = weightedAvg;
        existing.count = totalCount;
      } else {
        topicScoreMap.set(topic.topic, { ...topic });
      }
    });
    combinedResults.avgScorePerTopic = Array.from(topicScoreMap.values());
  }

  console.log(`Chunked text analysis completed. Combined results: ${combinedResults.frequentlyAskedQuestions.length} FAQs, ${combinedResults.avgRatingPerTopic.length} rating topics, ${combinedResults.avgScorePerTopic.length} score topics`);

  return combinedResults;
}

/**
 * Initialize scheduled uploads processor
 * @param {Object} pool - Database connection pool
 */
export function initializeScheduledUploadsProcessor(pool) {
  // Process scheduled uploads every minute
  setInterval(async () => {
    try {
      const result = await processScheduledUploads(pool);
      if (result.processed > 0) {
        console.log(`Scheduled uploads processor: processed ${result.processed} uploads`);
        result.uploads.forEach(upload => {
          if (upload.success) {
            console.log(`✓ Successfully processed: "${upload.title}" (ID: ${upload.id})`);
          } else {
            console.log(`✗ Failed to process: "${upload.title}" (ID: ${upload.id}) - ${upload.error}`);
          }
        });
      }
    } catch (error) {
      console.error('Error in scheduled uploads processor:', error);
    }
  }, 60000);

  console.log('Scheduled uploads processor initialized');
}