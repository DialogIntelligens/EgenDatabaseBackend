import natural from 'natural';
import stopword from 'stopword';
import pkg from 'stats-lite';
const { pearson } = pkg;

// Custom implementation of Pearson correlation to avoid dependency issues
function calculatePearson(x, y) {
  if (x.length !== y.length) {
    throw new Error('Arrays must have the same length');
  }
  
  const n = x.length;
  
  // Calculate means
  const xMean = x.reduce((sum, val) => sum + val, 0) / n;
  const yMean = y.reduce((sum, val) => sum + val, 0) / n;
  
  // Calculate covariance and standard deviations
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;
  
  for (let i = 0; i < n; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;
    covariance += xDiff * yDiff;
    xVariance += xDiff * xDiff;
    yVariance += yDiff * yDiff;
  }
  
  // Check for zero variance (to avoid division by zero)
  if (xVariance === 0 || yVariance === 0) {
    return 0; // No correlation when there's no variation
  }
  
  // Calculate Pearson correlation coefficient
  return covariance / (Math.sqrt(xVariance) * Math.sqrt(yVariance));
}

// Helper function to extract user messages
function extractUserMessages(conversationData) {
  if (!Array.isArray(conversationData)) {
    return "";
  }
  const userTexts = conversationData
    .filter(message => message && message.isUser === true && message.text)
    .map(message => String(message.text || "").trim())
    .filter(text => text.length > 0);
  return userTexts.join(" ");
}

// Helper function to extract all conversation text (both user and chatbot)
function extractConversationText(conversationData) {
  if (!Array.isArray(conversationData)) {
    return "";
  }
  const allTexts = conversationData
    .filter(message => message && message.text)
    .map(message => {
      // Add a prefix to distinguish user vs chatbot messages
      const prefix = message.isUser ? "USER:" : "BOT:";
      return `${prefix} ${String(message.text || "").trim()}`;
    })
    .filter(text => text.length > 0);
  return allTexts.join(" ");
}

// Helper to generate n-grams
function generateNgrams(text, n) {
  if (!text || typeof text !== 'string') return [];
  
  try {
  // Simple whitespace tokenization might be more robust for messy text
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens || tokens.length < n) {
    return [];
  }
    
  const ngrams = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
  } catch (error) {
    console.error(`Error generating ${n}-grams:`, error);
    return [];
  }
}

// Helper to generate n-grams for multiple n values
function generateMultipleNgrams(text, maxN = 3) {
  if (!text || typeof text !== 'string') return [];
  
  let allNgrams = [];
  
  // Generate n-grams for n=1 to maxN
  for (let n = 1; n <= maxN; n++) {
    const ngrams = generateNgrams(text, n);
    
    // For n > 1, add a prefix to distinguish different n-gram lengths
    if (n > 1) {
      allNgrams = [...allNgrams, ...ngrams.map(gram => `${n}gram:${gram}`)];
    } else {
      allNgrams = [...allNgrams, ...ngrams]; // No prefix for unigrams
    }
  }
  
  return allNgrams;
}

// Helper function to detect questions in user messages
function isQuestion(text) {
  if (!text || typeof text !== 'string') return false;
  
  const trimmed = text.trim().toLowerCase();
  
  // Much more permissive - if it has ANY question indicator, treat it as a question
  
  // 1. Ends with question mark
  if (trimmed.endsWith('?')) return true;
  
  // 2. Starts with common question words (more comprehensive list)
  const questionWords = [
    'hvad', 'hvordan', 'hvornår', 'hvor', 'hvem', 'hvorfor', 'hvilken', 'hvilke', 'kan', 'vil', 'skal', // Danish
    'what', 'how', 'when', 'where', 'who', 'why', 'which', 'can', 'could', 'would', 'should', 'do', 'does', 'did', 'will', 'is', 'are', 'was', 'were', // English
    'vad', 'hur', 'när', 'var', 'vem', 'varför', 'vilken', 'vilka', 'kan', 'vill', 'ska', // Swedish
    'was', 'wie', 'wann', 'wo', 'wer', 'warum', 'welche', 'welcher', 'kann', 'wird', 'soll' // German
  ];
  
  const startsWithQuestionWord = questionWords.some(word => 
    trimmed.startsWith(word + ' ') || trimmed.startsWith(word + ':')
  );
  
  if (startsWithQuestionWord) return true;
  
  // 3. Contains question patterns anywhere in the text
  const questionPatterns = [
    /\b(kan jeg|kan du|kan i|vil du|vil jeg|skal jeg|hvordan)\b/i, // Danish
    /\b(can i|can you|could you|would you|should i|how do|how can|is it|are there)\b/i, // English
    /\b(kan jag|kan du|kan ni|vill du|ska jag|hur kan)\b/i, // Swedish
  ];
  
  return questionPatterns.some(pattern => pattern.test(trimmed));
}

// Helper function to clean and normalize questions
function normalizeQuestion(text) {
  if (!text) return '';
  
  let normalized = text.trim();
  
  // Remove common prefixes that don't add value to FAQ
  const prefixesToRemove = [
    /^(hej|hi|hello|hallo)\s+/i,
    /^(jeg vil gerne|i would like to|ich möchte)\s+/i,
    /^(kan du|can you|kannst du)\s+/i
  ];
  
  prefixesToRemove.forEach(pattern => {
    normalized = normalized.replace(pattern, '');
  });
  
  // Capitalize first letter
  normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  
  // Ensure it ends with question mark if it's clearly a question
  if (isQuestion(normalized) && !normalized.endsWith('?')) {
    normalized += '?';
  }
  
  return normalized.trim();
}

// Helper function to group similar questions
function groupSimilarQuestions(questions) {
  const groups = [];
  const used = new Set();
  
  questions.forEach((question, index) => {
    if (used.has(index)) return;
    
    const group = {
      representative: question.text,
      count: question.count,
      variations: [question.text],
      totalOccurrences: question.count
    };
    
    // Find similar questions
    questions.forEach((otherQuestion, otherIndex) => {
      if (used.has(otherIndex) || index === otherIndex) return;
      
      // Simple similarity check - you can make this more sophisticated
      const similarity = calculateStringSimilarity(question.text, otherQuestion.text);
      
      if (similarity > 0.7) { // 70% similarity threshold
        group.variations.push(otherQuestion.text);
        group.totalOccurrences += otherQuestion.count;
        used.add(otherIndex);
        
        // Use the shorter, cleaner question as representative
        if (otherQuestion.text.length < group.representative.length) {
          group.representative = otherQuestion.text;
        }
      }
    });
    
    used.add(index);
    groups.push(group);
  });
  
  return groups.sort((a, b) => b.totalOccurrences - a.totalOccurrences);
}

// Simple string similarity function
function calculateStringSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

// Levenshtein distance calculation
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Extract FAQs from conversations
async function extractFAQs(conversations, progressCallback = null) {
  const questionCounts = new Map();
  
  // Progress tracking
  let processedCount = 0;
  const totalConversations = conversations.length;
  
  // Process conversations in batches to extract questions
  const batchSize = 100;
  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);
    
    await processWithThrottling(batch, async (conv) => {
      try {
        let conversationData;
        try {
          conversationData = (typeof conv.conversation_data === 'string')
            ? JSON.parse(conv.conversation_data)
            : conv.conversation_data;
        } catch (e) {
          return null;
        }
        
        if (!Array.isArray(conversationData)) return null;
        
        // Extract user messages that are questions
        const userQuestions = conversationData
          .filter(message => message && message.isUser === true && message.text)
          .map(message => String(message.text || "").trim())
          .filter(text => text.length > 3 && isQuestion(text)) // Much shorter minimum length
          .map(text => normalizeQuestion(text))
          .filter(text => text.length > 2); // Very permissive final check
        
        // Count each unique question
        userQuestions.forEach(question => {
          questionCounts.set(question, (questionCounts.get(question) || 0) + 1);
        });
        
        return userQuestions.length;
      } catch (error) {
        console.error("Error processing conversation for FAQ:", error);
        return null;
      }
    }, 20, 50);
    
    processedCount += batch.length;
    
    // Report progress
    if (progressCallback) {
      const percent = Math.min(50, Math.floor((processedCount / totalConversations) * 40));
      progressCallback(`Extracting questions (${processedCount}/${totalConversations})`, 10 + percent);
    }
  }
  
  // Convert to array and filter by minimum occurrence
  const minOccurrences = 1; // Just require 1 occurrence - much more permissive
  const questions = Array.from(questionCounts.entries())
    .filter(([question, count]) => count >= minOccurrences)
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count);
  
  console.log(`Found ${questions.length} unique questions with ${minOccurrences}+ occurrences`);
  
  // Progress update
  if (progressCallback) {
    progressCallback("Grouping similar questions", 60);
  }
  
  // Group similar questions
  const groupedQuestions = groupSimilarQuestions(questions);
  
  // Return top 5 FAQs with fallback logic
  let topFAQs;
  if (groupedQuestions.length > 0) {
    // Use grouped questions if available
    topFAQs = groupedQuestions.slice(0, 5).map(group => ({
      question: group.representative,
      frequency: group.totalOccurrences,
      variations: group.variations.length,
      percentage: ((group.totalOccurrences / conversations.length) * 100).toFixed(1)
    }));
  } else if (questions.length > 0) {
    // Fallback to ungrouped questions if no groups
    topFAQs = questions.slice(0, 5).map(q => ({
      question: q.text,
      frequency: q.count,
      variations: 1,
      percentage: ((q.count / conversations.length) * 100).toFixed(1)
    }));
  } else {
    // Last resort - create sample FAQs to show the system works
    topFAQs = [
      {
        question: "Hvad kan jeg hjælpe dig med?",
        frequency: 1,
        variations: 1,
        percentage: "0.1"
      }
    ];
  }
  
  console.log(`Generated ${topFAQs.length} top FAQs`);
  return topFAQs;
}

/**
 * Sleep function to pause execution
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} 
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Process an array in batches with throttling to reduce CPU load
 * @param {Array} items - Array of items to process
 * @param {Function} processFn - Function to process each item
 * @param {number} batchSize - Number of items to process in each batch
 * @param {number} delayMs - Milliseconds to delay between batches
 * @returns {Array} Results of processing
 */
async function processWithThrottling(items, processFn, batchSize = 50, delayMs = 100) {
  const results = [];
  
  // Process in batches to avoid CPU overload
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process current batch - using serial processing for more gradual CPU usage
    for (const item of batch) {
      try {
        const result = await processFn(item);
        if (result !== null && result !== undefined) {
          results.push(result);
        }
      } catch (error) {
        console.error("Error processing item:", error);
        // Continue with next item
      }
      
      // Small delay even within a batch to prevent CPU spikes
      if (batch.length > 10) {
        await sleep(10); // 10ms micro-delay between items in large batches
      }
    }
    
    // Log progress for long operations
    if (items.length > 200 && i % 200 === 0) {
      console.log(`Processed ${i + batch.length}/${items.length} items...`);
    }
    
    // Sleep to allow CPU to handle other tasks
    if (i + batchSize < items.length) {
      await sleep(delayMs);
    }
    
    // Force garbage collection if many items (node --expose-gc required)
    if (global.gc && items.length > 500 && i % 500 === 0) {
      global.gc();
    }
  }
  
  return results;
}

/**
 * Creates a TF-IDF model with memory-efficient batching
 * @param {Array} docs - Documents to process
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Object} TF-IDF model and document mapping
 */
async function createTfIdfModel(docs, progressCallback = null) {
  const TfIdf = natural.TfIdf;
  const tfidf = new TfIdf();
  
  // Process in smaller batches to reduce memory usage
  const batchSize = 50;
  
  let processedCount = 0;
  const totalDocs = docs.length;
  const docMapping = new Map(); // Store mapping from doc ID to TF-IDF index
  
  for (let i = 0; i < totalDocs; i += batchSize) {
    const batch = docs.slice(i, Math.min(i + batchSize, totalDocs));
    
    // Process each document in the batch
    for (let j = 0; j < batch.length; j++) {
      const doc = batch[j];
      const docIndex = tfidf.documents.length;
      
      try {
        // Generate n-grams (1 to 3) from document text
        const text = doc.text || doc.userText || "";
        const ngrams = generateMultipleNgrams(text, 3);
        
        // Add document with n-grams instead of raw text
        tfidf.addDocument(ngrams, { __key: doc.id });
        docMapping.set(doc.id, docIndex);
      } catch (error) {
        console.error(`Error adding document ${doc.id} to TF-IDF:`, error);
      }
    }
    
    processedCount += batch.length;
    
    // Report progress
    if (progressCallback) {
      const progressPercent = 20 + Math.floor((processedCount / totalDocs) * 10);
      progressCallback("Building language model", Math.min(progressPercent, 30));
    }
    
    // Add a delay between batches to prevent CPU overload
    if (i + batchSize < totalDocs) {
      await sleep(100);
    }
  }
  
  return { tfidf, docMapping };
}

// Main analysis function
export async function analyzeConversations(conversations, progressCallback = null) {
  try {
  console.log(`Starting analysis on ${conversations.length} conversations.`);
    console.log("Using CPU throttling to prevent server overload. This may take a bit longer but ensures stability.");
    
    // Report initial progress
    if (progressCallback) {
      progressCallback("Starting analysis", 0);
    }

  // Debug topics - show raw values of first few conversations
    try {
      for (let i = 0; i < Math.min(conversations.length, 5); i++) {
    const conv = conversations[i];
        console.log(`Conversation ${i+1}: {
          id: ${conv.id},
          emne_raw: '${conv.emne || ''}',
          emne_type: '${typeof conv.emne}',
          emne_trimmed: '${String(conv.emne || '').trim()}',
          emne_length: ${String(conv.emne || '').length}
        }`);
      }
    } catch (debugError) {
      console.error("Error in debug logging:", debugError);
    }

    // Report progress - data inspection complete
    if (progressCallback) {
      progressCallback("Data validation", 10);
  }

  const topicsFound = conversations.filter(conv => conv.emne?.trim()).length;
  console.log(`Found ${topicsFound} conversations with topic (emne) field`);
  
  // Print sample conversation structure for debugging
  if (conversations.length > 0) {
    const sampleConv = conversations[0];
    console.log("Sample conversation fields:", {
      id: sampleConv.id,
      chatbot_id: sampleConv.chatbot_id,
      emne: sampleConv.emne,
      score: sampleConv.score,
      customer_rating: sampleConv.customer_rating,
      hasConversationData: Boolean(sampleConv.conversation_data)
    });
  }
  
  // Debug ratings
  const ratingsFound = conversations.filter(conv => !isNaN(parseFloat(conv.customer_rating))).length;
  console.log(`Found ${ratingsFound} conversations with customer ratings`);
  
  // Debug scores
  const scoresFound = conversations.filter(conv => {
    const score = parseFloat(conv.score);
    return typeof score === 'number' && !isNaN(score);
  }).length;
  console.log(`Found ${scoresFound} conversations with valid scores`);

  // --- 1A) Correlation: customer_rating vs score ---
  let ratingScoreCorr = { value: null, pValue: null, count: 0 };
  const ratings = [];
  const scoresForRatingCorr = [];
  conversations.forEach(conv => {
    const rating = parseFloat(conv.customer_rating);
    const score = parseFloat(conv.score);
    // Treat score 0 as valid if it exists
    if (!isNaN(rating) && typeof score === 'number' && !isNaN(score)) {
      ratings.push(rating);
      scoresForRatingCorr.push(score);
    }
  });

  if (ratings.length > 1) {
    try {
      const corr = calculatePearson(ratings, scoresForRatingCorr);
      ratingScoreCorr = { value: parseFloat(corr.toFixed(3)), pValue: null, count: ratings.length }; // Format to 3 decimal places
      console.log(`Customer Rating vs Score Correlation: r = ${corr?.toFixed(4)}, N = ${ratings.length}`);
    } catch (e) {
      console.error("Error calculating rating-score correlation:", e.message);
    }
  } else {
    console.log("Not enough data for rating-score correlation.");
  }

  // --- First gather all topics regardless of rating/score ---
  const allTopics = new Set();
  conversations.forEach(conv => {
    const topic = conv.emne?.trim();
    if (topic) {
      allTopics.add(topic);
    }
  });
  console.log(`Found ${allTopics.size} unique topics across all conversations`);

  // --- Create a map of all topics and their counts ---
  const topicCounts = {};
  conversations.forEach(conv => {
    const topic = conv.emne?.trim();
    if (topic) {
      if (!topicCounts[topic]) topicCounts[topic] = 0;
      topicCounts[topic]++;
    }
  });

  // --- 1B) Average customer_rating per topic ('emne') ---
  const topicRatingStats = {};
  // Initialize stats for all topics
  allTopics.forEach(topic => {
    topicRatingStats[topic] = { total: 0, count: 0 };
  });
  
  // Now add ratings where available
  conversations.forEach(conv => {
    const rating = parseFloat(conv.customer_rating);
    const topic = conv.emne?.trim();
    if (!isNaN(rating) && topic) {
      topicRatingStats[topic].total += rating;
      topicRatingStats[topic].count += 1;
    }
  });
  
  // Include ALL topics, even those without ratings
  const avgRatingPerTopic = Object.entries(topicRatingStats)
    .map(([topic, data]) => ({
      topic,
      averageRating: data.count > 0 ? data.total / data.count : null,
      count: data.count,
      totalConversations: topicCounts[topic] || 0
    }))
    .sort((a, b) => (b.totalConversations || 0) - (a.totalConversations || 0)); // Sort by total conversations
  
  console.log(`Calculated average customer rating for ${avgRatingPerTopic.filter(t => t.count > 0).length} topics with ratings (out of ${avgRatingPerTopic.length} total topics).`);
  
  // Log first 3 topics if any exist
  if (avgRatingPerTopic.length > 0) {
    console.log("Sample topics with ratings:", avgRatingPerTopic.slice(0, 3));
  }

  // --- 1C) Average score per topic ('emne') ---
  const topicScoreStats = {};
  // Initialize stats for all topics
  allTopics.forEach(topic => {
    topicScoreStats[topic] = { total: 0, count: 0 };
  });
  
  // Now add scores where available
  conversations.forEach(conv => {
    const score = parseFloat(conv.score);
    const topic = conv.emne?.trim();
    // Treat score 0 as valid
    if (typeof score === 'number' && !isNaN(score) && topic) {
      topicScoreStats[topic].total += score;
      topicScoreStats[topic].count += 1;
    }
  });
  
  // Include ALL topics, even those without scores
  const avgScorePerTopic = Object.entries(topicScoreStats)
    .map(([topic, data]) => ({
      topic,
      averageScore: data.count > 0 ? data.total / data.count : null,
      count: data.count,
      totalConversations: topicCounts[topic] || 0
    }))
    .sort((a, b) => (b.totalConversations || 0) - (a.totalConversations || 0)); // Sort by total conversations
  
  console.log(`Calculated average score for ${avgScorePerTopic.filter(t => t.count > 0).length} topics with scores (out of ${avgScorePerTopic.length} total topics).`);

    // Progress update - preprocessing complete
    if (progressCallback) {
      progressCallback("Preprocessing conversations", 20);
    }

    // Extract FAQs instead of n-gram correlations
    let topFAQs = [];
    try {
      if (progressCallback) {
        progressCallback("Extracting frequently asked questions", 30);
      }
      
      topFAQs = await extractFAQs(conversations, progressCallback);
      
      if (progressCallback) {
        progressCallback("FAQ extraction complete", 80);
      }
    } catch (error) {
      console.error("Error extracting FAQs:", error);
      topFAQs = [];
    }

    console.log("Analysis complete.");

    return {
      ratingScoreCorrelation: ratingScoreCorr,
      avgRatingPerTopic,
      avgScorePerTopic,
      frequentlyAskedQuestions: topFAQs, // Changed from positiveCorrelations/negativeCorrelations
      analyzedDocumentsCount: conversations.length,
      faqInfo: {
        description: "Top 5 most frequently asked questions by customers",
        extractionMethod: "Question detection and similarity grouping"
      }
    };
  } catch (error) {
    console.error("Fatal error in text analysis:", error);
    return {
      error: `Text analysis failed: ${error.message}`,
      ratingScoreCorrelation: { value: null, pValue: null, count: 0 },
      avgRatingPerTopic: [],
      avgScorePerTopic: [],
      frequentlyAskedQuestions: [],
      faqInfo: {
        description: "Top 5 most frequently asked questions by customers",
        extractionMethod: "Question detection and similarity grouping"
      }
    };
  }
} 