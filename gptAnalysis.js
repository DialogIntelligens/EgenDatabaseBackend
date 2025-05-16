import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Simple delay function for throttling
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} - Resolves after delay
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Process items in batches with throttling
 * @param {Array} items - Array of items to process
 * @param {Function} processFn - Function to process each batch
 * @param {number} batchSize - Size of each batch
 * @param {number} delayMs - Delay between batches in milliseconds
 * @returns {Promise<Array>} - Results from all batches
 */
async function processWithThrottling(items, processFn, batchSize = 5, delayMs = 100) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processFn(batch);
    results.push(...batchResults);
    
    // Add a small delay to prevent CPU spikes
    if (i + batchSize < items.length) {
      await delay(delayMs);
    }
  }
  
  return results;
}

/**
 * Trim a message to a maximum length while preserving meaning
 * @param {string} text - Text to trim
 * @param {number} maxLength - Maximum length
 * @returns {string} - Trimmed text
 */
function trimMessage(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength) + '...';
}

/**
 * Generate GPT analysis for statistics report
 * @param {Object} statisticsData - The statistics data for analysis
 * @param {string} timePeriod - The time period for the report
 * @param {Array} conversationContents - Array of conversation content for deeper analysis
 * @param {number} maxConversations - Maximum number of conversations to include (10-100)
 * @param {Function} progressCallback - Optional callback for reporting progress
 * @returns {Promise<string>} - The GPT analysis text
 */
export async function generateGPTAnalysis(statisticsData, timePeriod, conversationContents = [], maxConversations = 10, progressCallback = null) {
  try {
    // Report initial progress
    if (progressCallback) {
      progressCallback("Starting GPT analysis", 0);
    }

    // Format time period for prompt
    let timeFrame;
    if (timePeriod === 'all') {
      timeFrame = 'all time';
    } else if (timePeriod === '7') {
      timeFrame = 'the last 7 days';
    } else if (timePeriod === '30') {
      timeFrame = 'the last 30 days';
    } else if (timePeriod === 'yesterday') {
      timeFrame = 'yesterday';
    } else if (timePeriod.custom) {
      timeFrame = `the period from ${new Date(timePeriod.startDate).toLocaleDateString()} to ${new Date(timePeriod.endDate).toLocaleDateString()}`;
    } else {
      timeFrame = 'the specified time period';
    }

    // Progress update - prompt preparation
    if (progressCallback) {
      progressCallback("Preparing data for analysis", 20);
    }

    // Extract relevant metrics for the prompt
    const { 
      totalMessages,
      averageMessagesPerDay, 
      totalConversations, 
      totalCustomerRatings,
      averageCustomerRating,
      csatScore,
      thumbsRating,
      totalVisitors,
      overallConversionRate,
      chatbotConversionRate,
      nonChatbotConversionRate,
      showPurchase,
      companyInfo,
      textAnalysis
    } = statisticsData;

    // Construct prompt with all available data
    let prompt = `Please analyze the following chatbot statistics data for ${timeFrame} and provide a concise executive summary with key insights and recommendations in 3-4 paragraphs.

    Your job is primarely to provide insight on how the buisness itself can be proven, not how the chatbot can be improved unless there is something obvious realted to the chatbot.
    Generaly you should lean more towards giving insights rather than giving concrete advice or recommendations, as you do not have suffiecient information about the buisnessto give good advice.
    The reader of the report is a business owner who/employ whos website the chatbot is integrated on (the chatbot was made by Dialog Intelligens an external company).
    In doing this consider that the data you have is from a customer service chatbot that is integrated on the website.
    Only write insights that are actually very evident from the data. It is no problem if the only thing you write is just "I do not see any clear patterns".
    I want whatever you tell me to be very concrete and actionable.
    Use examples from the conversation data to support your insights.

    ${companyInfo ? `COMPANY CONTEXT:\n${companyInfo}\n\n` : ''}
    FORMATTING INSTRUCTIONS:
    - You can use markdown-style bold formatting by enclosing text in double asterisks (e.g., **important text**).
    - Use bold formatting for headings, key metrics, and important insights to improve readability.
    - Don't overuse bold - only highlight the most important parts.

    Context about the data you are about to see:
    - The User ratings are based on a scale of 1-5, they come from the users of the chatbot who get the option to rate a conversation after a given time of inactivity in the chat.
    - The Score is a score from 1-10 gven by an AI model that has been trained to estimate the user satisfaction of each conversation.

STATISTICS SUMMARY:
- Total Messages: ${totalMessages}
- Average Messages Per Day: ${averageMessagesPerDay}
- Total Conversations: ${totalConversations}
- Total User Ratings: ${totalCustomerRatings}
- ${thumbsRating ? 'Thumbs Up Percentage' : 'Average Rating'}: ${averageCustomerRating}
${csatScore ? `- Customer Satisfaction (CSAT): ${csatScore}` : ''}
`;

    // Add conversion statistics if applicable
    if (showPurchase) {
      prompt += `
CONVERSION METRICS:
- Total Visitors: ${totalVisitors}
- Overall Conversion Rate: ${overallConversionRate}%
- Chatbot Conversion Rate: ${chatbotConversionRate}%
- Non-Chatbot Conversion Rate: ${nonChatbotConversionRate}%
`;
    }

    // Add text analysis data if available
    if (textAnalysis) {
      prompt += `\nTEXT ANALYSIS:\n`;
      
      // Add n-gram info if available
      if (textAnalysis.ngramInfo) {
        prompt += `N-gram analysis includes: ${textAnalysis.ngramInfo.description}\n`;
      }
      
      // Add topic data if available - include all available topics
      if (textAnalysis.avgRatingPerTopic && textAnalysis.avgRatingPerTopic.length > 0) {
        prompt += "Topics by Customer Rating:\n";
        textAnalysis.avgRatingPerTopic.forEach(topic => {
          prompt += `- ${topic.topic}: ${topic.averageRating ? topic.averageRating.toFixed(2) : 'N/A'} (${topic.count} ratings)\n`;
        });
      }
      
      // Add positive correlations - include all available
      if (textAnalysis.positiveCorrelations && textAnalysis.positiveCorrelations.length > 0) {
        prompt += "\nPositively Correlated N-grams (terms associated with higher scores, max 15 strongest):\n";
        textAnalysis.positiveCorrelations.forEach((item, idx) => {
          prompt += `- "${item.ngram}" (correlation: ${item.correlation.toFixed(3)})\n`;
        });
      }
      
      // Add negative correlations - include all available
      if (textAnalysis.negativeCorrelations && textAnalysis.negativeCorrelations.length > 0) {
        prompt += "\nNegatively Correlated N-grams (terms associated with lower scores, max 15 strongest):\n";
        textAnalysis.negativeCorrelations.forEach((item, idx) => {
          prompt += `- "${item.ngram}" (correlation: ${item.correlation.toFixed(3)})\n`;
        });
      }

      prompt += `
      If this data is relevant and have clear patterns please give some insights to the user.
      Ideas for insights that might be relevant to the user:
      1. A short executive summary of chatbot performance
      2. Key insights about user engagement and satisfaction
      3. Data-driven insights for improvement
      4. Any notable patterns or trends that should be addressed
      Do not write anything that is not directly supported by the data or only has low corelation.
      
      Be aware that the text analysis has only been based on user messages, not the chatbot messages.
      `;
    }
    
    // Add conversation content if available with optimized sampling
    if (conversationContents && conversationContents.length > 0) {
      // Progress update - conversation processing
      if (progressCallback) {
        progressCallback(`Processing ${Math.min(maxConversations, conversationContents.length)} conversations for analysis`, 30);
      }

      // Calculate how many conversations to include based on total size
      let maxConvsToInclude = Math.min(maxConversations, conversationContents.length);
      
      prompt += `\nCONVERSATION SAMPLES:\n`;
      prompt += `I am providing ${maxConvsToInclude} conversation samples out of ${conversationContents.length} total conversations for you to analyze deeper patterns and provide insights. Refer to these conversations by giving direct quotes, because the user doesn't know what conersation number it is and hasn't read the conversations. Always answer in danish.\n`;
      
      // Process conversations with throttling to prevent CPU spikes
      const processedConversations = await processWithThrottling(
        conversationContents.slice(0, maxConvsToInclude),
        async (convoBatch) => {
          return convoBatch.map(conv => {
            // For each conversation, create a summarized version
            const convSummary = `\nConversation #${conversationContents.indexOf(conv) + 1} (Topic: ${conv.topic}, Score: ${conv.score}, Rating: ${conv.rating || 'None'}):\n`;
            
            let messagesSummary = '';
            if (conv.messages && conv.messages.length > 0) {
              // For large conversations, sample messages more aggressively
              const maxMessages = conv.messages.length > 20 ? 5 : 8;
              
              // Always include first 2 messages plus a sample of the rest
              const firstMessages = conv.messages.slice(0, 2);
              let remainingMessages = [];
              
              if (conv.messages.length > 2) {
                // If more than 2 messages, select a sample of the remaining ones
                const rest = conv.messages.slice(2);
                const step = Math.max(1, Math.floor(rest.length / (maxMessages - 2)));
                
                for (let i = 0; i < rest.length && remainingMessages.length < maxMessages - 2; i += step) {
                  remainingMessages.push(rest[i]);
                }
              }
              
              // Combine first messages with sampled messages
              const sampled = [...firstMessages, ...remainingMessages];
              
              // Process each message with length limiting
              sampled.forEach(msg => {
                messagesSummary += `${msg.isUser ? 'User: ' : 'Chatbot: '}${trimMessage(msg.text, 1500)}\n`;
              });
              
              if (conv.messages.length > sampled.length) {
                messagesSummary += `[${conv.messages.length - sampled.length} more messages not shown...]\n`;
              }
            } else {
              messagesSummary = `[No messages available]\n`;
            }
            
            return convSummary + messagesSummary;
          });
        },
        5, // Process 5 conversations at a time
        100 // Delay 100ms between batches
      );
      
      // Add processed conversations to prompt
      processedConversations.forEach(convoText => {
        prompt += convoText;
      });
      
      if (conversationContents.length > maxConvsToInclude) {
        prompt += `\n[${conversationContents.length - maxConvsToInclude} more conversations available but not included for brevity]\n`;
      }
      
      // Add specific instructions for conversation analysis
      prompt += `\nPlease also include in your analysis:
1. Common patterns in user queries and chatbot responses
2. Potential areas where the chatbot could improve its responses
3. Topics that tend to result in higher or lower user satisfaction
4. Any notable tone, language, or communication style observations
Do not write anything that is not directly supported by the data or only has low corelation.
Do not refer to the conversations by their # number, but by giving direct quotes (the user doesn't know what conersation number it is and hasn't read the conversations).
`;
    }

      // End of prompt
      prompt += `\nThe most important is that you do not sugest anything that is not super clear from the data.
      All insights should be concrete and usefull. Rather write a very short report then a long report that is not useful.
      `;    

    // Progress update - sending to API
    if (progressCallback) {
      progressCallback("Sending to OpenAI for analysis", 50);
    }

    // Calculate a safe token limit based on data size
    // Start with a base value and reduce based on how much data we're analyzing
    let maxCompletionTokens = 100000;

    // Call OpenAI API for analysis with error handling and retries
    let attempt = 0;
    const maxAttempts = 3;
    let response = null;
    
    while (attempt < maxAttempts) {
      try {
        // Add progress update for retry attempts
        if (attempt > 0 && progressCallback) {
          progressCallback(`Retry attempt ${attempt}/${maxAttempts} for OpenAI analysis`, 60);
        }
        
        response = await openai.chat.completions.create({
          model: "o4-mini",
          messages: [
            {
              role: "system",
              content: "You are an expert chatbot analyst who provides concise, data-driven insights for business reports. Your analysis will be rendered in a PDF report with the following formatting guidelines:\n\n1. Use **Bold Headings** as section titles, each on its own line with no text on the same line\n2. After each section header, add a detailed paragraph with analysis for that section\n3. Use **bold formatting** within paragraphs to highlight key metrics and important findings\n4. When creating numbered lists and using bold, always add a space between the number and the bold marker, like this: '1. **Bold text**' (not '1.**Bold text**')\n5. Put one empty line between sections\n6. Keep your analysis evidence-based and focused on actionable insights\n7. Use a maximum of 3-4 distinct sections in your report (Executive Summary, User Engagement, etc.)"
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 1,
          max_completion_tokens: maxCompletionTokens
        });
        
        // If we got a response, break out of retry loop
        break;
      } catch (error) {
        attempt++;
        console.error(`OpenAI API error (attempt ${attempt}/${maxAttempts}):`, error.message);
        
        // If we've reached max attempts, throw the error
        if (attempt >= maxAttempts) {
          throw error;
        }
        
        // Wait before retrying (exponential backoff)
        const backoffDelay = 1000 * Math.pow(2, attempt);
        await delay(backoffDelay);
      }
    }

    // Progress update - processing complete
    if (progressCallback) {
      progressCallback("Analysis complete", 100);
    }

    // Safely extract the analysis text (handle potential response shape variations)
    let analysisText = "";
    if (response && response.choices && response.choices.length > 0) {
      const choice = response.choices[0];
      analysisText =
        (choice.message && choice.message.content) || // Standard Chat completion response
        choice.text || // Legacy completion response
        (choice.delta && choice.delta.content) || // Streaming delta (if no final message provided)
        "";
    }

    // If we still have no content, throw an error so the caller can handle it
    if (!analysisText || analysisText.trim() === "") {
      throw new Error("Empty analysis content returned from OpenAI");
    }

    return analysisText.trim();
  } catch (error) {
    console.error('Error generating GPT analysis:', error);
    
    // Report error in progress
    if (progressCallback) {
      progressCallback("Error in GPT analysis", 100);
    }
    
    return "GPT analysis could not be generated due to an error. Please check the statistics data for more information.";
  }
} 