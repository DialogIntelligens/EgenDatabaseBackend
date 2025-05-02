import natural from 'natural';
import stopword from 'stopword';
import { pearson } from 'stats-lite';

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

  // --- 1B) Average customer_rating per topic ('emne') ---
  const topicRatingStats = {};
  conversations.forEach(conv => {
    const rating = parseFloat(conv.customer_rating);
    const topic = conv.emne?.trim();
    if (!isNaN(rating) && topic) {
      if (!topicRatingStats[topic]) {
        topicRatingStats[topic] = { total: 0, count: 0 };
      }
      topicRatingStats[topic].total += rating;
      topicRatingStats[topic].count += 1;
    }
  });
  const avgRatingPerTopic = Object.entries(topicRatingStats).map(([topic, data]) => ({
    topic,
    averageRating: data.total / data.count,
    count: data.count
  })).sort((a, b) => b.count - a.count); // Sort by count desc
  console.log(`Calculated average customer rating for ${avgRatingPerTopic.length} topics.`);

  // --- 1C) Average score per topic ('emne') ---
  const topicScoreStats = {};
  conversations.forEach(conv => {
    const score = parseFloat(conv.score);
    const topic = conv.emne?.trim();
    // Treat score 0 as valid
    if (typeof score === 'number' && !isNaN(score) && topic) {
      if (!topicScoreStats[topic]) {
        topicScoreStats[topic] = { total: 0, count: 0 };
      }
      topicScoreStats[topic].total += score;
      topicScoreStats[topic].count += 1;
    }
  });
  const avgScorePerTopic = Object.entries(topicScoreStats).map(([topic, data]) => ({
    topic,
    averageScore: data.total / data.count,
    count: data.count
  })).sort((a, b) => b.count - a.count); // Sort by count desc
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
      return { /* ... return existing stats ... */ };
  }

  // Calculate correlation for each term
  allTerms.forEach(term => {
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
      const uniqueTfidfValues = new Set(termTfidfValues);
      if (uniqueTfidfValues.size > 1) { // Check for variance
        try {
          const corr = pearson(termTfidfValues, correspondingScores);
          if (!isNaN(corr)) {
            ngramCorrelations.push({ ngram: term, correlation: corr });
          }
        } catch (e) { /* Ignore errors */ }
      }
    }
  });

  console.log(`Calculated correlations for ${ngramCorrelations.length} n-grams.`);

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