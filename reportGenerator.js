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

// Helper function to create a visual bar in the PDF
function drawBarInPdf(doc, value, maxValue, width, height, color, x, y) {
  const barWidth = (value / maxValue) * width;
  
  // Draw background bar
  doc.rect(x, y, width, height).fill('#f0f0f0');
  
  // Draw value bar
  doc.rect(x, y, barWidth, height).fill(color);
  
  // Return the bottom y position
  return y + height;
}

// Function to create a visual data table in the PDF (used as fallback)
function createVisualTable(doc, items, title, options = {}) {
  const {
    maxItems = 20,
    barWidth = 300,
    barHeight = 20,
    spacing = 25,
    labelWidth = 150,
    startX = 70,
    startY = doc.y + 10,
    color = '#777BFF',
    sortOrder = 'desc',
    valuePrefix = '',
    valueSuffix = '',
    showPercent = false,
    maxValue = null
  } = options;
  
  // Set title
  doc.fontSize(14).text(title, { underline: true });
  doc.moveDown(0.5);
  
  if (!items || items.length === 0) {
    doc.fontSize(12).text('No data available');
    doc.moveDown();
    return;
  }
  
  // Calculate max value if not provided
  const calculatedMax = maxValue || Math.max(...items.map(item => item.value || 0));
  
  // Prepare data for display
  let displayItems = [...items];
  
  // Sort if needed
  if (sortOrder === 'desc') {
    displayItems.sort((a, b) => b.value - a.value);
  } else if (sortOrder === 'asc') {
    displayItems.sort((a, b) => a.value - b.value);
  }
  
  // Limit items to maxItems
  displayItems = displayItems.slice(0, maxItems);
  
  let currentY = startY;
  
  // Draw headers
  doc.font('Helvetica-Bold')
     .fontSize(10)
     .text('Label', startX, currentY)
     .text('Value', startX + labelWidth + barWidth + 10, currentY);
  
  currentY += 20;
  
  // Draw items
  displayItems.forEach((item, index) => {
    // Draw label
    doc.font('Helvetica')
       .fontSize(10)
       .text(item.label || 'Unknown', startX, currentY, { width: labelWidth });
    
    // Draw value text
    const valueText = `${valuePrefix}${item.value.toFixed(1)}${valueSuffix}${showPercent ? '%' : ''}`;
    doc.text(valueText, startX + labelWidth + barWidth + 10, currentY);
    
    // Draw bar
    drawBarInPdf(
      doc, 
      item.value, 
      calculatedMax, 
      barWidth, 
      barHeight, 
      color, 
      startX + labelWidth, 
      currentY
    );
    
    // Move to next item
    currentY += spacing;
  });
  
  // Update document Y position
  doc.y = currentY + 10;
  doc.moveDown();
  
  return doc.y;
}

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
        dailyData,
        hourlyData,
        emneData,
        chartImages // <-- Use chart images
      } = data;
      
      // Use visual table for summary stats
      const statItems = [
        { label: 'Total Messages', value: totalMessages },
        { label: 'Average Messages Per Day', value: parseFloat(averageMessagesPerDay) || 0 },
        { label: 'Total Conversations', value: totalConversations },
        { label: 'Total User Ratings', value: totalCustomerRatings },
        { label: thumbsRating ? 'Thumbs Up Percentage' : 'Average Rating', 
          value: parseFloat(averageCustomerRating) || 0 }
      ];
      createVisualTable(doc, statItems, 'Key Metrics', {
        barWidth: 200, color: '#686BF1', showPercent: thumbsRating, sortOrder: null, maxValue: thumbsRating ? 100 : null
      });

      // Add conversion statistics if applicable
      if (showPurchase) {
        doc.moveDown();
        doc.fillColor('#333')
           .fontSize(16)
           .text('Conversion Statistics', { underline: true });
        doc.moveDown();
        const conversionItems = [
          { label: 'Total Visitors', value: totalVisitors },
          { label: 'Overall Conversion Rate', value: parseFloat(overallConversionRate) || 0 },
          { label: 'Chatbot Conversion Rate', value: parseFloat(chatbotConversionRate) || 0 },
          { label: 'Non-Chatbot Conversion Rate', value: parseFloat(nonChatbotConversionRate) || 0 }
        ];
        createVisualTable(doc, conversionItems, 'Conversion Metrics', {
          barWidth: 200, color: '#4CAF50', showPercent: true, sortOrder: null, maxValue: 100
        });
      }
      
      // Add daily/weekly messages chart image or fallback table
      doc.addPage();
      doc.fillColor('#333')
         .fontSize(16)
         .text('Message Volume Over Time', { align: 'center' });
      doc.moveDown();
      if (chartImages?.dailyChart) {
        const imageAdded = addBase64ImageToPdf(doc, chartImages.dailyChart);
        if (!imageAdded) {
          console.log('Fallback to table for daily chart');
          createFallbackDailyChart(doc, dailyData); // Use fallback function
        }
      } else if (dailyData) {
        createFallbackDailyChart(doc, dailyData);
      } else {
        doc.fontSize(12).text('No message volume data available.');
      }

      // Add hourly distribution chart image or fallback table
      doc.addPage();
      doc.fillColor('#333')
         .fontSize(16)
         .text('Message Distribution by Time of Day', { align: 'center' });
      doc.moveDown();
      if (chartImages?.hourlyChart) {
        const imageAdded = addBase64ImageToPdf(doc, chartImages.hourlyChart);
        if (!imageAdded) {
          console.log('Fallback to table for hourly chart');
          createFallbackHourlyChart(doc, hourlyData);
        }
      } else if (hourlyData) {
        createFallbackHourlyChart(doc, hourlyData);
      } else {
        doc.fontSize(12).text('No hourly distribution data available.');
      }

      // Add topic distribution chart image or fallback table
      doc.addPage();
      doc.fillColor('#333')
         .fontSize(16)
         .text('Conversation Topics Distribution', { align: 'center' });
      doc.moveDown();
      if (chartImages?.topicChart) {
        const imageAdded = addBase64ImageToPdf(doc, chartImages.topicChart);
        if (!imageAdded) {
          console.log('Fallback to table for topic chart');
          createFallbackTopicChart(doc, emneData);
        }
      } else if (emneData) {
        createFallbackTopicChart(doc, emneData);
      } else {
        doc.fontSize(12).text('No topic distribution data available.');
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

// Fallback chart creation functions (using visual tables)
function createFallbackDailyChart(doc, dailyData) {
  if (!dailyData || !dailyData.labels || !dailyData.datasets || dailyData.datasets.length === 0) {
    doc.fontSize(12).text('No message volume data available.');
    return;
  }
  const items = dailyData.labels.map((label, index) => ({
    label: label,
    value: dailyData.datasets[0].data[index] || 0
  }));
  createVisualTable(doc, items, dailyData.isWeekly ? 'Messages by Week' : 'Messages by Day', {
    color: '#686BF1', sortOrder: null, valueSuffix: ' msgs'
  });
}

function createFallbackHourlyChart(doc, hourlyData) {
  if (!hourlyData || !hourlyData.labels || !hourlyData.datasets || hourlyData.datasets.length === 0) {
    doc.fontSize(12).text('No hourly distribution data available.');
    return;
  }
  const items = hourlyData.labels.map((label, index) => ({
    label: `Hour ${label}`,
    value: hourlyData.datasets[0].data[index] || 0
  }));
  createVisualTable(doc, items, 'Messages by Hour', {
    color: '#686BF1', sortOrder: null, valueSuffix: ' msgs'
  });
}

function createFallbackTopicChart(doc, emneData) {
  if (!emneData || !emneData.labels || !emneData.datasets || emneData.datasets.length === 0) {
    doc.fontSize(12).text('No topic distribution data available.');
    return;
  }
  const items = emneData.labels.map((label, index) => ({
    label: label,
    value: emneData.datasets[0].data[index] || 0
  }));
  createVisualTable(doc, items, 'Topics by Percentage', {
    color: '#686BF1', sortOrder: 'desc', showPercent: true
  });
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
    
    // Add test results
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
      
      const performanceItems = [
        { label: 'Mean Absolute Error', value: meanAbsoluteError },
        { label: 'Root Mean Squared Error', value: rootMeanSquaredError },
        { label: 'Correlation Coefficient', value: correlationCoefficient }
      ];
      
      createVisualTable(doc, performanceItems, 'Model Performance Metrics', {
        color: '#FF9800',
        sortOrder: null
      });
    }
    
    // Add positive correlations
    if (textAnalysis.positiveCorrelations && textAnalysis.positiveCorrelations.monograms) {
      doc.addPage();
      
      doc.fillColor('#333')
         .fontSize(16)
         .text('Positive Score Correlations', { underline: true });
      
      doc.moveDown();
      
      // Monograms
      if (textAnalysis.positiveCorrelations.monograms && textAnalysis.positiveCorrelations.monograms.length > 0) {
        const monogramItems = textAnalysis.positiveCorrelations.monograms.map(item => ({
          label: item.ngram,
          value: item.avgScore
        }));
        
        createVisualTable(doc, monogramItems, 'Top Words (Monograms)', {
          color: '#4CAF50',
          sortOrder: 'desc'
        });
      } else {
        doc.fillColor('#666')
           .fontSize(12)
           .text('No significant monogram correlations found.');
        
        doc.moveDown();
      }
      
      // Bigrams - simplified as a list
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
    
    // Add negative correlations
    if (textAnalysis.negativeCorrelations && textAnalysis.negativeCorrelations.monograms) {
      doc.addPage();
      
      doc.fillColor('#333')
         .fontSize(16)
         .text('Negative Score Correlations', { underline: true });
      
      doc.moveDown();
      
      // Monograms
      if (textAnalysis.negativeCorrelations.monograms && textAnalysis.negativeCorrelations.monograms.length > 0) {
        const monogramItems = textAnalysis.negativeCorrelations.monograms.map(item => ({
          label: item.ngram,
          value: item.avgScore
        }));
        
        createVisualTable(doc, monogramItems, 'Bottom Words (Monograms)', {
          color: '#F44336',
          sortOrder: 'asc'
        });
      } else {
        doc.fillColor('#666')
           .fontSize(12)
           .text('No significant negative monogram correlations found.');
        
        doc.moveDown();
      }
      
      // Bigrams - simplified as a list
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