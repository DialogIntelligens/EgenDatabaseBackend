import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Extract the actual unanswered question from a conversation
 * @param {Object} conversation - The conversation object with conversation_data
 * @returns {Promise<string>} - The actual question(s) that couldn't be answered
 */
export async function extractUnansweredQuestion(conversation) {
  try {
    // Build the conversation text from conversation_data
    let conversationText = '';
    
    if (conversation.conversation_data && Array.isArray(conversation.conversation_data)) {
      conversationText = conversation.conversation_data
        .map((msg, index) => {
          const role = msg.isUser ? 'User' : 'Assistant';
          // Remove HTML tags and markers for cleaner analysis
          const cleanText = msg.text
            .replace(/<[^>]*>/g, '')
            .replace(/XXX[\s\S]*?YYY/g, '[Product Info]')
            .replace(/%%/g, '')
            .trim();
          return `${role}: ${cleanText}`;
        })
        .join('\n\n');
    }

    if (!conversationText) {
      return 'Could not extract conversation content for analysis.';
    }

    // Call OpenAI to extract the actual unanswered question
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at identifying unanswered customer questions in conversations. Your job is to extract the exact question(s) that the assistant could not answer.

Instructions:
1. Find the user's question(s) that the assistant was unable to answer adequately
2. Return ONLY the actual question text from the user - do not paraphrase or summarize
3. If there are multiple unanswered questions, combine them with line breaks
4. Do not add any commentary, explanation, or additional text
5. Keep the original language and wording exactly as the user asked it
6. If the question is asked in different ways, return the clearest/most complete version

Example output format:
"Hvad er jeres returpolitik for brugte produkter?"

or if multiple questions:
"Hvad er jeres returpolitik for brugte produkter?
Kan jeg få refundering hvis jeg har åbnet pakken?"`
        },
        {
          role: 'user',
          content: `Extract the unanswered question(s) from this conversation:\n\n${conversationText}`
        }
      ],
      temperature: 0.3,
      max_tokens: 200
    });

    const unansweredQuestion = completion.choices[0].message.content.trim();
    return unansweredQuestion;

  } catch (error) {
    console.error('Error extracting unanswered question:', error);
    throw new Error('Failed to extract unanswered question: ' + error.message);
  }
}

/**
 * Service function to extract the unanswered question with database pool
 * @param {number} conversationId - The conversation ID to analyze
 * @param {Object} pool - Database connection pool
 * @returns {Promise<Object>} - Result with the unanswered question
 */
export async function getMissingInfoAnalysis(conversationId, pool) {
  try {
    // Fetch the conversation from database
    const result = await pool.query(
      'SELECT id, conversation_data, emne, lacking_info FROM conversations WHERE id = $1',
      [conversationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Conversation not found');
    }

    const conversation = result.rows[0];

    // Check if conversation actually has lacking_info flag
    if (!conversation.lacking_info) {
      return {
        success: false,
        message: 'This conversation is not marked as having missing information'
      };
    }

    // Extract the actual unanswered question
    const question = await extractUnansweredQuestion(conversation);

    return {
      success: true,
      question: question,
      conversationId: conversationId,
      emne: conversation.emne
    };

  } catch (error) {
    console.error('Error in getMissingInfoAnalysis:', error);
    throw error;
  }
}
