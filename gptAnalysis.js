import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate GPT analysis for statistics report
 * @param {Object} statisticsData - The statistics data for analysis
 * @param {string} timePeriod - The time period for the report
 * @returns {Promise<string>} - The GPT analysis text
 */
export async function generateGPTAnalysis(statisticsData, timePeriod) {
  try {
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

    // Extract relevant metrics for the prompt
    const { 
      totalMessages,
      averageMessagesPerDay, 
      totalConversations, 
      totalCustomerRatings,
      averageCustomerRating,
      thumbsRating,
      totalVisitors,
      overallConversionRate,
      chatbotConversionRate,
      nonChatbotConversionRate,
      showPurchase,
      textAnalysis
    } = statisticsData;

    // Construct prompt with all available data
    let prompt = `Please analyze the following chatbot statistics data for ${timeFrame} and provide a concise executive summary with key insights and recommendations in 3-4 paragraphs.

STATISTICS SUMMARY:
- Total Messages: ${totalMessages}
- Average Messages Per Day: ${averageMessagesPerDay}
- Total Conversations: ${totalConversations}
- Total User Ratings: ${totalCustomerRatings}
- ${thumbsRating ? 'Thumbs Up Percentage' : 'Average Rating'}: ${averageCustomerRating}
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
      
      // Add topic data if available
      if (textAnalysis.avgRatingPerTopic && textAnalysis.avgRatingPerTopic.length > 0) {
        prompt += "Top Topics by Customer Rating:\n";
        textAnalysis.avgRatingPerTopic.slice(0, 5).forEach(topic => {
          prompt += `- ${topic.topic}: ${topic.averageRating ? topic.averageRating.toFixed(2) : 'N/A'} (${topic.count} ratings)\n`;
        });
      }
      
      // Add positive correlations
      if (textAnalysis.positiveCorrelations && textAnalysis.positiveCorrelations.length > 0) {
        prompt += "\nTop Positively Correlated N-grams (terms associated with higher scores):\n";
        textAnalysis.positiveCorrelations.slice(0, 5).forEach((item, idx) => {
          prompt += `- "${item.ngram}" (correlation: ${item.correlation.toFixed(3)})\n`;
        });
      }
      
      // Add negative correlations
      if (textAnalysis.negativeCorrelations && textAnalysis.negativeCorrelations.length > 0) {
        prompt += "\nTop Negatively Correlated N-grams (terms associated with lower scores):\n";
        textAnalysis.negativeCorrelations.slice(0, 5).forEach((item, idx) => {
          prompt += `- "${item.ngram}" (correlation: ${item.correlation.toFixed(3)})\n`;
        });
      }
    }

    prompt += `
Based on this data, please provide:
1. A short executive summary of chatbot performance
2. Key insights about user engagement and satisfaction
3. Data-driven recommendations for improvement
4. Any notable patterns or trends that should be addressed

Format your response as a professional report section with clear paragraphs. Keep your analysis concise, insightful, and actionable.`;

    // Call OpenAI API for analysis
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert chatbot analyst who provides concise, data-driven insights for business reports."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    // Return the analysis text
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating GPT analysis:', error);
    return "GPT analysis could not be generated due to an error. Please check the statistics data for more information.";
  }
} 