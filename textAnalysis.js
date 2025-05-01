import natural from 'natural';
import stopword from 'stopword';

const tokenizer = new natural.WordTokenizer();

/**
 * Extract text from conversation data
 * @param {Array} conversationData - The conversation data array
 * @returns {string} - The extracted text
 */
function extractTextFromConversation(conversationData) {
  try {
    if (!Array.isArray(conversationData)) {
      return '';
    }
    
    // Extract all user messages (typically at odd indexes)
    return conversationData
      .filter((_, index) => index % 2 === 1) // Get user messages
      .map(message => typeof message === 'string' ? message : 
           (message?.content || ''))
      .join(' ');
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
  
  // Remove stopwords (in multiple languages)
  return stopword.removeStopwords(tokens, [
    ...stopword.en, 
    ...stopword.da, 
    ...stopword.sv,
    ...stopword.no
  ]);
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
 * Calculate correlation between n-grams and scores
 * @param {Array} conversations - Array of conversation objects
 * @returns {Object} - Analysis results
 */
export async function analyzeConversations(conversations) {
  try {
    // Validate input
    if (!Array.isArray(conversations) || conversations.length < 10) {
      return {
        error: 'Insufficient data for analysis',
        minimumRequired: 10,
        provided: conversations?.length || 0
      };
    }
    
    // Split data into training (80%) and testing (20%)
    const shuffled = [...conversations].sort(() => 0.5 - Math.random());
    const splitPoint = Math.floor(shuffled.length * 0.8);
    const trainingSet = shuffled.slice(0, splitPoint);
    const testingSet = shuffled.slice(splitPoint);
    
    // Process conversations
    const ngramCounts = {
      '1': {}, // Monograms
      '2': {}, // Bigrams
      '3': {}  // Trigrams
    };
    
    const ngramScores = {
      '1': {}, // Monograms
      '2': {}, // Bigrams
      '3': {}  // Trigrams
    };
    
    // Process training set
    trainingSet.forEach(conversation => {
      try {
        // Parse conversation data
        const conversationData = typeof conversation.conversation_data === 'string' 
          ? JSON.parse(conversation.conversation_data) 
          : conversation.conversation_data;
        
        // Extract text and score
        const text = extractTextFromConversation(conversationData);
        const score = parseFloat(conversation.score);
        
        // Skip if no valid score
        if (isNaN(score)) return;
        
        // Tokenize
        const tokens = tokenizeAndClean(text);
        
        // Process n-grams
        for (let n = 1; n <= 3; n++) {
          const ngrams = generateNgrams(tokens, n);
          
          ngrams.forEach(ngram => {
            // Count occurrences
            if (!ngramCounts[n][ngram]) {
              ngramCounts[n][ngram] = 0;
              ngramScores[n][ngram] = [];
            }
            
            ngramCounts[n][ngram]++;
            ngramScores[n][ngram].push(score);
          });
        }
      } catch (error) {
        console.error('Error processing conversation:', error);
      }
    });
    
    // Calculate average scores and correlations
    const correlations = {
      '1': [], // Monograms
      '2': [], // Bigrams
      '3': []  // Trigrams
    };
    
    const minOccurrences = 3; // Minimum occurrences to consider
    
    // Process each n-gram type
    for (let n = 1; n <= 3; n++) {
      Object.keys(ngramCounts[n]).forEach(ngram => {
        const count = ngramCounts[n][ngram];
        
        // Only consider n-grams that appear multiple times
        if (count >= minOccurrences) {
          const scores = ngramScores[n][ngram];
          const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
          
          correlations[n].push({
            ngram,
            count,
            avgScore
          });
        }
      });
      
      // Sort by average score
      correlations[n].sort((a, b) => b.avgScore - a.avgScore);
    }
    
    // Evaluate on test set
    const testResults = evaluateOnTestSet(testingSet, correlations);
    
    return {
      trainingSize: trainingSet.length,
      testingSize: testingSet.length,
      positiveCorrelations: {
        monograms: correlations['1'].slice(0, 10),
        bigrams: correlations['2'].slice(0, 10),
        trigrams: correlations['3'].slice(0, 10)
      },
      negativeCorrelations: {
        monograms: correlations['1'].slice(-10).reverse(),
        bigrams: correlations['2'].slice(-10).reverse(),
        trigrams: correlations['3'].slice(-10).reverse()
      },
      testResults
    };
  } catch (error) {
    console.error('Error analyzing conversations:', error);
    return { error: error.message };
  }
}

/**
 * Evaluate the correlations on the test set
 * @param {Array} testSet - The test set of conversations
 * @param {Object} correlations - The correlations from training
 * @returns {Object} - Test results
 */
function evaluateOnTestSet(testSet, correlations) {
  const predictedScores = [];
  const actualScores = [];
  
  testSet.forEach(conversation => {
    try {
      // Parse conversation data
      const conversationData = typeof conversation.conversation_data === 'string' 
        ? JSON.parse(conversation.conversation_data) 
        : conversation.conversation_data;
      
      // Extract text and actual score
      const text = extractTextFromConversation(conversationData);
      const actualScore = parseFloat(conversation.score);
      
      // Skip if no valid score
      if (isNaN(actualScore)) return;
      
      actualScores.push(actualScore);
      
      // Tokenize
      const tokens = tokenizeAndClean(text);
      
      // Calculate predicted score based on n-gram correlations
      let scoreContributions = 0;
      let contributingNgrams = 0;
      
      // Check for each n-gram type
      for (let n = 1; n <= 3; n++) {
        const ngrams = generateNgrams(tokens, n);
        
        ngrams.forEach(ngram => {
          // Find this n-gram in our correlations
          const match = correlations[n].find(item => item.ngram === ngram);
          
          if (match) {
            scoreContributions += match.avgScore;
            contributingNgrams++;
          }
        });
      }
      
      // Calculate predicted score (or default to average if no matches)
      const predictedScore = contributingNgrams > 0 
        ? scoreContributions / contributingNgrams 
        : 3; // Default middle score
      
      predictedScores.push(predictedScore);
    } catch (error) {
      console.error('Error evaluating conversation:', error);
    }
  });
  
  // Calculate evaluation metrics
  const meanAbsoluteError = calculateMAE(actualScores, predictedScores);
  const rootMeanSquaredError = calculateRMSE(actualScores, predictedScores);
  const correlationCoefficient = calculateCorrelation(actualScores, predictedScores);
  
  return {
    meanAbsoluteError,
    rootMeanSquaredError,
    correlationCoefficient,
    sampleSize: actualScores.length
  };
}

/**
 * Calculate Mean Absolute Error
 * @param {number[]} actual - Actual values
 * @param {number[]} predicted - Predicted values
 * @returns {number} - MAE value
 */
function calculateMAE(actual, predicted) {
  if (actual.length !== predicted.length || actual.length === 0) {
    return 0;
  }
  
  const sum = actual.reduce((acc, val, i) => {
    return acc + Math.abs(val - predicted[i]);
  }, 0);
  
  return sum / actual.length;
}

/**
 * Calculate Root Mean Squared Error
 * @param {number[]} actual - Actual values
 * @param {number[]} predicted - Predicted values
 * @returns {number} - RMSE value
 */
function calculateRMSE(actual, predicted) {
  if (actual.length !== predicted.length || actual.length === 0) {
    return 0;
  }
  
  const sum = actual.reduce((acc, val, i) => {
    return acc + Math.pow(val - predicted[i], 2);
  }, 0);
  
  return Math.sqrt(sum / actual.length);
}

/**
 * Calculate Pearson correlation coefficient
 * @param {number[]} x - First array
 * @param {number[]} y - Second array
 * @returns {number} - Correlation coefficient
 */
function calculateCorrelation(x, y) {
  if (x.length !== y.length || x.length === 0) {
    return 0;
  }
  
  const n = x.length;
  
  // Calculate means
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  
  // Calculate sums for correlation formula
  let numerator = 0;
  let xDenom = 0;
  let yDenom = 0;
  
  for (let i = 0; i < n; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;
    
    numerator += xDiff * yDiff;
    xDenom += xDiff * xDiff;
    yDenom += yDiff * yDiff;
  }
  
  // Prevent division by zero
  if (xDenom === 0 || yDenom === 0) {
    return 0;
  }
  
  return numerator / Math.sqrt(xDenom * yDenom);
} 