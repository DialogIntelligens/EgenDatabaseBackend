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