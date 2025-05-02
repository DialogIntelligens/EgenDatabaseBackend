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
 * Calculate correlation between n-grams and scores
 * @param {Array} conversations - Array of conversation objects
 * @returns {Object} - Analysis results
 */
export async function analyzeConversations(conversations) {
  try {
    console.log(`Starting analysis of ${conversations.length} conversations`);
    
    // Validate input
    if (!Array.isArray(conversations) || conversations.length < 10) {
      console.log(`Insufficient data for analysis: ${conversations?.length || 0} conversations (minimum 10 required)`);
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
    
    console.log(`Split data: ${trainingSet.length} training, ${testingSet.length} testing conversations`);
    
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
    let validConversations = 0;
    let invalidConversations = 0;
    let invalidReasons = {
      noData: 0,
      parseError: 0,
      notArray: 0,
      noText: 0,
      noScore: 0,
      noTokens: 0
    };
    
    trainingSet.forEach((conversation, index) => {
      try {
        // Skip if no conversation_data
        if (!conversation.conversation_data) {
          console.log(`Conversation ${index} skipped: No conversation_data`);
          invalidConversations++;
          invalidReasons.noData++;
          return;
        }
        
        // Parse conversation data
        let conversationData;
        try {
          conversationData = typeof conversation.conversation_data === 'string' 
            ? JSON.parse(conversation.conversation_data) 
            : conversation.conversation_data;
          
          // Log a sample of the conversation structure for debugging
          if (index === 0) {
            console.log("Sample conversation structure:", 
              JSON.stringify(conversationData.slice(0, Math.min(3, conversationData.length)), null, 2));
          }
        } catch (parseError) {
          console.warn(`Conversation ${index} skipped: Parse error - ${parseError.message}`);
          invalidConversations++;
          invalidReasons.parseError++;
          return; // Skip this conversation
        }
        
        // Skip if no valid conversation data
        if (!Array.isArray(conversationData)) {
          console.log(`Conversation ${index} skipped: conversation_data is not an array`);
          invalidConversations++;
          invalidReasons.notArray++;
          return;
        }
        
        // Extract text and score
        const text = extractTextFromConversation(conversationData);
        
        // Skip if no text
        if (!text || text.trim() === '') {
          console.log(`Conversation ${index} skipped: No text extracted`);
          invalidConversations++;
          invalidReasons.noText++;
          return;
        }
        
        const score = parseFloat(conversation.score);
        
        // Skip if no valid score
        if (isNaN(score)) {
          console.log(`Conversation ${index} skipped: Invalid score - ${conversation.score}`);
          invalidConversations++;
          invalidReasons.noScore++;
          return;
        }
        
        // Tokenize
        const tokens = tokenizeAndClean(text);
        
        // Skip if no tokens
        if (!tokens || tokens.length === 0) {
          console.log(`Conversation ${index} skipped: No tokens after cleaning`);
          invalidConversations++;
          invalidReasons.noTokens++;
          return;
        }
        
        // Process n-grams
        let ngramCount = 0;
        for (let n = 1; n <= 3; n++) {
          // Skip if not enough tokens for this n-gram size
          if (tokens.length < n) {
            console.log(`Skipping ${n}-grams for conversation ${index}: Not enough tokens (${tokens.length})`);
            continue;
          }
          
          const ngrams = generateNgrams(tokens, n);
          ngramCount += ngrams.length;
          
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
        
        console.log(`Processed conversation ${index}: Score ${score}, Tokens ${tokens.length}, N-grams ${ngramCount}`);
        validConversations++;
      } catch (error) {
        console.error(`Error processing conversation ${index}:`, error);
        invalidConversations++;
      }
    });
    
    console.log(`Processed training data: ${validConversations} valid, ${invalidConversations} invalid conversations`);
    console.log('Invalid reasons:', JSON.stringify(invalidReasons));
    
    // Check if we have enough valid conversations for analysis
    if (validConversations < 5) {
      console.log(`Insufficient valid conversations: ${validConversations} (minimum 5 required)`);
      return {
        error: 'Insufficient valid data for analysis',
        minimumRequired: 5,
        provided: validConversations,
        invalidReasons
      };
    }
    
    // Count the ngrams collected
    const ngramStats = {
      '1': Object.keys(ngramCounts['1']).length,
      '2': Object.keys(ngramCounts['2']).length,
      '3': Object.keys(ngramCounts['3']).length
    };
    console.log('N-gram counts:', JSON.stringify(ngramStats));
    
    // Calculate average scores and correlations
    const correlations = {
      '1': [], // Monograms
      '2': [], // Bigrams
      '3': []  // Trigrams
    };
    
    const minOccurrences = 3; // Minimum occurrences to consider
    let filteredCounts = { '1': 0, '2': 0, '3': 0 };
    
    // Process each n-gram type
    for (let n = 1; n <= 3; n++) {
      Object.keys(ngramCounts[n]).forEach(ngram => {
        const count = ngramCounts[n][ngram];
        
        // Only consider n-grams that appear multiple times
        if (count >= minOccurrences) {
          filteredCounts[n]++;
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
      
      console.log(`Found ${correlations[n].length} ${n}-grams with ≥${minOccurrences} occurrences`);
      if (correlations[n].length > 0) {
        console.log(`  Top ${n}-gram: "${correlations[n][0]?.ngram}" (Score: ${correlations[n][0]?.avgScore.toFixed(2)})`);
        console.log(`  Bottom ${n}-gram: "${correlations[n][correlations[n].length-1]?.ngram}" (Score: ${correlations[n][correlations[n].length-1]?.avgScore.toFixed(2)})`);
      }
    }
    
    console.log("Starting evaluation on test set...");
    // Evaluate on test set
    const testResults = evaluateOnTestSet(testingSet, correlations);
    console.log("Test results:", JSON.stringify(testResults));
    
    // Prepare result object with positive and negative correlations
    const result = {
      trainingSize: trainingSet.length,
      validTrainingSize: validConversations,
      testingSize: testingSet.length,
      validTestingSize: testResults.sampleSize,
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
      testResults,
      ngramStats
    };
    
    console.log("Text analysis completed successfully");
    
    // Debug log for correlation counts
    console.log(`Positive monograms: ${result.positiveCorrelations.monograms.length}`);
    console.log(`Negative monograms: ${result.negativeCorrelations.monograms.length}`);
    
    return result;
  } catch (error) {
    console.error('Error analyzing conversations:', error);
    return { 
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Evaluate the correlations on the test set
 * @param {Array} testSet - The test set of conversations
 * @param {Object} correlations - The correlations from training
 * @returns {Object} - Test results
 */
function evaluateOnTestSet(testSet, correlations) {
  console.log(`Evaluating model on ${testSet.length} test conversations`);
  
  const predictedScores = [];
  const actualScores = [];
  let processedCount = 0;
  let skippedCount = 0;
  let skippedReasons = {
    noData: 0,
    parseError: 0,
    notArray: 0,
    noText: 0,
    noScore: 0,
    noTokens: 0
  };
  
  testSet.forEach((conversation, index) => {
    try {
      // Skip if no conversation_data
      if (!conversation.conversation_data) {
        console.log(`Test conversation ${index} skipped: No conversation_data`);
        skippedCount++;
        skippedReasons.noData++;
        return;
      }
      
      // Parse conversation data
      let conversationData;
      try {
        conversationData = typeof conversation.conversation_data === 'string' 
          ? JSON.parse(conversation.conversation_data) 
          : conversation.conversation_data;
        
        // Log a sample of the test conversation structure for debugging
        if (index === 0) {
          console.log("Sample test conversation structure:", 
            JSON.stringify(conversationData.slice(0, Math.min(3, conversationData.length)), null, 2));
        }
      } catch (parseError) {
        console.warn(`Test conversation ${index} skipped: Parse error - ${parseError.message}`);
        skippedCount++;
        skippedReasons.parseError++;
        return; // Skip this conversation
      }
      
      // Skip if no valid conversation data
      if (!Array.isArray(conversationData)) {
        console.log(`Test conversation ${index} skipped: conversation_data is not an array`);
        skippedCount++;
        skippedReasons.notArray++;
        return;
      }
      
      // Extract text and actual score
      const text = extractTextFromConversation(conversationData);
      
      // Skip if no text
      if (!text || text.trim() === '') {
        console.log(`Test conversation ${index} skipped: No text extracted`);
        skippedCount++;
        skippedReasons.noText++;
        return;
      }
      
      const actualScore = parseFloat(conversation.score);
      
      // Skip if no valid score
      if (isNaN(actualScore)) {
        console.log(`Test conversation ${index} skipped: Invalid score - ${conversation.score}`);
        skippedCount++;
        skippedReasons.noScore++;
        return;
      }
      
      // Tokenize
      const tokens = tokenizeAndClean(text);
      
      // Skip if no tokens
      if (!tokens || tokens.length === 0) {
        console.log(`Test conversation ${index} skipped: No tokens after cleaning`);
        skippedCount++;
        skippedReasons.noTokens++;
        return;
      }
      
      actualScores.push(actualScore);
      
      // Calculate predicted score based on n-gram correlations
      let scoreContributions = 0;
      let contributingNgrams = 0;
      
      // Check for each n-gram type
      for (let n = 1; n <= 3; n++) {
        // Skip if not enough tokens for this n-gram size
        if (tokens.length < n) continue;
        
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
      processedCount++;
      
      console.log(`Test conversation ${index}: Actual score ${actualScore}, Predicted score ${predictedScore.toFixed(2)}, Contributing n-grams: ${contributingNgrams}`);
    } catch (error) {
      console.error(`Error evaluating test conversation ${index}:`, error);
      skippedCount++;
    }
  });
  
  console.log(`Evaluation complete: ${processedCount} processed, ${skippedCount} skipped`);
  console.log('Skipped reasons:', JSON.stringify(skippedReasons));
  
  // Check if we have enough predictions to evaluate
  if (actualScores.length === 0 || predictedScores.length === 0) {
    console.log('No valid test data for evaluation');
    return {
      meanAbsoluteError: 0,
      rootMeanSquaredError: 0,
      correlationCoefficient: 0,
      sampleSize: 0,
      skippedReasons
    };
  }
  
  // Calculate evaluation metrics
  const meanAbsoluteError = calculateMAE(actualScores, predictedScores);
  const rootMeanSquaredError = calculateRMSE(actualScores, predictedScores);
  const correlationCoefficient = calculateCorrelation(actualScores, predictedScores);
  
  console.log(`Evaluation metrics: MAE=${meanAbsoluteError.toFixed(2)}, RMSE=${rootMeanSquaredError.toFixed(2)}, Correlation=${correlationCoefficient.toFixed(2)}`);
  
  return {
    meanAbsoluteError,
    rootMeanSquaredError,
    correlationCoefficient,
    sampleSize: actualScores.length,
    skippedReasons
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