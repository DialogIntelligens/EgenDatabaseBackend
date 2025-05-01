import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

// Function to generate a PDF report based on statistics data
export async function generateStatisticsReport(data, timePeriod) {
  return new Promise((resolve, reject) => {
    try {
      // Create a document
      const doc = new PDFDocument({ margin: 50 });
      
      // Create a buffer to store the PDF
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      
      // Add title
      doc.fontSize(20).text('Statistics Report', { align: 'center' });
      doc.moveDown();
      
      // Add time period information
      doc.fontSize(12).text(`Time Period: ${formatTimePeriod(timePeriod)}`, { align: 'center' });
      doc.moveDown(2);
      
      // Add summary statistics
      doc.fontSize(16).text('Summary Statistics', { underline: true });
      doc.moveDown();
      
      const { 
        totalMessages, 
        averageMessagesPerDay, 
        totalConversations, 
        totalCustomerRatings, 
        averageCustomerRating,
        thumbsRating,
        totalVisitors,
        overallConversionRate,
        chatbotConversionRate,
        nonChatbotConversionRate,
        showPurchase
      } = data;
      
      // Add basic statistics
      doc.fontSize(12).text(`Total Messages: ${totalMessages}`);
      doc.fontSize(12).text(`Average Messages Per Day: ${averageMessagesPerDay}`);
      doc.fontSize(12).text(`Total Conversations: ${totalConversations}`);
      doc.fontSize(12).text(`Total User Ratings: ${totalCustomerRatings}`);
      
      // Rating information
      if (thumbsRating) {
        doc.fontSize(12).text(`Thumbs Up Percentage: ${averageCustomerRating}`);
      } else {
        doc.fontSize(12).text(`Average Rating: ${averageCustomerRating}`);
      }
      
      // Add conversion statistics if applicable
      if (showPurchase) {
        doc.moveDown();
        doc.fontSize(16).text('Conversion Statistics', { underline: true });
        doc.moveDown();
        
        doc.fontSize(12).text(`Total Visitors: ${totalVisitors}`);
        doc.fontSize(12).text(`Overall Conversion Rate: ${overallConversionRate}%`);
        doc.fontSize(12).text(`Chatbot Conversion Rate: ${chatbotConversionRate}%`);
        doc.fontSize(12).text(`Non-Chatbot Conversion Rate: ${nonChatbotConversionRate}%`);
      }
      
      // Add chart data information
      if (data.dailyData) {
        doc.moveDown();
        doc.fontSize(16).text('Daily Message Data', { underline: true });
        doc.moveDown();
        
        const chartData = data.dailyData;
        // For simplicity, show tabular data instead of chart
        if (chartData.labels && chartData.datasets && chartData.datasets.length > 0) {
          const labels = chartData.labels;
          const values = chartData.datasets[0].data;
          
          // Create a simple table
          for (let i = 0; i < Math.min(labels.length, values.length); i++) {
            doc.fontSize(10).text(`${labels[i]}: ${values[i]}`);
          }
        }
      }
      
      // Topic distribution
      if (data.emneData) {
        doc.moveDown();
        doc.fontSize(16).text('Topic Distribution', { underline: true });
        doc.moveDown();
        
        const emneData = data.emneData;
        if (emneData.labels && emneData.datasets && emneData.datasets.length > 0) {
          const labels = emneData.labels;
          const values = emneData.datasets[0].data;
          
          // Create a simple table
          for (let i = 0; i < Math.min(labels.length, values.length); i++) {
            doc.fontSize(10).text(`${labels[i]}: ${values[i]}%`);
          }
        }
      }
      
      // Add text analysis results if available
      if (data.textAnalysis) {
        addTextAnalysisSection(doc, data.textAnalysis);
      }
      
      // Add footer
      doc.moveDown(2);
      const date = new Date();
      doc.fontSize(10).text(`Report generated on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`, { align: 'center' });
      
      // Finalize the PDF
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Add text analysis section to the report
 * @param {PDFDocument} doc - The PDF document
 * @param {Object} textAnalysis - The text analysis results
 */
function addTextAnalysisSection(doc, textAnalysis) {
  try {
    // Add a page break for this section
    doc.addPage();
    
    // Add section title
    doc.fontSize(18).text('Conversation Text Analysis', { align: 'center' });
    doc.moveDown();
    
    // Add dataset information
    doc.fontSize(12).text(`Analysis based on ${textAnalysis.trainingSize + textAnalysis.testingSize} conversations`);
    doc.fontSize(12).text(`Training set: ${textAnalysis.trainingSize} conversations`);
    doc.fontSize(12).text(`Testing set: ${textAnalysis.testingSize} conversations`);
    doc.moveDown();
    
    // Add test results
    if (textAnalysis.testResults) {
      doc.fontSize(16).text('Model Performance', { underline: true });
      doc.moveDown();
      
      const { 
        meanAbsoluteError, 
        rootMeanSquaredError, 
        correlationCoefficient,
        sampleSize 
      } = textAnalysis.testResults;
      
      doc.fontSize(12).text(`Sample Size: ${sampleSize} conversations`);
      doc.fontSize(12).text(`Mean Absolute Error: ${meanAbsoluteError.toFixed(2)}`);
      doc.fontSize(12).text(`Root Mean Squared Error: ${rootMeanSquaredError.toFixed(2)}`);
      doc.fontSize(12).text(`Correlation Coefficient: ${correlationCoefficient.toFixed(2)}`);
      doc.moveDown(2);
    }
    
    // Add positive correlations
    if (textAnalysis.positiveCorrelations) {
      doc.fontSize(16).text('Positive Score Correlations', { underline: true });
      doc.moveDown();
      
      // Monograms
      if (textAnalysis.positiveCorrelations.monograms && textAnalysis.positiveCorrelations.monograms.length > 0) {
        doc.fontSize(14).text('Top Words (Monograms)');
        doc.moveDown(0.5);
        
        textAnalysis.positiveCorrelations.monograms.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
      
      // Bigrams
      if (textAnalysis.positiveCorrelations.bigrams && textAnalysis.positiveCorrelations.bigrams.length > 0) {
        doc.fontSize(14).text('Top Word Pairs (Bigrams)');
        doc.moveDown(0.5);
        
        textAnalysis.positiveCorrelations.bigrams.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
      
      // Trigrams
      if (textAnalysis.positiveCorrelations.trigrams && textAnalysis.positiveCorrelations.trigrams.length > 0) {
        doc.fontSize(14).text('Top Word Triplets (Trigrams)');
        doc.moveDown(0.5);
        
        textAnalysis.positiveCorrelations.trigrams.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
    }
    
    // Add a page break for negative correlations
    doc.addPage();
    
    // Add negative correlations
    if (textAnalysis.negativeCorrelations) {
      doc.fontSize(16).text('Negative Score Correlations', { underline: true });
      doc.moveDown();
      
      // Monograms
      if (textAnalysis.negativeCorrelations.monograms && textAnalysis.negativeCorrelations.monograms.length > 0) {
        doc.fontSize(14).text('Bottom Words (Monograms)');
        doc.moveDown(0.5);
        
        textAnalysis.negativeCorrelations.monograms.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
      
      // Bigrams
      if (textAnalysis.negativeCorrelations.bigrams && textAnalysis.negativeCorrelations.bigrams.length > 0) {
        doc.fontSize(14).text('Bottom Word Pairs (Bigrams)');
        doc.moveDown(0.5);
        
        textAnalysis.negativeCorrelations.bigrams.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
      
      // Trigrams
      if (textAnalysis.negativeCorrelations.trigrams && textAnalysis.negativeCorrelations.trigrams.length > 0) {
        doc.fontSize(14).text('Bottom Word Triplets (Trigrams)');
        doc.moveDown(0.5);
        
        textAnalysis.negativeCorrelations.trigrams.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
    }
    
    // Add interpretation note
    doc.moveDown();
    doc.fontSize(11).text('Note: These correlations indicate words/phrases that tend to appear in conversations with higher or lower satisfaction scores. The score range is based on your conversation rating system.', {
      align: 'left',
      width: 500
    });
    
  } catch (error) {
    console.error('Error adding text analysis to report:', error);
    doc.fontSize(12).text('Error generating text analysis section');
  }
}

// Helper function to format time period information
function formatTimePeriod(timePeriod) {
  if (!timePeriod) return 'All Time';
  
  if (timePeriod === 'all') {
    return 'All Time';
  } else if (timePeriod === '7') {
    return 'Last 7 Days';
  } else if (timePeriod === '30') {
    return 'Last 30 Days';
  } else if (timePeriod === 'yesterday') {
    return 'Yesterday';
  } else if (timePeriod === 'custom' && timePeriod.startDate && timePeriod.endDate) {
    const start = new Date(timePeriod.startDate);
    const end = new Date(timePeriod.endDate);
    return `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
  }
  
  return 'Custom Range';
} 