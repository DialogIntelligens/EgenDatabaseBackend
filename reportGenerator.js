import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { Chart } from 'chart.js/auto';

// Configure the chart canvas with error handling
let chartJSNodeCanvas;
try {
  // Configure the chart canvas
  chartJSNodeCanvas = new ChartJSNodeCanvas({ 
    width: 800, // Chart width in pixels (increased for better quality)
    height: 500, // Chart height in pixels (increased for better quality)
    backgroundColour: 'white', // Set the background color to white
    chartCallback: (ChartJS) => {
      // Global chart configuration
      ChartJS.defaults.font.family = 'Arial, Helvetica, sans-serif';
      ChartJS.defaults.font.size = 12;
      ChartJS.defaults.color = '#666';
      ChartJS.defaults.plugins.title.font.size = 16;
      ChartJS.defaults.plugins.title.color = '#333';
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
      
      // Generate and add daily/weekly message chart
      if (data.dailyData) {
        doc.addPage();
        doc.fontSize(16).text('Message Volume Over Time', { align: 'center' });
        doc.moveDown();
        
        // Create chart configuration
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
                tension: 0.4,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: 'top',
                labels: { font: { size: 12 } }
              },
              title: {
                display: true,
                text: isWeekly ? 'Weekly Message Volume' : 'Daily Message Volume',
                font: { size: 16 }
              }
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: 'Date'
                },
                ticks: {
                  autoSkip: true,
                  maxTicksLimit: 10
                }
              },
              y: {
                title: {
                  display: true,
                  text: 'Number of Messages'
                },
                beginAtZero: true
              }
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
          doc.fontSize(10).text(isWeekly ? 'Weekly message volume data' : 'Daily message volume data', {
            align: 'center'
          });
        } else {
          // Display text data as fallback
          doc.fontSize(14).text('Message Data:', { underline: true });
          doc.moveDown();
            
          const chartData = data.dailyData;
          if (chartData.labels && chartData.datasets && chartData.datasets.length > 0) {
            const labels = chartData.labels;
            const values = chartData.datasets[0].data;
            
            for (let i = 0; i < Math.min(labels.length, values.length); i++) {
              doc.fontSize(10).text(`${labels[i]}: ${values[i]}`);
            }
          }
        }
      }
      
      // Generate and add hourly distribution chart
      if (data.hourlyData) {
        doc.addPage();
        doc.fontSize(16).text('Message Distribution by Time of Day', { align: 'center' });
        doc.moveDown();
        
        // Create chart configuration
        const chartConfig = {
          type: 'bar',
          data: {
            labels: data.hourlyData.labels,
            datasets: [
              {
                label: 'Messages by Hour',
                data: data.hourlyData.datasets[0].data,
                backgroundColor: '#777BFF',
                borderColor: '#686BF1',
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: 'top',
                labels: { font: { size: 12 } }
              },
              title: {
                display: true,
                text: 'Message Distribution by Hour',
                font: { size: 16 }
              }
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: 'Hour of Day'
                }
              },
              y: {
                title: {
                  display: true,
                  text: 'Number of Messages'
                },
                beginAtZero: true
              }
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
          doc.fontSize(10).text('Distribution of messages by hour of day', {
            align: 'center'
          });
        } else {
          // Display text data as fallback
          doc.fontSize(14).text('Hourly Message Data:', { underline: true });
          doc.moveDown();
            
          const hourlyData = data.hourlyData;
          if (hourlyData.labels && hourlyData.datasets && hourlyData.datasets.length > 0) {
            const labels = hourlyData.labels;
            const values = hourlyData.datasets[0].data;
            
            for (let i = 0; i < Math.min(labels.length, values.length); i++) {
              doc.fontSize(10).text(`Hour ${labels[i]}: ${values[i]} messages`);
            }
          }
        }
      }
      
      // Generate and add topic distribution chart
      if (data.emneData) {
        doc.addPage();
        doc.fontSize(16).text('Conversation Topics Distribution', { align: 'center' });
        doc.moveDown();
        
        // Create chart configuration
        const chartConfig = {
          type: 'bar',
          data: {
            labels: data.emneData.labels,
            datasets: [
              {
                label: 'Topic Distribution (%)',
                data: data.emneData.datasets[0].data,
                backgroundColor: data.emneData.datasets[0].backgroundColor || 
                  data.emneData.labels.map(() => '#777BFF'),
                borderColor: data.emneData.datasets[0].borderColor || 
                  data.emneData.labels.map(() => '#686BF1'),
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: 'top',
                labels: { font: { size: 12 } }
              },
              title: {
                display: true,
                text: 'Topic Distribution',
                font: { size: 16 }
              }
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: 'Topic'
                },
                ticks: {
                  maxRotation: 45,
                  minRotation: 45
                }
              },
              y: {
                title: {
                  display: true,
                  text: 'Percentage (%)'
                },
                beginAtZero: true
              }
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
          doc.fontSize(10).text('Distribution of conversations by topic', {
            align: 'center'
          });
        } else {
          // Display text data as fallback
          doc.fontSize(14).text('Topic Distribution:', { underline: true });
          doc.moveDown();
            
          const emneData = data.emneData;
          if (emneData.labels && emneData.datasets && emneData.datasets.length > 0) {
            const labels = emneData.labels;
            const values = emneData.datasets[0].data;
            
            for (let i = 0; i < Math.min(labels.length, values.length); i++) {
              doc.fontSize(10).text(`${labels[i]}: ${values[i]}%`);
            }
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
      
      // Add performance visualization
      try {
        // Create chart configuration for model performance
        const chartConfig = {
          type: 'bar',
          data: {
            labels: ['MAE', 'RMSE', 'Correlation'],
            datasets: [
              {
                label: 'Model Performance Metrics',
                data: [
                  meanAbsoluteError,
                  rootMeanSquaredError,
                  correlationCoefficient
                ],
                backgroundColor: ['#FF5722', '#FF9800', '#4CAF50'],
                borderColor: ['#E64A19', '#F57C00', '#388E3C'],
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                display: false
              },
              title: {
                display: true,
                text: 'Model Performance Metrics',
                font: { size: 16 }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Value'
                }
              }
            },
          },
        };
        
        // Generate chart image
        const chartImage = await generateChartBuffer(chartConfig);
        if (chartImage) {
          // Add the chart image to the PDF
          doc.image(chartImage, {
            fit: [400, 300],
            align: 'center',
            valign: 'center'
          });
          doc.moveDown();
        }
      } catch (chartError) {
        console.error('Error generating performance chart:', chartError);
      }
    }
    
    // Add positive correlations
    if (textAnalysis.positiveCorrelations) {
      doc.addPage();
      doc.fontSize(16).text('Positive Score Correlations', { underline: true });
      doc.moveDown();
      
      // Monograms
      if (textAnalysis.positiveCorrelations.monograms && textAnalysis.positiveCorrelations.monograms.length > 0) {
        doc.fontSize(14).text('Top Words (Monograms)');
        doc.moveDown(0.5);
        
        // Create chart data
        const monograms = textAnalysis.positiveCorrelations.monograms;
        try {
          // Create chart configuration for positive monograms
          const chartConfig = {
            type: 'bar',
            data: {
              labels: monograms.map(item => item.ngram),
              datasets: [
                {
                  label: 'Average Score',
                  data: monograms.map(item => item.avgScore),
                  backgroundColor: '#4CAF50',
                  borderColor: '#388E3C',
                  borderWidth: 2,
                },
              ],
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              plugins: {
                legend: {
                  display: false
                },
                title: {
                  display: true,
                  text: 'Top Words - Average Score',
                  font: { size: 14 }
                }
              },
              scales: {
                x: {
                  beginAtZero: true,
                  title: {
                    display: true,
                    text: 'Average Score'
                  }
                }
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
          }
        } catch (chartError) {
          console.error('Error generating monograms chart:', chartError);
          // Fallback to text display
          monograms.forEach((item, index) => {
            doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
          });
        }
        doc.moveDown();
      }
      
      // Bigrams - add text only to keep the PDF size manageable
      if (textAnalysis.positiveCorrelations.bigrams && textAnalysis.positiveCorrelations.bigrams.length > 0) {
        doc.fontSize(14).text('Top Word Pairs (Bigrams)');
        doc.moveDown(0.5);
        
        textAnalysis.positiveCorrelations.bigrams.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
      
      // Trigrams - add text only to keep the PDF size manageable
      if (textAnalysis.positiveCorrelations.trigrams && textAnalysis.positiveCorrelations.trigrams.length > 0) {
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
        doc.fontSize(14).text('Bottom Words (Monograms)');
        doc.moveDown(0.5);
        
        // Create chart data
        const monograms = textAnalysis.negativeCorrelations.monograms;
        try {
          // Create chart configuration for negative monograms
          const chartConfig = {
            type: 'bar',
            data: {
              labels: monograms.map(item => item.ngram),
              datasets: [
                {
                  label: 'Average Score',
                  data: monograms.map(item => item.avgScore),
                  backgroundColor: '#F44336',
                  borderColor: '#D32F2F',
                  borderWidth: 2,
                },
              ],
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              plugins: {
                legend: {
                  display: false
                },
                title: {
                  display: true,
                  text: 'Bottom Words - Average Score',
                  font: { size: 14 }
                }
              },
              scales: {
                x: {
                  beginAtZero: true,
                  title: {
                    display: true,
                    text: 'Average Score'
                  }
                }
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
          }
        } catch (chartError) {
          console.error('Error generating negative monograms chart:', chartError);
          // Fallback to text display
          monograms.forEach((item, index) => {
            doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
          });
        }
        doc.moveDown();
      }
      
      // Bigrams - add text only to keep the PDF size manageable
      if (textAnalysis.negativeCorrelations.bigrams && textAnalysis.negativeCorrelations.bigrams.length > 0) {
        doc.fontSize(14).text('Bottom Word Pairs (Bigrams)');
        doc.moveDown(0.5);
        
        textAnalysis.negativeCorrelations.bigrams.forEach((item, index) => {
          doc.fontSize(10).text(`${index + 1}. "${item.ngram}" (Score: ${item.avgScore.toFixed(2)}, Count: ${item.count})`);
        });
        doc.moveDown();
      }
      
      // Trigrams - add text only to keep the PDF size manageable
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