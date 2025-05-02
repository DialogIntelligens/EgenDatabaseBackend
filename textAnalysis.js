import natural from 'natural';
import stopword from 'stopword';
// Import specific language stopwords
import { removeStopwords } from 'stopword';

const tokenizer = new natural.WordTokenizer();

/**
 * Extract text from conversation data
 * @param {Array} conversationData - The conversation data array
 * @returns {string} - The extracted text
 */
function extractTextFromConversation(conversationData) {
  try {
    if (!Array.isArray(conversationData)) {
      console.log("Conversation data is not an array");
      return '';
    }
    
    // Extract all user messages - in the format we have messages with isUser: true
    const userMessages = conversationData
      .filter(message => message && message.isUser === true)
      .map(message => message.text || '')
      .filter(text => text && text.trim() !== '')
      .join(' ');
    
    console.log(`Extracted ${userMessages.length} characters of user text`);
    return userMessages;
  } catch (error) {
    console.error('Error extracting text from conversation:', error);
    return '';
  }
}

/**
 * Tokenize and clean text
 * @param {string} text - The input text
 * @returns {string[]} - Array of tokens
 */
function tokenizeAndClean(text) {
  // Convert to lowercase
  const lowercaseText = text.toLowerCase();
  
  // Replace non-alphanumeric characters with spaces
  const cleanedText = lowercaseText.replace(/[^a-z0-9æøåäöéèêëàáíóòúù\s]/g, ' ');
  
  // Tokenize
  const tokens = tokenizer.tokenize(cleanedText) || [];
  
  // Just use default English stopwords since the multi-language approach caused issues
  return removeStopwords(tokens);
}

/**
 * Generate n-grams from tokens
 * @param {string[]} tokens - Array of tokens
 * @param {number} n - Size of n-gram
 * @returns {string[]} - Array of n-grams
 */
function generateNgrams(tokens, n) {
  const ngrams = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Analyzes conversations to find word correlations with satisfaction scores
 * Enhanced with TF-IDF and better statistical measures
 */
export async function analyzeConversations(conversations) {
  try {
    console.log(`Starting analysis on ${conversations.length} conversations`);
    
    // 1. Data preprocessing - Split into training/testing sets
    const shuffled = shuffleArray([...conversations]);
    const splitIndex = Math.floor(shuffled.length * 0.8); // 80/20 split
    const trainingSet = shuffled.slice(0, splitIndex);
    const testingSet = shuffled.slice(splitIndex);
    
    console.log(`Training set: ${trainingSet.length}, Testing set: ${testingSet.length}`);
    
    // 2. Extract text and scores from conversations
    const trainingData = extractTextAndScores(trainingSet);
    const testingData = extractTextAndScores(testingSet);
    
    if (trainingData.valid.length < 10) {
      return {
        error: "Not enough valid training data (need at least 10 conversations)",
        trainingSize: trainingSet.length,
        testingSize: testingSet.length,
        validTrainingSize: trainingData.valid.length,
        validTestingSize: testingData.valid.length
      };
    }
    
    console.log(`Valid training data: ${trainingData.valid.length}, Valid testing data: ${testingData.valid.length}`);
    
    // 3. Create document-term matrix with TF-IDF weighting
    const { allTerms, tfIdfMatrix, documentFrequencies } = buildTfIdfMatrix(trainingData.valid);
    console.log(`Created TF-IDF matrix with ${allTerms.length} terms`);
    
    // 4. Analyze correlations with scores
    const correlations = calculateCorrelations(
      tfIdfMatrix, 
      trainingData.valid.map(item => item.score),
      allTerms,
      documentFrequencies,
      trainingData.valid.length
    );
    
    // 5. Evaluate on test set (simple linear model based on term weights)
    const testResults = evaluateOnTestSet(correlations.allWords, testingData.valid, allTerms);
    
    console.log("Analysis complete");
    
    return {
      positiveCorrelations: {
        monograms: correlations.topPositive.filter(term => !term.ngram.includes(' ')).slice(0, 20),
        bigrams: correlations.topPositive.filter(term => term.ngram.split(' ').length === 2).slice(0, 15),
        trigrams: correlations.topPositive.filter(term => term.ngram.split(' ').length === 3).slice(0, 10)
      },
      negativeCorrelations: {
        monograms: correlations.topNegative.filter(term => !term.ngram.includes(' ')).slice(0, 20),
        bigrams: correlations.topNegative.filter(term => term.ngram.split(' ').length === 2).slice(0, 15),
        trigrams: correlations.topNegative.filter(term => term.ngram.split(' ').length === 3).slice(0, 10)
      },
      testResults,
      trainingSize: trainingSet.length,
      testingSize: testingSet.length,
      validTrainingSize: trainingData.valid.length,
      validTestingSize: testingData.valid.length
    };
  } catch (error) {
    console.error("Error in text analysis:", error);
    return { 
      error: error.message,
      trainingSize: conversations.length,
      testingSize: 0,
      validTrainingSize: 0,
      validTestingSize: 0
    };
  }
}

/**
 * Extract text from user messages in conversations
 */
function extractTextAndScores(conversations) {
  const valid = [];
  const invalid = [];
  
  for (const conversation of conversations) {
    try {
      // Parse score as float and validate
      const score = parseFloat(conversation.score);
      if (isNaN(score)) {
        invalid.push({ reason: "Invalid score", id: conversation.id });
        continue;
      }
      
      // Parse conversation data
      let conversationData;
      try {
        conversationData = typeof conversation.conversation_data === 'string' 
          ? JSON.parse(conversation.conversation_data) 
          : conversation.conversation_data;
      } catch (e) {
        invalid.push({ reason: "Invalid conversation data format", id: conversation.id });
        continue;
      }
      
      if (!Array.isArray(conversationData)) {
        invalid.push({ reason: "Conversation data is not an array", id: conversation.id });
        continue;
      }
      
      // Extract user messages
      // This specifically looks for messages where isUser is true or sender is 'user'
      const userMessages = conversationData.filter(msg => 
        msg && (msg.isUser === true || msg.sender === 'user')
      ).map(msg => msg.text || '').filter(Boolean);
      
      if (userMessages.length === 0) {
        invalid.push({ reason: "No user messages found", id: conversation.id });
        continue;
      }
      
      // Combine user messages into single text
      const text = userMessages.join(' ');
      if (text.trim().length < 10) {
        invalid.push({ reason: "User text too short", id: conversation.id });
        continue;
      }
      
      valid.push({
        id: conversation.id,
        text,
        score,
        messageCount: userMessages.length
      });
      
    } catch (error) {
      console.error(`Error processing conversation ${conversation.id}:`, error);
      invalid.push({ reason: error.message, id: conversation.id });
    }
  }
  
  return { valid, invalid };
}

/**
 * Build TF-IDF matrix from preprocessed text documents
 */
function buildTfIdfMatrix(documents) {
  // Create tokenizer for words
  const tokenizer = new natural.WordTokenizer();
  
  // Process each document
  const processedDocs = documents.map(doc => {
    // Tokenize and normalize text
    const tokens = tokenizer.tokenize(doc.text.toLowerCase());
    
    // Remove stopwords and short words
    const filteredTokens = stopword.removeStopwords(tokens)
      .filter(token => token.length > 2 && /^[a-zæøåäö]+$/.test(token));
    
    // Extract bigrams and trigrams
    const bigrams = extractNgrams(filteredTokens, 2);
    const trigrams = extractNgrams(filteredTokens, 3);
    
    // Combine unigrams, bigrams, and trigrams
    return { 
      unigrams: filteredTokens,
      bigrams,
      trigrams,
      allTerms: [...filteredTokens, ...bigrams, ...trigrams]
    };
  });
  
  // Build term frequency matrix
  const docTermFrequencies = [];
  const termCounts = new Map();
  
  // Count terms in each document
  processedDocs.forEach(doc => {
    const termFreq = new Map();
    
    // Count term frequencies in this document
    doc.allTerms.forEach(term => {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
      termCounts.set(term, (termCounts.get(term) || 0) + 1);
    });
    
    docTermFrequencies.push(termFreq);
  });
  
  // Get unique terms that appear in at least 2 documents
  // and fewer than 95% of documents (to filter extremely common terms)
  const minDocFreq = 2;
  const maxDocFreqPct = 0.95;
  const maxDocFreq = Math.floor(documents.length * maxDocFreqPct);
  
  const documentFrequencies = new Map();
  termCounts.forEach((count, term) => {
    if (count >= minDocFreq && count <= maxDocFreq) {
      documentFrequencies.set(term, count);
    }
  });
  
  // Create final list of terms to use
  const allTerms = Array.from(documentFrequencies.keys());
  
  // Calculate TF-IDF matrix
  const tfIdfMatrix = [];
  const numDocuments = documents.length;
  
  docTermFrequencies.forEach(docTerms => {
    const tfIdfVector = new Map();
    
    // For each term in our vocabulary
    allTerms.forEach(term => {
      const tf = docTerms.get(term) || 0;
      if (tf > 0) {
        const df = documentFrequencies.get(term);
        const idf = Math.log(numDocuments / df);
        const tfIdf = tf * idf;
        tfIdfVector.set(term, tfIdf);
      }
    });
    
    tfIdfMatrix.push(tfIdfVector);
  });
  
  return { allTerms, tfIdfMatrix, documentFrequencies };
}

/**
 * Extract n-grams from a list of tokens
 */
function extractNgrams(tokens, n) {
  if (tokens.length < n) return [];
  
  const ngrams = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  
  return ngrams;
}

/**
 * Calculate correlation between terms and scores using TF-IDF weights
 */
function calculateCorrelations(tfIdfMatrix, scores, allTerms, documentFrequencies, numDocuments) {
  // For each term, calculate correlation with scores
  const termStats = [];
  
  allTerms.forEach(term => {
    // Extract term vectors and scores where the term exists
    const termValues = [];
    const matchingScores = [];
    
    tfIdfMatrix.forEach((docVector, docIndex) => {
      const value = docVector.get(term) || 0;
      if (value > 0) {
        termValues.push(value);
        matchingScores.push(scores[docIndex]);
      }
    });
    
    if (termValues.length < 3) return; // Skip terms with too few occurrences
    
    // Calculate correlation coefficient
    const correlation = calculatePearsonCorrelation(termValues, matchingScores);
    
    // Calculate importance score (correlation * log(df))
    const df = documentFrequencies.get(term);
    const importance = correlation * Math.log(df);
    
    // Average score when term is present
    const avgScore = matchingScores.reduce((sum, score) => sum + score, 0) / matchingScores.length;
    
    termStats.push({
      ngram: term,
      correlation,
      importance,
      avgScore,
      count: df,
      frequency: df / numDocuments
    });
  });
  
  // Sort terms by correlation
  termStats.sort((a, b) => a.correlation - b.correlation);
  const topNegative = termStats.slice(0, 50);
  const topPositive = termStats.slice(-50).reverse();
  
  return { 
    allWords: termStats, 
    topNegative, 
    topPositive 
  };
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculatePearsonCorrelation(x, y) {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Evaluate model on test set
 */
function evaluateOnTestSet(weightedTerms, testSet, vocabulary) {
  // Create a simple linear model from term weights
  const termWeights = new Map();
  weightedTerms.forEach(term => {
    termWeights.set(term.ngram, term.correlation);
  });
  
  // Tokenize test documents
  const tokenizer = new natural.WordTokenizer();
  const predictions = [];
  const actuals = [];
  let sumError = 0;
  let sumSquaredError = 0;
  
  // Make predictions on test documents
  testSet.forEach(doc => {
    // Tokenize and extract n-grams
    const tokens = tokenizer.tokenize(doc.text.toLowerCase());
    const filteredTokens = stopword.removeStopwords(tokens)
      .filter(token => token.length > 2 && /^[a-zæøåäö]+$/.test(token));
    
    const bigrams = extractNgrams(filteredTokens, 2);
    const trigrams = extractNgrams(filteredTokens, 3);
    const allTerms = [...filteredTokens, ...bigrams, ...trigrams];
    
    // Count terms
    const termCounts = new Map();
    allTerms.forEach(term => {
      if (vocabulary.includes(term)) {
        termCounts.set(term, (termCounts.get(term) || 0) + 1);
      }
    });
    
    // Calculate prediction (weighted sum of term weights)
    let prediction = 0;
    let totalWeight = 0;
    
    termCounts.forEach((count, term) => {
      const weight = termWeights.get(term) || 0;
      prediction += weight * count;
      totalWeight += Math.abs(weight) * count;
    });
    
    // Normalize prediction based on vocabulary coverage
    if (totalWeight > 0) {
      // Scale to expected score range
      const minScore = 1;
      const maxScore = 10;
      const scaledPrediction = 5 + prediction * 3; // Center at 5, scale effect
      
      // Clamp to valid range
      prediction = Math.max(minScore, Math.min(maxScore, scaledPrediction));
    } else {
      prediction = 5; // Default to middle if no vocabulary matches
    }
    
    predictions.push(prediction);
    actuals.push(doc.score);
    
    const error = Math.abs(prediction - doc.score);
    sumError += error;
    sumSquaredError += error * error;
  });
  
  // Calculate metrics
  const meanAbsoluteError = sumError / testSet.length;
  const rootMeanSquaredError = Math.sqrt(sumSquaredError / testSet.length);
  const correlation = calculatePearsonCorrelation(predictions, actuals);
  
  return {
    meanAbsoluteError,
    rootMeanSquaredError,
    correlationCoefficient: correlation,
    sampleSize: testSet.length
  };
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
} 