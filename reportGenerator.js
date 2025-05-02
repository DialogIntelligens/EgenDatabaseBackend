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
       .text('Conversation & Text Analysis', { align: 'center' });
    doc.moveDown();
    
    // --- Display Rating/Score Correlation ---
    doc.fillColor('#333').fontSize(14).text('Rating vs. Score Correlation', { underline: true });
    doc.moveDown(0.5);
    if (textAnalysis.ratingScoreCorrelation && textAnalysis.ratingScoreCorrelation.count > 1) {
      doc.fillColor('#666').fontSize(11).text(
        `Pearson Correlation between Customer Rating (1-5) and AI Score (1-10): r = ${textAnalysis.ratingScoreCorrelation.value?.toFixed(4) ?? 'N/A'} (based on ${textAnalysis.ratingScoreCorrelation.count} conversations)`
      );
    } else {
      doc.fillColor('#666').fontSize(11).text('Not enough data to calculate rating vs. score correlation.');
    }
    doc.moveDown();

    // --- Display Average Ratings/Scores per Topic ---
    doc.fillColor('#333').fontSize(14).text('Average Scores & Ratings per Topic', { underline: true });
    doc.moveDown(0.5);
    
    // Table Header
    const startX = doc.x;
    const startY = doc.y;
    const colWidths = [200, 100, 100, 100]; // Topic, Avg Rating, Avg Score, Count
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Topic', startX, startY);
    doc.text('Avg Rating', startX + colWidths[0], startY, { width: colWidths[1], align: 'right' });
    doc.text('Avg Score', startX + colWidths[0] + colWidths[1], startY, { width: colWidths[2], align: 'right' });
    doc.text('Count', startX + colWidths[0] + colWidths[1] + colWidths[2], startY, { width: colWidths[3], align: 'right' });
    doc.moveDown(0.5);
    // Draw header line
    doc.moveTo(startX, doc.y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), doc.y).stroke('#ccc');
    doc.moveDown(0.5);

    // Table Rows
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    const combinedTopicStats = {};
    textAnalysis.avgRatingPerTopic?.forEach(item => {
      if (!combinedTopicStats[item.topic]) combinedTopicStats[item.topic] = {};
      combinedTopicStats[item.topic].avgRating = item.averageRating;
      combinedTopicStats[item.topic].ratingCount = item.count;
    });
    textAnalysis.avgScorePerTopic?.forEach(item => {
      if (!combinedTopicStats[item.topic]) combinedTopicStats[item.topic] = {};
      combinedTopicStats[item.topic].avgScore = item.averageScore;
      combinedTopicStats[item.topic].scoreCount = item.count;
    });

    // Sort combined stats by count (using rating count or score count)
    const sortedTopics = Object.entries(combinedTopicStats)
        .map(([topic, data]) => ({ topic, ...data }))
        .sort((a, b) => (b.ratingCount || b.scoreCount || 0) - (a.ratingCount || a.scoreCount || 0));

    sortedTopics.slice(0, 15).forEach(item => { // Limit rows displayed
        const rowY = doc.y;
        doc.text(item.topic, startX, rowY, { width: colWidths[0] - 10, ellipsis: true }); // Allow ellipsis
        doc.text(item.avgRating?.toFixed(2) ?? 'N/A', startX + colWidths[0], rowY, { width: colWidths[1], align: 'right' });
        doc.text(item.avgScore?.toFixed(2) ?? 'N/A', startX + colWidths[0] + colWidths[1], rowY, { width: colWidths[2], align: 'right' });
        doc.text(item.ratingCount ?? (item.scoreCount ?? 0), startX + colWidths[0] + colWidths[1] + colWidths[2], rowY, { width: colWidths[3], align: 'right' });
        doc.moveDown(0.5);
    });
    doc.moveDown();

    // --- Display N-gram Correlations ---
    doc.fillColor('#333').fontSize(14).text('N-Gram Score Correlation (Pearson r)', { underline: true });
    doc.moveDown(0.5);
    doc.fillColor('#666').fontSize(11).text(
        `Based on TF-IDF values from ${textAnalysis.analyzedDocumentsCount} conversations. Top ${textAnalysis.positiveCorrelations?.length} positive and ${textAnalysis.negativeCorrelations?.length} negative shown.`
    );
    doc.moveDown();

    // Positive Correlations
    doc.fillColor('#333').fontSize(12).text('Top Positively Correlated N-Grams:');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    if (textAnalysis.positiveCorrelations && textAnalysis.positiveCorrelations.length > 0) {
      textAnalysis.positiveCorrelations.forEach((item, index) => {
        doc.text(`${index + 1}. "${item.ngram}" (r = ${item.correlation.toFixed(4)})`);
      });
    } else {
      doc.text('No significant positive correlations found.');
    }
    doc.moveDown();

    // Negative Correlations
    doc.fillColor('#333').fontSize(12).text('Top Negatively Correlated N-Grams:');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    if (textAnalysis.negativeCorrelations && textAnalysis.negativeCorrelations.length > 0) {
      textAnalysis.negativeCorrelations.forEach((item, index) => {
        doc.text(`${index + 1}. "${item.ngram}" (r = ${item.correlation.toFixed(4)})`);
      });
    } else {
      doc.text('No significant negative correlations found.');
    }
    doc.moveDown();
    
    // Add interpretation note
    doc.moveDown();
    doc.fillColor('#666')
       .fontSize(10)
       .text('Note: Correlation (r) measures the linear relationship between the TF-IDF value of an n-gram and the conversation score. Values closer to +1 indicate a positive relationship, while values closer to -1 indicate a negative relationship.', {
        align: 'left',
        width: 500
      });

  } catch (error) {
    console.error('Error adding text analysis section to report:', error);
    // Optionally add error message to PDF
    doc.addPage().fontSize(12).fillColor('red').text('Error generating text analysis section.');
  }
} 