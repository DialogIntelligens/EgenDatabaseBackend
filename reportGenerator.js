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

// Helper function to create a simple visual bar in the PDF
function drawBarInPdf(doc, value, maxValue, width, height, color, x, y) {
  const barWidth = (value / maxValue) * width;
  
  // Draw background bar
  doc.rect(x, y, width, height).fill('#f0f0f0');
  
  // Draw value bar
  doc.rect(x, y, barWidth, height).fill(color);
  
  // Return the bottom y position
  return y + height;
}

// Helper function to create a visual representation of data
async function createVisualTable(doc, items, title, options = {}) {
  const {
    maxItems = 10,
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
    showCounts = true,
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
  const calculatedMax = maxValue || Math.max(...items.map(item => 
    typeof item.avgScore !== 'undefined' ? item.avgScore : 
    typeof item.value !== 'undefined' ? item.value : 0
  ));
  
  // Limit items and ensure consistent property access
  const limitedItems = items.slice(0, maxItems).map(item => ({
    label: item.ngram || item.label || 'Unknown',
    value: item.avgScore || item.value || 0,
    count: item.count || 0
  }));
  
  // Sort items if needed
  if (sortOrder === 'desc') {
    limitedItems.sort((a, b) => b.value - a.value);
  } else if (sortOrder === 'asc') {
    limitedItems.sort((a, b) => a.value - b.value);
  }
  
  let currentY = startY;
  
  // Draw items
  limitedItems.forEach((item, index) => {
    // Draw index and label
    doc.fontSize(10).text(`${index + 1}.`, startX, currentY);
    doc.fontSize(10).text(`"${item.label}"`, startX + 20, currentY, { width: labelWidth });
    
    // Draw value text
    const valueText = `${valuePrefix}${item.value.toFixed(2)}${valueSuffix}${showCounts ? ` (${item.count})` : ''}`;
    doc.fontSize(10).text(valueText, startX + labelWidth + barWidth + 10, currentY);
    
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
        showPurchase,
        chartImages
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
      
      // Add daily/weekly messages chart
      if (chartImages?.dailyChart || data.dailyData) {
        doc.addPage();
        doc.fontSize(16).text('Message Volume Over Time', { align: 'center' });
        doc.moveDown();
        
        // Try to use the captured chart image
        if (chartImages?.dailyChart) {
          const imageAdded = addBase64ImageToPdf(doc, chartImages.dailyChart);
          if (imageAdded) {
            doc.moveDown();
          } else {
            // Fallback to text-based representation if image fails
            createFallbackDailyChart(doc, data.dailyData);
          }
        } else {
          // Fallback if no image is available
          createFallbackDailyChart(doc, data.dailyData);
        }
      }
      
      // Add hourly distribution chart
      if (chartImages?.hourlyChart || data.hourlyData) {
        doc.addPage();
        doc.fontSize(16).text('Message Distribution by Time of Day', { align: 'center' });
        doc.moveDown();
        
        // Try to use the captured chart image
        if (chartImages?.hourlyChart) {
          const imageAdded = addBase64ImageToPdf(doc, chartImages.hourlyChart);
          if (imageAdded) {
            doc.moveDown();
          } else {
            // Fallback to table view if image fails
            createFallbackHourlyChart(doc, data.hourlyData);
          }
        } else {
          // Fallback if no image is available
          createFallbackHourlyChart(doc, data.hourlyData);
        }
      }
      
      // Add topic distribution chart
      if (chartImages?.topicChart || data.emneData) {
        doc.addPage();
        doc.fontSize(16).text('Conversation Topics Distribution', { align: 'center' });
        doc.moveDown();
        
        // Try to use the captured chart image
        if (chartImages?.topicChart) {
          const imageAdded = addBase64ImageToPdf(doc, chartImages.topicChart);
          if (imageAdded) {
            doc.moveDown();
          } else {
            // Fallback to table view if image fails
            createFallbackTopicChart(doc, data.emneData);
          }
        } else {
          // Fallback if no image is available
          createFallbackTopicChart(doc, data.emneData);
        }
      }
      
      // Only include text analysis if specifically requested
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
      doc.fontSize(10).text(`Report generated on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`, { align: 'center' });
      
      // Finalize the PDF
      doc.end();
      
    } catch (error) {
      console.error('Error generating report:', error);
      reject(error);
    }
  });
}

// Fallback chart creation functions
function createFallbackDailyChart(doc, dailyData) {
  if (!dailyData || !dailyData.labels || !dailyData.datasets) {
    doc.fontSize(12).text('No message volume data available');
    return;
  }
  
  const tableData = dailyData.labels.map((label, index) => ({
    label,
    value: dailyData.datasets[0].data[index],
    count: 1
  }));
  
  createVisualTable(doc, tableData, 'Message Volume by Date', {
    color: '#686BF1',
    valueSuffix: ' msgs',
    showCounts: false
  });
}

function createFallbackHourlyChart(doc, hourlyData) {
  if (!hourlyData || !hourlyData.labels || !hourlyData.datasets) {
    doc.fontSize(12).text('No hourly distribution data available');
    return;
  }
  
  const tableData = hourlyData.labels.map((label, index) => ({
    label: `Hour ${label}`,
    value: hourlyData.datasets[0].data[index],
    count: 1
  }));
  
  createVisualTable(doc, tableData, 'Messages by Hour of Day', {
    color: '#686BF1',
    valueSuffix: ' msgs',
    showCounts: false
  });
}

function createFallbackTopicChart(doc, emneData) {
  if (!emneData || !emneData.labels || !emneData.datasets) {
    doc.fontSize(12).text('No topic distribution data available');
    return;
  }
  
  const tableData = emneData.labels.map((label, index) => ({
    label,
    value: emneData.datasets[0].data[index],
    count: 1
  }));
  
  createVisualTable(doc, tableData, 'Topics Distribution', {
    color: '#686BF1',
    valueSuffix: '%',
    showCounts: false
  });
}

/**
 * Add text analysis section to the report
 * @param {PDFDocument} doc - The PDF document
 * @param {Object} textAnalysis - The text analysis results
 */
async function addTextAnalysisSection(doc, textAnalysis) {
  try {
    // Add a page break for this section
    doc.addPage();
    
    // Add section title
    doc.fontSize(18).text('Conversation Text Analysis', { align: 'center' });
    doc.moveDown();
    
    // Add dataset information
    doc.fontSize(12).text(`Analysis based on ${textAnalysis.trainingSize + textAnalysis.testingSize} conversations`);
    doc.fontSize(12).text(`Training set: ${textAnalysis.trainingSize} conversations (${textAnalysis.validTrainingSize} valid)`);
    doc.fontSize(12).text(`Testing set: ${textAnalysis.testingSize} conversations (${textAnalysis.validTestingSize} valid)`);
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
      
      // Add performance visualization using visual table
      try {
        const performanceData = [
          { label: 'Mean Absolute Error', value: meanAbsoluteError, count: sampleSize },
          { label: 'Root Mean Squared Error', value: rootMeanSquaredError, count: sampleSize },
          { label: 'Correlation Coefficient', value: correlationCoefficient, count: sampleSize }
        ];
        
        await createVisualTable(doc, performanceData, 'Model Performance Metrics', {
          color: '#FF9800',
          showCounts: false,
          maxValue: Math.max(5, meanAbsoluteError, rootMeanSquaredError, 1) // Use a reasonable max value
        });
      } catch (chartError) {
        console.error('Error generating performance visualization:', chartError);
      }
    }
    
    // Add positive correlations
    if (textAnalysis.positiveCorrelations) {
      doc.addPage();
      doc.fontSize(16).text('Positive Score Correlations', { underline: true });
      doc.moveDown();
      
      // Monograms
      if (textAnalysis.positiveCorrelations.monograms && textAnalysis.positiveCorrelations.monograms.length > 0) {
        // Use visual table to display monograms
        await createVisualTable(doc, textAnalysis.positiveCorrelations.monograms, 'Top Words (Monograms)', {
          color: '#4CAF50'
        });
      } else {
        doc.fontSize(12).text('No significant monogram correlations found.');
        doc.moveDown();
      }
      
      // Bigrams
      if (textAnalysis.positiveCorrelations.bigrams && textAnalysis.positiveCorrelations.bigrams.length > 0) {
        // Use simple text list for bigrams to save space
        doc.fontSize(14).text('Top Word Pairs (Bigrams)');
        doc.moveDown(0.5);
        
        textAnalysis.positiveCorrelations.bigrams.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
      
      // Trigrams
      if (textAnalysis.positiveCorrelations.trigrams && textAnalysis.positiveCorrelations.trigrams.length > 0) {
        // Use simple text list for trigrams to save space
        doc.fontSize(14).text('Top Word Triplets (Trigrams)');
        doc.moveDown(0.5);
        
        textAnalysis.positiveCorrelations.trigrams.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
    }
    
    // Add negative correlations
    if (textAnalysis.negativeCorrelations) {
      doc.addPage();
      doc.fontSize(16).text('Negative Score Correlations', { underline: true });
      doc.moveDown();
      
      // Monograms
      if (textAnalysis.negativeCorrelations.monograms && textAnalysis.negativeCorrelations.monograms.length > 0) {
        // Use visual table to display monograms
        await createVisualTable(doc, textAnalysis.negativeCorrelations.monograms, 'Bottom Words (Monograms)', {
          color: '#F44336'
        });
      } else {
        doc.fontSize(12).text('No significant negative monogram correlations found.');
        doc.moveDown();
      }
      
      // Bigrams
      if (textAnalysis.negativeCorrelations.bigrams && textAnalysis.negativeCorrelations.bigrams.length > 0) {
        // Use simple text list for bigrams to save space
        doc.fontSize(14).text('Bottom Word Pairs (Bigrams)');
        doc.moveDown(0.5);
        
        textAnalysis.negativeCorrelations.bigrams.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
      
      // Trigrams
      if (textAnalysis.negativeCorrelations.trigrams && textAnalysis.negativeCorrelations.trigrams.length > 0) {
        // Use simple text list for trigrams to save space
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