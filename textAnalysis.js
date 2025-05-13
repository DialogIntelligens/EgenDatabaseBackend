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
    .map(message => String(message.text).trim())
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
      return `${prefix} ${String(message.text).trim()}`;
    })
    .filter(text => text.length > 0);
  return allTexts.join(" ");
}

// Helper to generate n-grams
function generateNgrams(text, n) {
  const tokenizer = new natural.WordTokenizer();
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
}

// Add these helper functions at the top of the file, after imports

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
async function processWithThrottling(items, processFn, batchSize = 100, delayMs = 50) {
  const results = [];
  
  // Process in batches to avoid CPU overload
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process current batch - using serial processing for more gradual CPU usage
    for (const item of batch) {
      const result = await processFn(item);
      if (result !== null && result !== undefined) {
        results.push(result);
      }
      
      // Small delay even within a batch to prevent CPU spikes
      if (batch.length > 10) {
        await sleep(5); // 5ms micro-delay between items in large batches
      }
    }
    
    // Log progress for long operations
    if (items.length > 500 && i % 500 === 0) {
      console.log(`Processed ${i + batch.length}/${items.length} items...`);
    }
    
    // Sleep to allow CPU to handle other tasks
    if (i + batchSize < items.length) {
      await sleep(delayMs);
    }
  }
  
  return results;
}

// Main analysis function
export async function analyzeConversations(conversations, progressCallback = null) {
  console.log(`Starting analysis on ${conversations.length} conversations.`);
  
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
      ratingScoreCorr = { value: corr, pValue: null, count: ratings.length }; // p-value not readily available
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

  // --- Preprocessing for TF-IDF ---
  const processedDocs = conversations.map((conv, index) => {
    let conversationData;
    try {
      conversationData = (typeof conv.conversation_data === 'string')
        ? JSON.parse(conv.conversation_data)
        : conv.conversation_data;
    } catch (e) {
      console.warn(`Failed to parse conversation_data for conv index ${index}`);
      return null;
    }

    // Extract user messages for analysis
    const userText = extractUserMessages(conversationData);
    const score = parseFloat(conv.score);

    // Treat score 0 as valid
    if (userText && userText.trim().length > 0 && typeof score === 'number' && !isNaN(score)) {
      return { 
        id: conv.id, 
        userText: userText.trim(), 
        score,
        text: userText.trim(), // Add text field for consistency
        rating: conv.customer_rating ? parseFloat(conv.customer_rating) : null,
        emne: conv.emne || null
      };
    } else {
      return null;
    }
  }).filter(doc => doc !== null);

  console.log(`Processed ${processedDocs.length} conversations with valid user text and scores.`);

  if (processedDocs.length < 2) {
    console.warn("Insufficient valid documents for TF-IDF analysis.");
    return {
      error: "Insufficient data for text analysis",
      ratingScoreCorrelation: ratingScoreCorr,
      avgRatingPerTopic,
      avgScorePerTopic,
      positiveCorrelations: [],
      negativeCorrelations: []
    };
  }

  // Check score variance
  const allScores = processedDocs.map(doc => doc.score);
  const uniqueScores = new Set(allScores);
  console.log(`Score variance check: ${uniqueScores.size} unique score values out of ${allScores.length} documents`);
  if (uniqueScores.size <= 1) {
    console.warn("No variance in scores - all documents have the same score. Cannot calculate correlations.");
    return {
      error: "Insufficient variance in scores for correlation analysis",
      ratingScoreCorrelation: ratingScoreCorr,
      avgRatingPerTopic,
      avgScorePerTopic,
      positiveCorrelations: [],
      negativeCorrelations: []
    };
  }
  
  // Report progress - preprocessing complete
  if (progressCallback) {
    progressCallback("Preprocessing conversations", 20);
  }

  // --- TF-IDF Vectorization (Monograms, Bigrams, Trigrams) ---
  const TfIdf = natural.TfIdf;
  const tfidf = new TfIdf();

  // Add documents to TF-IDF
  let processedCount = 0;
  const totalDocs = processedDocs.length;
  
  for (const doc of processedDocs) {
    tfidf.addDocument(doc.text || doc.userText, { __key: doc.id });
    
    processedCount++;
    if (processedCount % 50 === 0 && progressCallback) {
      const progressPercent = 20 + Math.floor((processedCount / totalDocs) * 10);
      progressCallback("Building language model", progressPercent);
    }
  }

  console.log(`TF-IDF model created with ${tfidf.documents.length} documents processed.`);
  
  // Progress update - TF-IDF model complete
  if (progressCallback) {
    progressCallback("Language model complete", 30);
  }

  // --- Calculate Pearson Correlation for each N-gram --- 
  let ngramCorrelations = [];
  const terms = {}; // Collect all unique terms

  // Get all terms from the TF-IDF model
  tfidf.documents.forEach((doc, docIndex) => {
    const documentTerms = Object.keys(doc);
    documentTerms.forEach(term => {
      if (term !== '__key') {
        terms[term] = (terms[term] || 0) + 1;
          }
      });
  });

  // Filter terms to those that appear in at least N% of documents
  const minDocumentPercentage = 0.05; // 5%
  const minDocumentCount = Math.max(2, Math.ceil(tfidf.documents.length * minDocumentPercentage));
  const allTerms = Object.keys(terms).filter(term => terms[term] >= minDocumentCount);

  // Limit to top N most common terms for correlation analysis
  const maxTermsToProcess = 5000;
  let termsToProcess = allTerms
    .sort((a, b) => terms[b] - terms[a])
    .slice(0, maxTermsToProcess);
  
  console.log(`Processing ${termsToProcess.length} out of ${allTerms.length} total terms`);

  // Progress update - beginning correlation calculation
  if (progressCallback) {
    progressCallback("Starting correlation analysis", 35);
  }

  // Use async/await with the throttling helper
  const calculateTermCorrelations = async () => {
    // Process terms in throttled batches
    await processWithThrottling(termsToProcess, async (term, index) => {
    const termTfidfValues = [];
    const correspondingScores = [];

    // Iterate through our processedDocs to ensure order and score mapping
    processedDocs.forEach(doc => {
      const docIndex = tfidf.documents.findIndex(d => d.__key === doc.id);
      if (docIndex !== -1) {
        const tfidfValue = tfidf.tfidf(term, docIndex);
        termTfidfValues.push(tfidfValue);
        correspondingScores.push(doc.score);
      }
    });

      if (termTfidfValues.length > 2) {
        // Calculate Pearson correlation
        const correlation = calculatePearson(termTfidfValues, correspondingScores);
        
        if (!isNaN(correlation) && correlation !== 0) {
          ngramCorrelations.push({ 
            ngram: term, 
            correlation: correlation,
            documentCount: terms[term] // How many documents contain this term
          });
      }
    }
      
      // Report progress during correlation calculation
      if (progressCallback && index % 50 === 0) {
        const progressPercent = 35 + Math.floor((index / termsToProcess.length) * 35);
        progressCallback("Calculating correlations", progressPercent);
      }
    }, 50, 5); // Process 50 terms at a time with 5ms delay between batches
    
    return ngramCorrelations;
  };
  
  ngramCorrelations = await calculateTermCorrelations();
  
  // Progress update - correlation calculation complete
  if (progressCallback) {
    progressCallback("Correlation analysis complete", 70);
  }

  // --- Sort and select top correlations ---
  ngramCorrelations.sort((a, b) => b.correlation - a.correlation); // Sort desc

  const topPositive = ngramCorrelations.slice(0, 15).filter(c => c.correlation > 0);
  const topNegative = ngramCorrelations.slice(-15).filter(c => c.correlation < 0).reverse(); // Get bottom, filter, reverse

  console.log("Analysis complete.");

  return {
    ratingScoreCorrelation: ratingScoreCorr,
    avgRatingPerTopic,
    avgScorePerTopic,
    positiveCorrelations: topPositive,
    negativeCorrelations: topNegative,
    analyzedDocumentsCount: processedDocs.length,
    totalNgramsFound: allTerms.length
  };
} 