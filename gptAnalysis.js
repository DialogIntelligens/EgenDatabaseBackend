import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Get system prompt for GPT analysis based on language
 * @param {string} language - Language code (da, en, sv, etc.)
 * @returns {string} - Language-appropriate system prompt
 */
function getSystemPromptForLanguage(language = 'en') {
  const prompts = {
    da: "Du er en ekspert chatbot analytiker og forretningskonsulent, der leverer løsningsorienterede, datadrevne indsigter til forretningsrapporter. Din analyse vil blive gengivet i en PDF-rapport ved hjælp af markdown-formatering:\n\n1. Brug korrekte markdown-overskrifter med # symboler (f.eks. # Ledelses Resume) til sektionstitle\n2. Efter hver sektionsoverskrift skal du tilføje et detaljeret afsnit med analyse\n3. Brug **fed formatering** inden for afsnit for at fremhæve nøgletal og vigtige fund\n4. Brug korrekt markdown liste formatering (1. Punkt et, 2. Punkt to) til nummererede lister\n5. FOKUS PÅ LØSNINGER: I stedet for at kritisere chatbotten, foreslå konkrete forbedringer og forretningsmulighedder\n6. FORESLÅ UPSELLING: Når du identificerer udfordringer, foreslå hvordan live chat, premium support eller andre tjenester kan skabe værdi\n7. VÆR KONSTRUKTIV: Præsenter data som muligheder for vækst og forbedring, ikke som problemer\n8. FOKUS PÅ KUNDEOPLEVELSE: Foreslå forbedringer der direkte gavner kunden (hurtigere svar, bedre support, live chat adgang)\n9. UNDGÅ IRRELEVANTE FORSLAG: Fokuser på kundeservice og supportforbedringer, ikke på produktsortiment eller tekniske detaljer\n10. STRUKTUR KRAV: Opret præcis DISSE to afsnit:\n    - # Forretningsindsigter: Inkluder KUN disse underafsnit: ## Sammenfatning af performance (fokus på positive metrics og achievements) og ## Styrker og vækstmuligheder (fokus på business opportunities og upselling). UNDLAD enhver diskussion af friktion, negative korrelationer, n-grams eller tekniske problemer. Brug kundevenligt sprog.\n    - # Chatbot Forbedringer: Her placeres AL teknisk feedback - inklusive friktion-analyse, negative korrelationer, n-grams diskussion og alle tekniske forbedringer\n11. VIGTIGT: Skriv HELE analysen på dansk. Brug danske forretningstermer og udtryk.",
    
    en: "You are an expert chatbot analyst and business consultant who provides solution-oriented, data-driven insights for business reports. Your analysis will be rendered in a PDF report using markdown formatting:\n\n1. Use proper markdown headings with # symbols (e.g., # Executive Summary) for section titles\n2. After each section header, add a detailed paragraph with analysis\n3. Use **bold formatting** within paragraphs to highlight key metrics and important findings\n4. Use proper markdown list formatting (1. Item one, 2. Item two) for numbered lists\n5. FOCUS ON SOLUTIONS: Instead of criticizing the chatbot, suggest concrete improvements and business opportunities\n6. SUGGEST UPSELLING: When you identify challenges, propose how live chat, premium support, or other services could create value\n7. BE CONSTRUCTIVE: Present data as opportunities for growth and improvement, not as problems\n8. FOCUS ON CUSTOMER EXPERIENCE: Suggest improvements that directly benefit customers (faster responses, better support, live chat access)\n9. AVOID IRRELEVANT SUGGESTIONS: Focus on customer service and support improvements, not product assortment or technical details\n10. STRUCTURE REQUIREMENT: Create exactly THESE two sections:\n    - # Business Insights: Include ONLY these subsections: ## Performance Summary (focus on positive metrics and achievements) and ## Strengths and Growth Opportunities (focus on business opportunities and upselling). EXCLUDE any discussion of friction, negative correlations, n-grams, or technical problems. Use customer-friendly language.\n    - # Chatbot Improvements: Place ALL technical feedback here - including friction analysis, negative correlations, n-grams discussion, and all technical improvements\n11. IMPORTANT: Write the ENTIRE analysis in English using professional business terminology.",
    
    sv: "Du är en expert chatbot-analytiker och affärskonsult som tillhandahåller lösningsorienterade, datadrivna insikter för affärsrapporter. Din analys kommer att renderas i en PDF-rapport med markdown-formatering:\n\n1. Använd rätt markdown-rubriker med # symboler (t.ex. # Sammanfattning) för sektionstitel\n2. Efter varje sektionsrubrik, lägg till ett detaljerat stycke med analys\n3. Använd **fet formatering** inom stycken för att framhäva nyckelmått och viktiga fynd\n4. Använd korrekt markdown listformatering (1. Punkt ett, 2. Punkt två) för numrerade listor\n5. FOKUSERA PÅ LÖSNINGAR: Istället för att kritisera chatbotten, föreslå konkreta förbättringar och affärsmöjligheter\n6. FÖRESLÅ MERFÖRSÄLJNING: När du identifierar utmaningar, föreslå hur livechatt, premiumsupport eller andra tjänster kan skapa värde\n7. VAR KONSTRUKTIV: Presentera data som möjligheter för tillväxt och förbättring, inte som problem\n8. FOKUSERA PÅ KUNDUPPLEVELSE: Föreslå förbättringar som direkt gynnar kunder (snabbare svar, bättre support, livechatt-åtkomst)\n9. UNDVIK IRRELEVANTA FÖRSLAG: Fokusera på kundservice och supportförbättringar, inte på produktsortiment eller tekniska detaljer\n10. STRUKTUR KRAV: Skapa exakt DESSA två avsnitt:\n    - # Affärsinsikter: Inkludera ENDAST dessa underavsnitt: ## Prestanda Sammanfattning (fokus på positiva mått och prestationer) och ## Styrkor och Tillväxtmöjligheter (fokus på affärsmöjligheter och merförsäljning). EXKLUDERA all diskussion om friktion, negativa korrelationer, n-grams eller tekniska problem. Använd kundvänligt språk.\n    - # Chatbot Förbättringar: Placera ALL teknisk feedback här - inklusive friktionsanalys, negativa korrelationer, n-grams diskussion och alla tekniska förbättringar\n11. VIKTIGT: Skriv HELA analysen på svenska. Använd svenska affärstermer och uttryck."
  };
  
  return prompts[language] || prompts['en'];
}

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
 * @param {string} language - Language code for the analysis (da, en, sv, etc.)
 * @returns {Promise<string>} - The GPT analysis text
 */
export async function generateGPTAnalysis(statisticsData, timePeriod, conversationContents = [], maxConversations = 10, progressCallback = null, language = 'en', selectedEmne = null) {
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
      companyInfo,
      textAnalysis,
      emneData,
      topicDistribution
    } = statisticsData;

    // Construct prompt with all available data
    let prompt = `Please analyze the following chatbot statistics data for ${timeFrame}${selectedEmne ? ` specifically for the topic "${selectedEmne}"` : ''} and provide a concise executive summary with key insights and recommendations in 3-4 paragraphs.

    Your job is primarely to provide insight on how the buisness itself can be proven, not how the chatbot can be improved unless there is something obvious realted to the chatbot.
    Generaly you should lean more towards giving insights rather than giving concrete advice or recommendations, as you do not have suffiecient information about the buisness to give good advice.
    The reader of the report is a business owner who/employ whos website the chatbot is integrated on (the chatbot was made by Dialog Intelligens an external company).
    In doing this consider that the data you have is from a customer service chatbot that is integrated on the website.
    Only write insights that are actually very evident from the data. It is no problem if the only thing you write is just "I do not see any clear patterns".
    I want whatever you tell me to be very concrete and actionable.
    Use examples from the conversation data to support your insights.
    In general make sure to give the reader the impression that the chatbot is doing a good job and is valuable for the company.
    ${selectedEmne ? `\n\nNOTE: This analysis is focused specifically on conversations related to the topic "${selectedEmne}". All data and insights should be interpreted within this context.\n` : ''}

    ${companyInfo ? `COMPANY CONTEXT:\n${companyInfo}\n\n` : ''}
    FORMATTING INSTRUCTIONS:
    - You can use markdown-style bold formatting by enclosing text in double asterisks (e.g., **important text**).
    - Use bold formatting for headings, key metrics, and important insights to improve readability.
    - Don't overuse bold - only highlight the most important parts.
    - Do not use bold in your lists.

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

Do not mention the amount of people that have rated the chatbot unless very relevant, only mention the average rating.
`;

    // Add topic distribution data if available
    if (emneData && emneData.labels && emneData.labels.length > 0) {
      prompt += `\nTOPIC DISTRIBUTION:\n`;
      // emneData contains processed chart data with percentages
      for (let i = 0; i < emneData.labels.length; i++) {
        const label = emneData.labels[i];
        const percentage = emneData.datasets[0].data[i];
        prompt += `- ${label}: ${percentage}%\n`;
      }
    } else if (topicDistribution && topicDistribution.length > 0) {
      // Fallback to raw topic count data if chart data isn't available
      prompt += `\nTOPIC DISTRIBUTION:\n`;
      
      const totalCount = topicDistribution.reduce((sum, [_, count]) => sum + count, 0);
      topicDistribution.forEach(([topic, count]) => {
        const percentage = ((count / totalCount) * 100).toFixed(1);
        prompt += `- ${topic}: ${percentage}% (${count} conversations)\n`;
      });

      prompt += `
      Give the most attention to the topics that are the most frequent.
      `;
    }

    // Add text analysis data if available
    if (textAnalysis) {
      prompt += `\nTEXT ANALYSIS:\n`;
      
      // Add FAQ info if available
      if (textAnalysis.faqInfo) {
        prompt += `FAQ analysis includes: ${textAnalysis.faqInfo.description}\n`;
      }
      
      // Add topic data if available - include all available topics
      if (textAnalysis.avgRatingPerTopic && textAnalysis.avgRatingPerTopic.length > 0) {
        prompt += "Topics by Customer Rating:\n";
        textAnalysis.avgRatingPerTopic.forEach(topic => {
          prompt += `- ${topic.topic}: ${topic.averageRating ? topic.averageRating.toFixed(2) : 'N/A'} (${topic.count} ratings)\n`;
        });
      }
      
      // Add FAQ data instead of correlations
      if (textAnalysis.frequentlyAskedQuestions && textAnalysis.frequentlyAskedQuestions.length > 0) {
        prompt += "\nMost Frequently Asked Questions:\n";
        textAnalysis.frequentlyAskedQuestions.forEach((faq, idx) => {
          prompt += `${idx + 1}. "${faq.question}" (asked ${faq.frequency} times, ${faq.percentage}% of conversations)\n`;
        });
        
        prompt += `\nThese FAQs represent the most common customer inquiries. Use this information to provide insights about:
1. What customers are most concerned about
2. Areas where the business could improve self-service information
3. Common pain points or interests that drive customer engagement
4. Opportunities for proactive communication or FAQ sections on the website
`;
      }

      prompt += `
      If this data is relevant and have clear patterns please give some insights to the user.
      Ideas for insights that might be relevant to the user:
      1. A short executive summary of chatbot performance
      2. Key insights about user engagement and satisfaction
      3. Data-driven insights for improvement based on common customer questions
      4. Any notable patterns or trends in customer inquiries that should be addressed
      5. Business opportunities based on frequently asked questions
      Do not write anything that is not directly supported by the data.
      
      Be aware that the FAQ analysis has been based on user questions, showing what customers are most concerned about.
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
              content: getSystemPromptForLanguage(language)
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