import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { Chart } from 'chart.js/auto';

// Configure the chart canvas with error handling
let chartJSNodeCanvas;
try {
  // Configure the chart canvas
  chartJSNodeCanvas = new ChartJSNodeCanvas({ 
    width: 800, // Chart width in pixels
    height: 500, // Chart height in pixels
    backgroundColour: 'white', // Set the background color to white
    chartCallback: (ChartJS) => {
      // Global chart configuration to match dashboard
      ChartJS.defaults.font.family = 'Arial, Helvetica, sans-serif';
      ChartJS.defaults.font.size = 12;
      ChartJS.defaults.color = '#123443';
      ChartJS.defaults.plugins.title.font.size = 16;
      ChartJS.defaults.plugins.title.color = '#686BF1';
    }
  });
} catch (error) {
  console.error('Error initializing ChartJSNodeCanvas:', error);
  // Create a fallback function that always returns null
  chartJSNodeCanvas = {
    renderToBuffer: async () => null
  };
}

// Helper function to generate a chart image buffer
async function generateChartBuffer(chartConfig) {
  try {
    if (!chartJSNodeCanvas) {
      console.error('ChartJSNodeCanvas not available');
      return null;
    }
    return await chartJSNodeCanvas.renderToBuffer(chartConfig);
  } catch (error) {
    console.error('Error generating chart:', error);
    return null;
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
      
      // Generate and add message volume chart (daily/weekly)
      if (data.dailyData) {
        doc.addPage();
        doc.fontSize(16).text('Message Volume Over Time', { align: 'center' });
        doc.moveDown();
        
        const chartData = data.dailyData;
        if (chartData.labels && chartData.datasets && chartData.datasets.length > 0) {
          try {
            // Use exact same configuration as in the dashboard
            const isWeekly = data.dailyData.isWeekly;
            const chartConfig = {
              type: 'line',
              data: {
                labels: data.dailyData.labels,
                datasets: [
                  {
                    label: isWeekly ? 'Weekly Messages' : 'Daily Messages',
                    data: data.dailyData.datasets[0].data,
                    fill: false,
                    backgroundColor: '#777BFF',
                    borderColor: '#686BF1',
                    borderWidth: 2,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
                    position: 'top',
                    labels: { color: '#123443' },
                  },
                  tooltip: {
                    callbacks: {
                      title: function(tooltipItems) {
                        if (isWeekly) {
                          return `Week of ${tooltipItems[0].label}`;
                        }
                        return tooltipItems[0].label;
                      }
                    }
                  }
                },
                scales: {
                  x: {
                    ticks: { 
                      color: '#123443',
                      autoSkip: false,
                      callback: function(val, index, ticks) {
                        // Show the first and last dates
                        return index === 0 || index === data.dailyData.labels.length - 1 
                          ? data.dailyData.labels[index] 
                          : '';
                      },
                      maxRotation: 0,
                      minRotation: 0
                    },
                    title: {
                      display: false,
                      text: 'Date',
                      color: '#686BF1',
                      font: { size: 16 },
                    },
                    grid: { color: 'rgba(0,0,0,0)' },
                  },
                  y: {
                    ticks: { color: '#123443' },
                    title: {
                      display: true,
                      text: '',
                      color: '#686BF1',
                      font: { size: 16 },
                    },
                    grid: { color: 'rgba(0,0,0,0)' },
                  },
                },
              },
            };
            
            // Generate chart image
            const chartImage = await generateChartBuffer(chartConfig);
            if (chartImage) {
              // Add the chart image to the PDF
              doc.image(chartImage, {
                fit: [500, 350],
                align: 'center',
                valign: 'center'
              });
              doc.moveDown();
            } else {
              throw new Error("Chart generation failed");
            }
          } catch (error) {
            console.log("Falling back to table view for daily data:", error.message);
            // Fallback to table view
            const tableData = chartData.labels.map((label, index) => ({
              label,
              value: chartData.datasets[0].data[index],
              count: 1
            }));
            
            await createVisualTable(doc, tableData, 'Message Volume by Date', {
              color: '#686BF1',
              valueSuffix: ' msgs',
              showCounts: false
            });
          }
        } else {
          doc.fontSize(12).text('No message volume data available');
        }
      }
      
      // Generate and add hourly distribution chart
      if (data.hourlyData) {
        doc.addPage();
        doc.fontSize(16).text('Message Distribution by Time of Day', { align: 'center' });
        doc.moveDown();
        
        const hourlyData = data.hourlyData;
        if (hourlyData.labels && hourlyData.datasets && hourlyData.datasets.length > 0) {
          try {
            // Match dashboard configuration exactly
            const chartConfig = {
              type: 'bar',
              data: {
                labels: hourlyData.labels,
                datasets: [
                  {
                    label: 'Time of Day',
                    data: hourlyData.datasets[0].data,
                    backgroundColor: '#777BFF',
                    borderColor: '#686BF1',
                    borderWidth: 2,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
                    position: 'top',
                    labels: { color: '#123443' },
                  },
                },
                scales: {
                  x: {
                    ticks: { 
                      color: '#123443',
                      maxRotation: 0,
                      minRotation: 0
                    },
                    title: {
                      display: true,
                      text: 'kl',
                      color: '#686BF1',
                      font: { size: 12 },
                    },
                    grid: { color: 'rgba(0,0,0,0)' },
                  },
                  y: {
                    ticks: { color: '#123443' },
                    title: {
                      display: true,
                      text: '',
                      color: '#686BF1',
                      font: { size: 16 },
                    },
                    grid: { color: 'rgba(0,0,0,0)' },
                  },
                },
              },
            };
            
            // Generate chart image
            const chartImage = await generateChartBuffer(chartConfig);
            if (chartImage) {
              // Add the chart image to the PDF
              doc.image(chartImage, {
                fit: [500, 350],
                align: 'center',
                valign: 'center'
              });
              doc.moveDown();
            } else {
              throw new Error("Chart generation failed");
            }
          } catch (error) {
            console.log("Falling back to table view for hourly data:", error.message);
            // Fallback to table view
            const tableData = hourlyData.labels.map((label, index) => ({
              label: `Hour ${label}`,
              value: hourlyData.datasets[0].data[index],
              count: 1
            }));
            
            await createVisualTable(doc, tableData, 'Messages by Hour of Day', {
              color: '#686BF1',
              valueSuffix: ' msgs',
              showCounts: false
            });
          }
        } else {
          doc.fontSize(12).text('No hourly distribution data available');
        }
      }
      
      // Generate and add topic distribution chart
      if (data.emneData) {
        doc.addPage();
        doc.fontSize(16).text('Conversation Topics Distribution', { align: 'center' });
        doc.moveDown();
        
        const emneData = data.emneData;
        if (emneData.labels && emneData.datasets && emneData.datasets.length > 0) {
          try {
            // Match dashboard configuration exactly
            const chartConfig = {
              type: 'bar',
              data: {
                labels: emneData.labels,
                datasets: [
                  {
                    label: 'Topic Messages',
                    data: emneData.datasets[0].data,
                    backgroundColor: emneData.datasets[0].backgroundColor || 
                      emneData.labels.map(() => '#777BFF'),
                    borderColor: emneData.datasets[0].borderColor || 
                      emneData.labels.map(() => '#686BF1'),
                    borderWidth: 2,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
                    position: 'top',
                    labels: { color: '#123443' },
                  },
                },
                scales: {
                  x: {
                    ticks: { 
                      color: '#123443',
                      maxRotation: 45,
                      minRotation: 45
                    },
                    title: {
                      display: false,
                      text: 'Topic',
                      color: '#686BF1',
                      font: { size: 16 },
                    },
                    grid: { color: 'rgba(0,0,0,0)' },
                  },
                  y: {
                    ticks: { 
                      color: '#123443',
                      callback: function(value) {
                        return value + '%';
                      }
                    },
                    title: {
                      display: false,
                      text: 'Percentage',
                      color: '#686BF1',
                      font: { size: 16 },
                    },
                    grid: { color: 'rgba(0,0,0,0)' },
                  },
                },
              },
            };
            
            // Generate chart image
            const chartImage = await generateChartBuffer(chartConfig);
            if (chartImage) {
              // Add the chart image to the PDF
              doc.image(chartImage, {
                fit: [500, 350],
                align: 'center',
                valign: 'center'
              });
              doc.moveDown();
            } else {
              throw new Error("Chart generation failed");
            }
          } catch (error) {
            console.log("Falling back to table view for topic data:", error.message);
            // Fallback to table view
            const tableData = emneData.labels.map((label, index) => ({
              label,
              value: emneData.datasets[0].data[index],
              count: 1
            }));
            
            await createVisualTable(doc, tableData, 'Topics Distribution', {
              color: '#686BF1',
              valueSuffix: '%',
              showCounts: false
            });
          }
        } else {
          doc.fontSize(12).text('No topic distribution data available');
        }
      }
      
      // We're not including text analysis visualizations as per user request
      // Only include if specifically requested in the data
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
        // Log monograms for debugging
        console.log("Positive monograms for PDF:", JSON.stringify(textAnalysis.positiveCorrelations.monograms));
        
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
        // Log monograms for debugging
        console.log("Negative monograms for PDF:", JSON.stringify(textAnalysis.negativeCorrelations.monograms));
        
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