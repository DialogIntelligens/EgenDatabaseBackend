import { generateGPTAnalysis } from '../../gptAnalysis.js';
import { generateStatisticsReportTemplate } from '../../reportGeneratorTemplate.js';
import { transformStatisticsForPDF, processConversationsInChunks, analyzeConversationsInChunks } from '../utils/mainUtils.js';

/**
 * Generate a PDF report with optional text analysis and GPT analysis
 * @param {Object} statisticsData - Raw statistics data from frontend
 * @param {string} timePeriod - Time period for the report
 * @param {string|number} chatbot_id - Chatbot ID(s) to generate report for
 * @param {boolean} includeTextAnalysis - Whether to include text analysis
 * @param {boolean} includeGPTAnalysis - Whether to include GPT analysis
 * @param {number} maxConversations - Maximum conversations for GPT analysis
 * @param {string} language - Language for the report
 * @param {string} selectedEmne - Optional topic filter
 * @param {number} userId - User ID for database queries
 * @param {Object} pool - Database connection pool
 * @returns {Buffer} PDF buffer
 */
export async function generateReport(
  statisticsData,
  timePeriod,
  chatbot_id,
  includeTextAnalysis,
  includeGPTAnalysis,
  maxConversations,
  language,
  selectedEmne,
  userId,
  pool
) {
  try {
    console.log('Starting modular report generation...');

    // Get user data including chatbot IDs and company info
    const userResult = await pool.query('SELECT chatbot_ids, company_info FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    // Get company info to pass to GPT analysis
    const companyInfo = userResult.rows[0].company_info;

    // Add company info to statistics data
    if (companyInfo) {
      statisticsData.companyInfo = companyInfo;
    }

    // Get chatbot_id from the request or use user's chatbot IDs
    let chatbotIds;
    if (!chatbot_id || chatbot_id === 'ALL') {
      // Get chatbot IDs from previously fetched user data
      if (!userResult.rows[0].chatbot_ids) {
        throw new Error('No chatbot IDs found for user');
      }
      chatbotIds = userResult.rows[0].chatbot_ids;
    } else {
      // Use the specific chatbot ID
      chatbotIds = [chatbot_id];
    }

    // Prepare date range for analysis based on time period
    let start_date = null;
    let end_date = new Date().toISOString();

    if (timePeriod === '7') {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      start_date = date.toISOString();
    } else if (timePeriod === '30') {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      start_date = date.toISOString();
    } else if (timePeriod === 'yesterday') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      start_date = yesterday.toISOString();
      end_date = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();
    } else if (timePeriod.custom && timePeriod.startDate && timePeriod.endDate) {
      start_date = new Date(timePeriod.startDate).toISOString();
      end_date = new Date(timePeriod.endDate).toISOString();
    }

    // Get text analysis if we have enough data
    let textAnalysisResults = null;
    try {
      console.log("Fetching conversation data for text analysis using streaming/chunked processing...");

      // Implement streaming/chunked processing for conversation data
      const result = await processConversationsInChunks(chatbotIds, selectedEmne, start_date, end_date, pool);
      console.log(`Found ${result.rows.length} conversations with scores for analysis`);

      // Validate and log a sample conversation for debugging
      if (result.rows.length > 0) {
        try {
          const sampleConversation = result.rows[0];
          console.log("Sample conversation ID:", sampleConversation.id);
          console.log("Sample conversation score:", sampleConversation.score);
          console.log("Sample conversation emne:", sampleConversation.emne);
          console.log("Sample conversation emne type:", typeof sampleConversation.emne);

          // Parse and check the conversation_data structure
          const conversationData = typeof sampleConversation.conversation_data === 'string'
            ? JSON.parse(sampleConversation.conversation_data)
            : sampleConversation.conversation_data;

          if (Array.isArray(conversationData)) {
            console.log("Sample conversation structure (first 3 messages):",
              JSON.stringify(conversationData.slice(0, Math.min(3, conversationData.length)), null, 2));

            // Check for expected structure
            const hasUserMessages = conversationData.some(msg => msg && msg.isUser === true);
            console.log("Has user messages:", hasUserMessages);

            // If we don't have the expected structure, try to fix the data
            if (!hasUserMessages) {
              console.log("Conversation data doesn't have isUser property, trying to fix...");

              // Fix the data by inferring structure - assume odd indexes are user messages
              result.rows = result.rows.map(conv => {
                try {
                  let data = typeof conv.conversation_data === 'string'
                    ? JSON.parse(conv.conversation_data)
                    : conv.conversation_data;

                  if (Array.isArray(data)) {
                    // Transform to expected format
                    data = data.map((msg, idx) => {
                      if (typeof msg === 'string') {
                        return { text: msg, isUser: idx % 2 === 1 };
                      } else if (typeof msg === 'object' && msg !== null) {
                        return { ...msg, isUser: msg.isUser !== undefined ? msg.isUser : idx % 2 === 1 };
                      }
                      return msg;
                    });

                    return { ...conv, conversation_data: data };
                  }
                } catch (error) {
                  console.warn(`Could not fix conversation ${conv.id}:`, error.message);
                }
                return conv;
              });

              console.log("Data transformation applied");
            }
          } else {
            console.log("Conversation data is not an array");
          }
        } catch (validateError) {
          console.error("Error validating conversation data:", validateError);
        }
      }

      if (result.rows.length >= 10) {
        // We have enough data for analysis - use chunked processing for text analysis
        console.log("Performing chunked text analysis on conversation data...");
        console.log("Using CPU throttling to prevent server overload. This may take a bit longer but ensures stability.");

        // Process text analysis in chunks to prevent memory/CPU overload
        textAnalysisResults = await analyzeConversationsInChunks(result.rows);

        if (textAnalysisResults && !textAnalysisResults.error) {
          console.log("Text analysis completed successfully");
          console.log(`Training size: ${textAnalysisResults.trainingSize}, Testing size: ${textAnalysisResults.testingSize}`);
          console.log(`Valid training: ${textAnalysisResults.validTrainingSize}, Valid testing: ${textAnalysisResults.validTestingSize}`);

          // Verify we have data for the report
          const hasFAQs = textAnalysisResults.frequentlyAskedQuestions?.length > 0;

          console.log(`FAQs found: ${hasFAQs ? textAnalysisResults.frequentlyAskedQuestions.length : 0}`);
          if (hasFAQs) {
            console.log("Sample FAQs:", textAnalysisResults.frequentlyAskedQuestions.slice(0, 2).map(faq => faq.question));
          }
        } else {
          console.log("Text analysis error:", textAnalysisResults?.error || "Unknown error");
        }
      } else {
        console.log("Insufficient conversation data for text analysis");
      }
    } catch (error) {
      console.error('Error performing text analysis:', error);
      // Continue with report generation even if analysis fails
    }

    // Include text analysis in the statistics data if available and requested
    if (includeTextAnalysis && textAnalysisResults && !textAnalysisResults.error) {
      console.log("Adding text analysis results to statistics data");
      statisticsData.textAnalysis = textAnalysisResults;
      statisticsData.includeTextAnalysis = true;
    } else {
      console.log("Text analysis not requested or not available");
    }

    // Generate GPT analysis if requested
    if (includeGPTAnalysis) {
      try {
        console.log("Generating GPT analysis...");

        // Fetch conversation content if maxConversations > 0
        let conversationContents = [];
        if (maxConversations > 0) {
          console.log(`Fetching up to ${maxConversations} conversations for GPT analysis using chunked processing...`);

          try {
            // Use chunked processing for GPT analysis conversations too
            const chunkSize = Math.min(maxConversations, 200); // Process in smaller chunks for GPT
            const result = await processConversationsInChunks(chatbotIds, selectedEmne, start_date, end_date, pool, chunkSize);

            // Limit to maxConversations after chunked loading
            const limitedResults = result.rows.slice(0, maxConversations);
            console.log(`Fetched ${limitedResults.length} conversations for GPT analysis (limited from ${result.rows.length} total)`);

            // Process conversations
            conversationContents = limitedResults.map(conv => {
              const topic = conv.emne || 'Uncategorized';
              const score = conv.score || 'No score';
              const rating = conv.customer_rating || 'No rating';

              // Parse conversation data
              let messages = [];
              try {
                if (typeof conv.conversation_data === 'string') {
                  messages = JSON.parse(conv.conversation_data);
                } else {
                  messages = conv.conversation_data;
                }

                if (!Array.isArray(messages)) {
                  messages = [];
                }

                // Format messages
                const formattedMessages = messages
                  .filter(msg => msg && msg.text)
                  .map(msg => {
                    return {
                      text: msg.text,
                      isUser: msg.isUser === true
                    };
                  });

                return {
                  id: conv.id,
                  date: new Date(conv.created_at).toISOString(),
                  topic,
                  score,
                  rating,
                  messages: formattedMessages
                };
              } catch (error) {
                console.error(`Error processing conversation ${conv.id}:`, error.message);
                return {
                  id: conv.id,
                  date: new Date(conv.created_at).toISOString(),
                  topic,
                  score,
                  rating,
                  messages: [],
                  error: 'Error parsing conversation data'
                };
              }
            });
          } catch (convError) {
            console.error('Error fetching conversations for GPT analysis:', convError);
          }
        }

        // Create a progress tracking function for GPT analysis
        const gptProgressTracker = (status, percent) => {
          console.log(`GPT Analysis progress: ${status} (${percent}%)`);
        };

        try {
          // Pass progress tracker and maxConversations to GPT analysis
          const gptAnalysis = await generateGPTAnalysis(
            statisticsData,
            timePeriod,
            conversationContents,
            maxConversations,
            gptProgressTracker,
            language || 'en',  // Add language parameter
            selectedEmne  // Add selected emne filter
          );

          if (gptAnalysis) {
            console.log("GPT analysis generated successfully");
            statisticsData.gptAnalysis = gptAnalysis;
          } else {
            console.log("Failed to generate GPT analysis");
          }

        } catch (gptError) {
          console.error('Error generating GPT analysis:', gptError);
          // Add fallback content for the PDF if GPT analysis fails
          statisticsData.gptAnalysis = "GPT analysis could not be generated due to technical limitations. " +
            "Please try again with a smaller dataset or fewer conversations.";
          // Continue with report generation even if GPT analysis fails
        }
      } catch (gptError) {
        console.error('Error generating GPT analysis:', gptError);
        // Continue with report generation even if GPT analysis fails
      }
    }

    // Generate the PDF report using template-based generator with fallback
    console.log("Generating PDF report with template...");
    try {
      // Transform raw statistics data into template-friendly format
      const transformedStatisticsData = transformStatisticsForPDF(statisticsData);

      const pdfBuffer = await generateStatisticsReportTemplate(transformedStatisticsData, timePeriod, language || 'en');
      console.log("Template-based PDF report generated successfully, size:", pdfBuffer.length, "bytes");

      return pdfBuffer;
    } catch (error) {
      console.error('Error generating PDF report:', error);
      throw new Error(`Failed to generate report: ${error.message}`);
    }
  } catch (error) {
    console.error('Error in report generation service:', error);
    throw error;
  }
}
