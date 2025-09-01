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

  // --- Preprocessing for TF-IDF ---
    // Process documents in smaller batches to avoid memory issues
    let processedDocs = [];
    const convoBatchSize = 100;
    
    for (let i = 0; i < conversations.length; i += convoBatchSize) {
      const batch = conversations.slice(i, i + convoBatchSize);
      const batchDocs = await processWithThrottling(batch, async (conv) => {
    let conversationData;
    try {
      conversationData = (typeof conv.conversation_data === 'string')
        ? JSON.parse(conv.conversation_data)
        : conv.conversation_data;
    } catch (e) {
      return null;
    }

        // Extract user messages for analysis
    const userText = extractUserMessages(conversationData);
    const score = parseFloat(conv.score);

        // Check for valid data
        if (!userText || userText.trim().length === 0) return null;
        if (typeof score !== 'number' || isNaN(score)) return null;
        
        return { 
          id: conv.id, 
          userText: userText.trim(), 
          score,
          text: userText.trim(), // Add text field for consistency
          rating: conv.customer_rating ? parseFloat(conv.customer_rating) : null,
          emne: conv.emne || null
        };
      }, 20, 50);
      
      // Add valid docs from this batch
      processedDocs = [...processedDocs, ...batchDocs.filter(doc => doc !== null)];
      
      // Report progress
      if (progressCallback) {
        const percent = Math.min(20, 10 + Math.floor((i + convoBatchSize) / conversations.length * 10));
        progressCallback(`Processing conversations (${processedDocs.length} valid so far)`, percent);
      }
    }

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

    // Create TF-IDF model with memory-efficient batching
    const { tfidf, docMapping } = await createTfIdfModel(processedDocs, progressCallback);
  console.log(`TF-IDF model created with ${tfidf.documents.length} documents processed.`);

    // Progress update - TF-IDF model complete
    if (progressCallback) {
      progressCallback("Language model complete", 30);
    }

    // --- Calculate Pearson Correlation for each N-gram --- 
    let ngramCorrelations = [];
    
    // Extract terms more efficiently
    const terms = new Map(); // Use Map for better performance with large datasets
    
    // Process in batches to avoid memory issues
    const docBatchSize = 50; 
    for (let i = 0; i < tfidf.documents.length; i += docBatchSize) {
      const endIdx = Math.min(i + docBatchSize, tfidf.documents.length);
      
      for (let docIndex = i; docIndex < endIdx; docIndex++) {
        const doc = tfidf.documents[docIndex];
        Object.keys(doc).forEach(term => {
          if (term !== '__key') {
            terms.set(term, (terms.get(term) || 0) + 1);
      }
    });
      }
      
      // Small delay between batches
      if (i + docBatchSize < tfidf.documents.length) {
        await sleep(50);
      }
    }

    // Filter terms to those that appear in at least N% of documents
    const minDocumentPercentage = 0.03; // 3%
    const minDocumentCount = Math.max(2, Math.ceil(tfidf.documents.length * minDocumentPercentage));
    
    // Convert terms Map to array and filter
    const allTerms = Array.from(terms.entries())
      .filter(([term, count]) => count >= minDocumentCount)
      .map(([term]) => term);

    // For large datasets, limit the number of terms to process
    const maxTermsToProcess = processedDocs.length > 200 ? 2000 : 5000;
    
    // Sort terms by frequency and limit
    let termsToProcess = Array.from(terms.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .slice(0, maxTermsToProcess)
      .map(([term]) => term);

    console.log(`Processing ${termsToProcess.length} out of ${allTerms.length} total terms`);

    // Progress update - beginning correlation calculation
    if (progressCallback) {
      progressCallback("Starting correlation analysis", 35);
    }

    // Process terms in smaller batches
    const termBatchSize = 100;
    for (let i = 0; i < termsToProcess.length; i += termBatchSize) {
      const termBatch = termsToProcess.slice(i, i + termBatchSize);
      
      // Process this batch of terms
      const batchResults = await processWithThrottling(termBatch, async (term) => {
        try {
          const termTfidfValues = [];
      const correspondingScores = [];
      
          // Use docMapping to match documents with their scores
      processedDocs.forEach(doc => {
            if (docMapping.has(doc.id)) {
              const docIndex = docMapping.get(doc.id);
              const tfidfValue = tfidf.tfidf(term, docIndex);
              
              // Only include if we have a valid TF-IDF value
              if (!isNaN(tfidfValue)) {
                termTfidfValues.push(tfidfValue);
          correspondingScores.push(doc.score);
        }
            }
      });
      
          // Need at least 3 data points for meaningful correlation
          if (termTfidfValues.length > 2) {
            // Calculate Pearson correlation
            const correlation = calculatePearson(termTfidfValues, correspondingScores);
            
            if (!isNaN(correlation) && Math.abs(correlation) > 0.1) { // Ignore very weak correlations
              return { 
              ngram: term, 
                correlation: correlation,
                documentCount: terms.get(term) || 0 // How many documents contain this term
              };
            }
          }
          return null;
        } catch (error) {
          console.error(`Error processing term "${term}":`, error);
          return null;
      }
      }, 10, 20); // Process 10 terms at a time with 20ms delay
      
      // Add valid correlations
      ngramCorrelations = [...ngramCorrelations, ...batchResults.filter(r => r !== null)];
    
      // Report progress
      if (progressCallback) {
        const progressPercent = 35 + Math.floor((i + termBatchSize) / termsToProcess.length * 35);
        progressCallback(`Processing terms (${i + termBatchSize}/${termsToProcess.length})`, 
          Math.min(70, progressPercent));
      }
    }
    
    // Progress update - correlation calculation complete
    if (progressCallback) {
      progressCallback("Correlation analysis complete", 70);
  }

  // --- Sort and select top correlations ---
  ngramCorrelations.sort((a, b) => b.correlation - a.correlation); // Sort desc

  // Limit to maximum 5 n-grams per category while keeping the strongest correlations
  const maxCorrelationsPerCategory = 5;
  
  const positiveCorrelations = ngramCorrelations
    .filter(c => c.correlation > 0)
    .slice(0, maxCorrelationsPerCategory)
    .map(item => ({
      ...item,
      ngram: item.ngram.replace(/^\d+gram:/, ''), // Remove "2gram:", "3gram:" etc.
      correlation: parseFloat(item.correlation.toFixed(3)) // Format to 3 decimal places
    }));
    
  const negativeCorrelations = ngramCorrelations
    .filter(c => c.correlation < 0)
    .sort((a, b) => a.correlation - b.correlation) // Sort ascending for negatives
    .slice(0, maxCorrelationsPerCategory)
    .map(item => ({
      ...item,
      ngram: item.ngram.replace(/^\d+gram:/, ''), // Remove "2gram:", "3gram:" etc.
      correlation: parseFloat(item.correlation.toFixed(3)) // Format to 3 decimal places
    }));

  console.log("Analysis complete.");

  return {
    ratingScoreCorrelation: ratingScoreCorr,
    avgRatingPerTopic,
    avgScorePerTopic,
    positiveCorrelations: positiveCorrelations,
    negativeCorrelations: negativeCorrelations,
    analyzedDocumentsCount: processedDocs.length,
    totalNgramsFound: allTerms.length,
    ngramInfo: {
      maxSize: 3, // Maximum n-gram size
      description: "Includes unigrams, bigrams, and trigrams (n-grams with n=1, n=2, and n=3)"
    }
  };
  } catch (error) {
    console.error("Fatal error in text analysis:", error);
    return {
      error: `Text analysis failed: ${error.message}`,
      ratingScoreCorrelation: { value: null, pValue: null, count: 0 },
      avgRatingPerTopic: [],
      avgScorePerTopic: [],
      positiveCorrelations: [],
      negativeCorrelations: [],
      ngramInfo: {
        maxSize: 3, // Maximum n-gram size
        description: "Includes unigrams, bigrams, and trigrams (n-grams with n=1, n=2, and n=3)"
      }
    };
  }
} 