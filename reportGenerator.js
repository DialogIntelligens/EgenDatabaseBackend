import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

// Helper function to add a base64 image to the PDF
function addBase64ImageToPdf(doc, base64String, options = {}) {
  if (!base64String) {
    console.log('Base64 image data is missing');
    return false;
  }
  
  try {
    // Remove the data URL prefix if present
    const imageData = base64String.includes('base64,') 
      ? base64String.split('base64,')[1] 
      : base64String;
    
    // Add image to the PDF
    doc.image(Buffer.from(imageData, 'base64'), {
      fit: [500, 350],
      align: 'center',
      valign: 'center',
      ...options
    });
    
    return true;
  } catch (error) {
    console.error('Error adding base64 image to PDF:', error);
    return false;
  }
}

// We can remove the drawBarInPdf and createVisualTable functions
// since we're not using them anymore for fallback visualizations

// Function to generate a PDF report based on statistics data
export async function generateStatisticsReport(data, timePeriod) {
  return new Promise(async (resolve, reject) => {
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
      doc.fontSize(20)
         .fillColor('#333')
         .text('Statistics Report', { align: 'center' });
      
      doc.moveDown();
      
      // Add time period information
      doc.fontSize(12)
         .fillColor('#666')
         .text(`Time Period: ${formatTimePeriod(timePeriod)}`, { align: 'center' });
      
      doc.moveDown(2);
      
      // Add summary statistics
      doc.fillColor('#333')
         .fontSize(16)
         .text('Summary Statistics', { underline: true });
      
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
        showPurchase,
        chartImages // Chart images from screen capture
      } = data;
      
      // Add basic statistics as simple text (not visualized)
      doc.fillColor('#333').fontSize(12);
      doc.text(`Total Messages: ${totalMessages}`);
      doc.text(`Average Messages Per Day: ${averageMessagesPerDay}`);
      doc.text(`Total Conversations: ${totalConversations}`);
      doc.text(`Total User Ratings: ${totalCustomerRatings}`);
      doc.text(`${thumbsRating ? 'Thumbs Up Percentage' : 'Average Rating'}: ${averageCustomerRating}`);

      // Add conversion statistics if applicable
      if (showPurchase) {
        doc.moveDown();
        doc.fillColor('#333')
           .fontSize(16)
           .text('Conversion Statistics', { underline: true });
        doc.moveDown();
        
        doc.fillColor('#333').fontSize(12);
        doc.text(`Total Visitors: ${totalVisitors}`);
        doc.text(`Overall Conversion Rate: ${overallConversionRate}%`);
        doc.text(`Chatbot Conversion Rate: ${chatbotConversionRate}%`);
        doc.text(`Non-Chatbot Conversion Rate: ${nonChatbotConversionRate}%`);
      }
      
      // Add daily/weekly messages chart (only if image is available)
      doc.addPage();
      doc.fillColor('#333')
         .fontSize(16)
         .text('Message Volume Over Time', { align: 'center' });
      doc.moveDown();
      
      if (chartImages?.dailyChart) {
        const imageAdded = addBase64ImageToPdf(doc, chartImages.dailyChart);
        if (!imageAdded) {
          doc.fillColor('#666')
             .fontSize(12)
             .text('Chart image could not be generated. Please try again.', { align: 'center' });
        }
      } else {
        doc.fillColor('#666')
           .fontSize(12)
           .text('Chart image not available for this time period.', { align: 'center' });
      }

      // Add hourly distribution chart (only if image is available)
      doc.addPage();
      doc.fillColor('#333')
         .fontSize(16)
         .text('Message Distribution by Time of Day', { align: 'center' });
      doc.moveDown();
      
      if (chartImages?.hourlyChart) {
        const imageAdded = addBase64ImageToPdf(doc, chartImages.hourlyChart);
        if (!imageAdded) {
          doc.fillColor('#666')
             .fontSize(12)
             .text('Chart image could not be generated. Please try again.', { align: 'center' });
        }
      } else {
        doc.fillColor('#666')
           .fontSize(12)
           .text('Chart image not available for this time period.', { align: 'center' });
      }

      // Add topic distribution chart (only if image is available)
      doc.addPage();
      doc.fillColor('#333')
         .fontSize(16)
         .text('Conversation Topics Distribution', { align: 'center' });
      doc.moveDown();
      
      if (chartImages?.topicChart) {
        const imageAdded = addBase64ImageToPdf(doc, chartImages.topicChart);
        if (!imageAdded) {
          doc.fillColor('#666')
             .fontSize(12)
             .text('Chart image could not be generated. Please try again.', { align: 'center' });
        }
      } else {
        doc.fillColor('#666')
           .fontSize(12)
           .text('Chart image not available for this time period.', { align: 'center' });
      }
      
      // Text analysis section remains the same...
      if (data.includeTextAnalysis && data.textAnalysis) {
        try {
          await addTextAnalysisSection(doc, data.textAnalysis);
        } catch (analysisError) {
          console.error("Error adding text analysis section:", analysisError);
        }
      }
      
      // Add footer
      doc.moveDown(2);
      const date = new Date();
      doc.fontSize(10)
         .fillColor('#999')
         .text(`Report generated on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`, { align: 'center' });
      
      // Finalize the PDF
      doc.end();
      
    } catch (error) {
      console.error('Error generating report:', error);
      reject(error);
    }
  });
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

// Text analysis section (remains the same)
async function addTextAnalysisSection(doc, textAnalysis) {
  try {
    // Add a page break for this section
    doc.addPage();
    
    // Add section title
    doc.fillColor('#333')
       .fontSize(18)
       .text('Conversation Text Analysis', { align: 'center' });
    
    doc.moveDown();
    
    // Add dataset information
    doc.fillColor('#666')
       .fontSize(12)
       .text(`Analysis based on ${textAnalysis.trainingSize + textAnalysis.testingSize} conversations`);
    
    doc.fontSize(12)
       .text(`Training set: ${textAnalysis.trainingSize} conversations (${textAnalysis.validTrainingSize} valid)`);
    
    doc.fontSize(12)
       .text(`Testing set: ${textAnalysis.testingSize} conversations (${textAnalysis.validTestingSize} valid)`);
    
    doc.moveDown();
    
    // Add test results as text (no visualizations)
    if (textAnalysis.testResults) {
      doc.fillColor('#333')
         .fontSize(16)
         .text('Model Performance', { underline: true });
      
      doc.moveDown();
      
      const { 
        meanAbsoluteError, 
        rootMeanSquaredError, 
        correlationCoefficient,
        sampleSize 
      } = textAnalysis.testResults;
      
      doc.fillColor('#666').fontSize(12);
      doc.text(`Sample Size: ${sampleSize} conversations`);
      doc.text(`Mean Absolute Error: ${meanAbsoluteError.toFixed(2)}`);
      doc.text(`Root Mean Squared Error: ${rootMeanSquaredError.toFixed(2)}`);
      doc.text(`Correlation Coefficient: ${correlationCoefficient.toFixed(2)}`);
      doc.moveDown();
    }
    
    // Add positive correlations as text lists
    if (textAnalysis.positiveCorrelations && textAnalysis.positiveCorrelations.monograms) {
      doc.addPage();
      
      doc.fillColor('#333')
         .fontSize(16)
         .text('Positive Score Correlations', { underline: true });
      
      doc.moveDown();
      
      // Monograms as text list
      if (textAnalysis.positiveCorrelations.monograms && textAnalysis.positiveCorrelations.monograms.length > 0) {
        doc.fillColor('#333').fontSize(14).text('Top Words (Monograms)');
        doc.moveDown(0.5);
        
        doc.fillColor('#666').fontSize(10);
        textAnalysis.positiveCorrelations.monograms.slice(0, 15).forEach((item, index) => {
          doc.text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      } else {
        doc.fillColor('#666').fontSize(12).text('No significant monogram correlations found.');
        doc.moveDown();
      }
      
      // Bigrams as text list
      if (textAnalysis.positiveCorrelations.bigrams && textAnalysis.positiveCorrelations.bigrams.length > 0) {
        doc.fillColor('#333')
           .fontSize(14)
           .text('Top Word Pairs (Bigrams)');
        
        doc.moveDown(0.5);
        
        doc.fillColor('#666')
           .fontSize(10);
        
        textAnalysis.positiveCorrelations.bigrams.slice(0, 10).forEach((item, index) => {
          doc.text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        
        doc.moveDown();
      }
    }
    
    // Add negative correlations as text lists
    if (textAnalysis.negativeCorrelations && textAnalysis.negativeCorrelations.monograms) {
      doc.addPage();
      
      doc.fillColor('#333')
         .fontSize(16)
         .text('Negative Score Correlations', { underline: true });
      
      doc.moveDown();
      
      // Monograms as text list
      if (textAnalysis.negativeCorrelations.monograms && textAnalysis.negativeCorrelations.monograms.length > 0) {
        doc.fillColor('#333').fontSize(14).text('Bottom Words (Monograms)');
        doc.moveDown(0.5);
        
        doc.fillColor('#666').fontSize(10);
        textAnalysis.negativeCorrelations.monograms.slice(0, 15).forEach((item, index) => {
          doc.text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      } else {
        doc.fillColor('#666').fontSize(12).text('No significant negative monogram correlations found.');
        doc.moveDown();
      }
      
      // Bigrams as text list
      if (textAnalysis.negativeCorrelations.bigrams && textAnalysis.negativeCorrelations.bigrams.length > 0) {
        doc.fillColor('#333')
           .fontSize(14)
           .text('Bottom Word Pairs (Bigrams)');
        
        doc.moveDown(0.5);
        
        doc.fillColor('#666')
           .fontSize(10);
        
        textAnalysis.negativeCorrelations.bigrams.slice(0, 10).forEach((item, index) => {
          doc.text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        
        doc.moveDown();
      }
    }
    
    // Add interpretation note
    doc.moveDown();
    
    doc.fillColor('#666')
       .fontSize(11)
       .text('Note: These correlations indicate words/phrases that tend to appear in conversations with higher or lower satisfaction scores. The score range is based on your conversation rating system.', {
        align: 'left',
        width: 500
      });
    
  } catch (error) {
    console.error('Error adding text analysis to report:', error);
    throw error;
  }
} 