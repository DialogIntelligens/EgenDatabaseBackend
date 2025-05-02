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
    if (!isNaN(rating) && typeof score === 'number' && !isNaN(score)) {
      ratings.push(rating);
      scoresForRatingCorr.push(score);
    }
  });
  console.log(`Found ${ratings.length} pairs for rating-score correlation.`); // Log count
  if (ratings.length > 1) {
    try {
      const corr = pearson(ratings, scoresForRatingCorr);
      ratingScoreCorr = { value: corr, pValue: null, count: ratings.length };
      console.log(`Customer Rating vs Score Correlation: r = ${corr?.toFixed(4)}, N = ${ratings.length}`);
    } catch (e) {
      console.error("Error calculating rating-score correlation:", e);
    }
  } else {
    console.log("Not enough data for rating-score correlation (need > 1).", { count: ratings.length });
  }

  // --- 1B & 1C) Average Ratings/Scores per Topic ---
  const topicStats = {}; // Combined stats
  let topicsFound = 0;
  conversations.forEach(conv => {
    const rating = parseFloat(conv.customer_rating);
    const score = parseFloat(conv.score);
    const topic = typeof conv.emne === 'string' && conv.emne.trim().length > 0 ? conv.emne.trim() : null;

    if (topic) {
      if (!topicStats[topic]) {
        topicStats[topic] = { totalRating: 0, ratingCount: 0, totalScore: 0, scoreCount: 0 };
        topicsFound++;
      }
      if (!isNaN(rating)) {
        topicStats[topic].totalRating += rating;
        topicStats[topic].ratingCount += 1;
      }
      if (typeof score === 'number' && !isNaN(score)) {
        topicStats[topic].totalScore += score;
        topicStats[topic].scoreCount += 1;
      }
    }
  });

  const avgRatingPerTopic = Object.entries(topicStats)
    .filter(([_, data]) => data.ratingCount > 0)
    .map(([topic, data]) => ({
      topic,
      averageRating: data.totalRating / data.ratingCount,
      count: data.ratingCount
    })).sort((a, b) => b.count - a.count);

  const avgScorePerTopic = Object.entries(topicStats)
    .filter(([_, data]) => data.scoreCount > 0)
    .map(([topic, data]) => ({
      topic,
      averageScore: data.totalScore / data.scoreCount,
      count: data.scoreCount
    })).sort((a, b) => b.count - a.count);

  console.log(`Calculated stats for ${topicsFound} unique topics.`);
  console.log(` - Average customer rating available for ${avgRatingPerTopic.length} topics.`);
  console.log(` - Average score available for ${avgScorePerTopic.length} topics.`);

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

    if (userText && userText.trim().length > 0 && typeof score === 'number' && !isNaN(score)) {
      // Assign a predictable ID we can map back later
      return { id: `doc_${index}`, userText: userText.trim(), score }; 
    } else {
      return null;
    }
  }).filter(doc => doc !== null);
  
  // Create a quick lookup map for scores by our custom ID
  const scoreMap = new Map(processedDocs.map(doc => [doc.id, doc.score]));

  console.log(`Processed ${processedDocs.length} conversations with valid user text and scores for TF-IDF.`);

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

  processedDocs.forEach((doc) => {
    const mono = generateNgrams(doc.userText, 1);
    const bi = generateNgrams(doc.userText, 2);
    const tri = generateNgrams(doc.userText, 3);
    const allNgrams = [...mono, ...bi, ...tri].filter(ng => ng.length > 0); // Ensure non-empty ngrams
    if (allNgrams.length > 0) {
        tfidf.addDocument(allNgrams, doc.id); // Use doc.id as the key
    }
  });

  console.log(`TF-IDF model created with ${tfidf.documents.length} documents processed.`);

  // --- Calculate Pearson Correlation for each N-gram --- 
  const ngramCorrelations = [];
  const terms = {}; // Collect all unique terms

  tfidf.documents.forEach((docTerms) => {
      Object.keys(docTerms).forEach(term => {
          if (term !== '__key') { terms[term] = true; }
      });
  });
  const allTerms = Object.keys(terms);
  console.log(`Found ${allTerms.length} unique n-grams (features).`);

  if (allTerms.length === 0) {
      console.warn("No terms found for correlation analysis.");
      return { /* ... return existing stats ... */ };
  }

  // Calculate correlation for each term
  let correlationsCalculated = 0;
  allTerms.forEach(term => {
    const termTfidfValues = [];
    const correspondingScores = [];

    // Iterate through the documents *in the tfidf object* to get scores
    for (let i = 0; i < tfidf.documents.length; i++) {
        const docKey = tfidf.documents[i].__key; // Get the key (our doc.id)
        const score = scoreMap.get(docKey); // Look up score using the key
        
        if (typeof score === 'number') { // Check if we found a score for this doc key
            const tfidfValue = tfidf.tfidf(term, i); // Get TF-IDF using the internal index 'i'
            termTfidfValues.push(tfidfValue);
            correspondingScores.push(score);
        } else {
             console.warn(`Could not find score for document key: ${docKey}`);
             // Skip this document for this term if score is missing
        }
    }

    // Check variance and calculate correlation
    if (termTfidfValues.length > 1) {
      const uniqueTfidfValues = new Set(termTfidfValues);
      if (uniqueTfidfValues.size > 1) { 
        try {
          const corr = pearson(termTfidfValues, correspondingScores);
          if (!isNaN(corr)) {
            ngramCorrelations.push({ ngram: term, correlation: corr });
            correlationsCalculated++;
          }
        } catch (e) { /* Optionally log ignored errors: console.warn(`Corr error for ${term}: ${e.message}`) */ }
      }
    }
  });

  console.log(`Calculated valid correlations for ${correlationsCalculated} n-grams.`); // Log actual count

  // --- Sort and select top correlations ---
  ngramCorrelations.sort((a, b) => b.correlation - a.correlation); // Sort desc

  const topPositive = ngramCorrelations.filter(c => c.correlation > 0).slice(0, 15);
  const topNegative = ngramCorrelations.filter(c => c.correlation < 0).slice(-15).reverse();

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