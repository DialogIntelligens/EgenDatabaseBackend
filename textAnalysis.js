import natural from 'natural';
import stopword from 'stopword';
import pkg from 'stats-lite';
const { pearson } = pkg;

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

// Main analysis function
export async function analyzeConversations(conversations) {
  console.log(`Starting analysis on ${conversations.length} conversations.`);

  // Debug topics
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
      const corr = pearson(ratings, scoresForRatingCorr);
      ratingScoreCorr = { value: corr, pValue: null, count: ratings.length }; // p-value not readily available
      console.log(`Customer Rating vs Score Correlation: r = ${corr?.toFixed(4)}, N = ${ratings.length}`);
    } catch (e) {
      console.error("Error calculating rating-score correlation:", e);
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
  
  const avgRatingPerTopic = Object.entries(topicRatingStats)
    .map(([topic, data]) => ({
      topic,
      averageRating: data.count > 0 ? data.total / data.count : null,
      count: data.count
    }))
    .filter(item => item.count > 0) // Only include topics with at least one rating
    .sort((a, b) => b.count - a.count); // Sort by count desc
  
  console.log(`Calculated average customer rating for ${avgRatingPerTopic.length} topics.`);
  
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
  
  const avgScorePerTopic = Object.entries(topicScoreStats)
    .map(([topic, data]) => ({
      topic,
      averageScore: data.count > 0 ? data.total / data.count : null,
      count: data.count
    }))
    .filter(item => item.count > 0) // Only include topics with at least one score
    .sort((a, b) => b.count - a.count); // Sort by count desc
  
  console.log(`Calculated average score for ${avgScorePerTopic.length} topics.`);

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

    const userText = extractUserMessages(conversationData);
    const score = parseFloat(conv.score);

    // Treat score 0 as valid
    if (userText && userText.trim().length > 0 && typeof score === 'number' && !isNaN(score)) {
      return { id: `doc_${index}`, userText: userText.trim(), score }; // Use index-based ID for TfIdf key
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

  // --- TF-IDF Vectorization (Monograms, Bigrams, Trigrams) ---
  const TfIdf = natural.TfIdf;
  const tfidf = new TfIdf();
  const docIdMap = {}; // To map our ID back to TfIdf's internal index

  processedDocs.forEach((doc, index) => {
    const mono = generateNgrams(doc.userText, 1);
    const bi = generateNgrams(doc.userText, 2);
    const tri = generateNgrams(doc.userText, 3);
    const allNgrams = [...mono, ...bi, ...tri];
    if (allNgrams.length > 0) {
        tfidf.addDocument(allNgrams, doc.id); // Use doc.id as the key
        docIdMap[doc.id] = index; // Store mapping from our ID to original index
    }
  });

  console.log(`TF-IDF model created with ${tfidf.documents.length} documents processed.`);

  // --- Calculate Pearson Correlation for each N-gram --- 
  const ngramCorrelations = [];
  const terms = {}; // Collect all unique terms

  tfidf.documents.forEach((docTerms) => {
      Object.keys(docTerms).forEach(term => {
          if (term !== '__key') { // Ignore internal key
              terms[term] = true;
          }
      });
  });
  const allTerms = Object.keys(terms);
  console.log(`Found ${allTerms.length} unique n-grams (features).`);

  if (allTerms.length === 0) {
      console.warn("No terms found for correlation analysis.");
      return {
        error: "No terms found for correlation analysis",
        ratingScoreCorrelation: ratingScoreCorr,
        avgRatingPerTopic,
        avgScorePerTopic,
        positiveCorrelations: [],
        negativeCorrelations: []
      };
  }

  // Track correlation calculation issues
  let noVarianceCount = 0;
  let nanCorrelationCount = 0;
  let validCorrelationCount = 0;
  let lowVarianceCount = 0;
  let processedCount = 0;

  // Only process a subset of terms if there are too many (for performance)
  const termsToProcess = allTerms.length > 5000 ? 
    allTerms.slice(0, 5000) : // Only first 5000 terms
    allTerms;
  
  console.log(`Processing ${termsToProcess.length} out of ${allTerms.length} total terms`);

  // Calculate correlation for each term
  termsToProcess.forEach(term => {
    // Track progress for large term sets
    processedCount++;
    if (processedCount % 1000 === 0) {
      console.log(`Processed ${processedCount}/${termsToProcess.length} terms...`);
    }

    const termTfidfValues = [];
    const correspondingScores = [];

    // Iterate through our processedDocs to ensure order and score mapping
    processedDocs.forEach(doc => {
      const docIndex = tfidf.documents.findIndex(d => d.__key === doc.id);
      if (docIndex !== -1) {
        const tfidfValue = tfidf.tfidf(term, docIndex);
        termTfidfValues.push(tfidfValue);
        correspondingScores.push(doc.score);
      } else {
        // This might happen if a doc added no terms to tfidf, or ID mismatch
        // Let's push 0 for TF-IDF and the score to maintain alignment
        termTfidfValues.push(0);
        correspondingScores.push(doc.score);
      }
    });

    if (termTfidfValues.length > 1) {
      // Calculate variance in TF-IDF values
      const uniqueTfidfValues = new Set(termTfidfValues);
      const hasVariance = uniqueTfidfValues.size > 1;
      
      // Try to calculate correlation even with low variance
      // We'll still log these cases separately
      if (!hasVariance) {
        noVarianceCount++;
        return; // Skip terms with absolutely no variance
      }
      
      // Calculate standard deviation to check for very low variance
      const mean = termTfidfValues.reduce((sum, val) => sum + val, 0) / termTfidfValues.length;
      const variance = termTfidfValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / termTfidfValues.length;
      const stdDev = Math.sqrt(variance);
      const hasLowVariance = stdDev < 0.01;
      
      if (hasLowVariance) {
        lowVarianceCount++;
        // Continue with calculation anyway
      }
      
      try {
        const corr = pearson(termTfidfValues, correspondingScores);
        if (!isNaN(corr)) {
          ngramCorrelations.push({ 
            ngram: term, 
            correlation: corr,
            lowVariance: hasLowVariance 
          });
          validCorrelationCount++;
        } else {
          nanCorrelationCount++;
        }
      } catch (e) { 
        console.error(`Error calculating correlation for term "${term}":`, e);
      }
    }
  });

  console.log(`Correlation calculation stats:
  - Valid correlations: ${validCorrelationCount}
  - No variance in TF-IDF values: ${noVarianceCount} terms
  - Low variance in TF-IDF values: ${lowVarianceCount} terms
  - NaN correlation results: ${nanCorrelationCount} terms`);

  console.log(`Calculated correlations for ${ngramCorrelations.length} n-grams.`);

  // If we have too few correlations, try a fallback approach with binary presence
  if (ngramCorrelations.length < 10 && processedDocs.length > 2) {
    console.log("Few correlations found with TF-IDF values. Trying binary presence approach...");
    
    const binaryCorrelations = [];
    let binaryValidCount = 0;
    
    // Reset counters
    noVarianceCount = 0;
    nanCorrelationCount = 0;
    
    // Try a simpler approach: just check if term is present (1) or not (0)
    termsToProcess.slice(0, 2000).forEach(term => { // Limit to first 2000 terms for performance
      const termPresence = [];
      const correspondingScores = [];
      
      processedDocs.forEach(doc => {
        const docIndex = tfidf.documents.findIndex(d => d.__key === doc.id);
        if (docIndex !== -1) {
          // Check if term exists in document at all (binary: 1=present, 0=absent)
          const isPresent = (tfidf.documents[docIndex][term] !== undefined) ? 1 : 0;
          termPresence.push(isPresent);
          correspondingScores.push(doc.score);
        } else {
          termPresence.push(0); // Not present
          correspondingScores.push(doc.score);
        }
      });
      
      // Only calculate if we have some variance (term present in some docs, absent in others)
      if (termPresence.includes(0) && termPresence.includes(1)) {
        try {
          const corr = pearson(termPresence, correspondingScores);
          if (!isNaN(corr)) {
            binaryCorrelations.push({ 
              ngram: term, 
              correlation: corr,
              binary: true
            });
            binaryValidCount++;
          } else {
            nanCorrelationCount++;
          }
        } catch (e) {
          // Ignore errors
        }
      } else {
        noVarianceCount++;
      }
    });
    
    console.log(`Binary presence correlation results:
    - Valid correlations: ${binaryValidCount}
    - No variance in presence: ${noVarianceCount} terms
    - NaN correlation results: ${nanCorrelationCount} terms`);
    
    // If we found more correlations with binary approach, use those instead
    if (binaryCorrelations.length > ngramCorrelations.length) {
      console.log(`Using ${binaryCorrelations.length} binary correlations instead of ${ngramCorrelations.length} TF-IDF correlations`);
      ngramCorrelations = binaryCorrelations;
      validCorrelationCount = binaryValidCount;
    }
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