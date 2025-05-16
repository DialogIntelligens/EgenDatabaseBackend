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

// Helper function to parse Markdown-style bold formatting
function parseFormattedText(doc, text, options = {}) {
  // Regular expression to find text wrapped in double asterisks (**bold**)
  const boldRegex = /\*\*(.*?)\*\*/g;
  
  // Special case for numbered lists with bold text at the beginning
  // Match patterns like "1. **text**", "1.  **text**", etc.
  const numberedListWithBoldRegex = /^((?:\d+|[a-zA-Z])\.[ \t]*)\*\*(.*?)\*\*/;
  const numberedMatch = text.match(numberedListWithBoldRegex);
  
  // Special case for bullet lists with bold text at the beginning
  // Match patterns like "• **text**", "- **text**", "* **text**"
  const bulletListWithBoldRegex = /^([•\-\*][ \t]+)\*\*(.*?)\*\*/;
  const bulletMatch = !numberedMatch ? text.match(bulletListWithBoldRegex) : null;
  
  // Special case for bold text immediately followed by a numbered list or bullet list
  // Match patterns like "**text** 1. list item" or "**text** - bullet item"
  const boldFollowedByListRegex = /^\*\*(.*?)\*\*\s*((?:\d+\.|[•\-\*]).*)/;
  const boldFollowedByListMatch = text.match(boldFollowedByListRegex);
  
  // Handle the special case of bold text followed by a list (numbered or bullet)
  if (boldFollowedByListMatch) {
    const boldText = boldFollowedByListMatch[1];
    const listText = boldFollowedByListMatch[2];
    
    // Output the bold text
    doc.font('Helvetica-Bold').text(boldText, {
      ...options,
      continued: false,
      width: 500
    });
    
    // Add some spacing before the list
    doc.moveDown(0.5);
    
    // Output the list with normal font
    doc.font('Helvetica').text(listText, {
      ...options,
      continued: false,
      width: 500
    });
    
    return;
  }
  
  // Handle any matched list format with bold text
  if (numberedMatch || bulletMatch) {
    const match = numberedMatch || bulletMatch;
    const prefix = match[1];         // The list marker and spacing
    const boldText = match[2];       // The bold text content
    const restOfText = text.substring(match[0].length);
    
    // Output the list prefix with regular font
    doc.font('Helvetica').text(prefix, {
      ...options,
      continued: true,
      width: 500
    });
    
    // Output the bold text
    doc.font('Helvetica-Bold').text(boldText, {
      ...options,
      continued: restOfText.length > 0,
      width: 500
    });
    
    // Output any remaining text after the bold part
    if (restOfText.length > 0) {
      // Check if the rest of text has more bold formatting
      if (restOfText.includes('**')) {
        // Need to reset cursor position to continue on same line
        const currentY = doc.y;
        parseFormattedText(doc, restOfText, {
          ...options,
          continued: false,
          width: 500
        });
      } else {
        // Simple text, just output it
        doc.font('Helvetica').text(restOfText, {
          ...options,
          continued: false,
          width: 500
        });
      }
    }
    
    return;
  }
  
  if (!text || !boldRegex.test(text)) {
    // If no bold formatting, just render the text normally with width constraint
    doc.text(text, { ...options, width: 500 });
    return;
  }
  
  // Keep track of our current position
  let startPosition = 0;
  let match;
  const originalX = doc.x;
  
  // Reset regex matcher
  boldRegex.lastIndex = 0;
  
  // Go through each match
  while ((match = boldRegex.exec(text)) !== null) {
    const fullMatch = match[0]; // The entire matched string including asterisks (**bold**)
    const boldText = match[1]; // The text inside the asterisks (bold)
    const matchStartIndex = match.index;
    
    // Print the text before the bold part
    if (matchStartIndex > startPosition) {
      const normalText = text.substring(startPosition, matchStartIndex);
      doc.font('Helvetica').text(normalText, {
        ...options,
        continued: true,
        width: 500,
        indent: startPosition === 0 ? (options.indent || 0) : 0
      });
    }
    
    // Print the bold part
    doc.font('Helvetica-Bold').text(boldText, {
      ...options,
      continued: true,
      width: 500,
      indent: 0
    });
    
    // Update the starting position for the next segment
    startPosition = matchStartIndex + fullMatch.length;
  }
  
  // Print any remaining text after the last bold part
  if (startPosition < text.length) {
    const remainingText = text.substring(startPosition);
    doc.font('Helvetica').text(remainingText, {
      ...options,
      continued: false,
      width: 500,
      indent: 0
    });
  } else {
    // End the text block if we ended with bold text
    doc.text('', { continued: false });
  }
}

// Improved function to render GPT analysis with proper formatting
function renderGPTAnalysis(doc, analysisText) {
  if (!analysisText) return;
  
  // Set initial text properties
  doc.fontSize(12)
     .fillColor('#333')
     .font('Helvetica');
  
  // Clean up newlines to ensure consistent formatting
  const cleanedText = analysisText
    .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with just two
    .trim();
  
  // Split into paragraphs, preserving single line breaks within paragraph blocks
  const paragraphs = cleanedText.split('\n\n');
  
  // Track if we're inside a section
  let currentSection = null;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    if (paragraph === '') continue;
    
    // Check if paragraph starts with a bold header (section title)
    const headerMatch = paragraph.match(/^\s*\*\*(.*?)\*\*\s*(.*)$/s);
    
    if (headerMatch) {
      // It's a section header
      const headerText = headerMatch[1];
      const remainingText = headerMatch[2];
      
      // Add some space before new sections (except the first one)
      if (currentSection !== null) {
        doc.moveDown(1.5);
      }
      
      // Print the bold header in slightly larger font
      doc.font('Helvetica-Bold')
         .fontSize(14)
         .text(headerText, {
           continued: false,
           width: 500,
           align: 'left',
           lineGap: 4
         });
      
      // Save current section
      currentSection = headerText;
      
      // Process any remaining text on the same line as header, if exists
      if (remainingText && remainingText.trim()) {
        doc.moveDown(0.5);
        doc.fontSize(12);
        
        // Process remaining text which may contain additional bold formatting
        if (remainingText.includes('**')) {
          parseFormattedText(doc, remainingText, {
            align: 'left',
            lineGap: 4,
            width: 500
          });
        } else {
          doc.font('Helvetica').text(remainingText, {
            align: 'left',
            lineGap: 4,
            width: 500
          });
        }
      }
    } else {
      // Regular paragraph - maintain consistent indentation under sections
      if (i > 0 && !paragraph.match(/^\s*\*\*/)) {
        doc.moveDown(0.75);
      }
      
      // Process for any bold text within
      parseFormattedText(doc, paragraph, {
        align: 'left',
        lineGap: 4,
        width: 500
      });
    }
  }
  
  // Add extra space at the end of the analysis
  doc.moveDown(2);
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
      
      // Check if GPT analysis is included in the data
      if (data.gptAnalysis) {
        // Add GPT Analysis page first
        doc.fontSize(20)
           .fillColor('#333')
           .text('AI Analysis Insights', { align: 'center' });
        
        doc.moveDown();
        
        // Add time period information
        doc.fontSize(12)
           .fillColor('#666')
           .text(`Time Period: ${formatTimePeriod(timePeriod)}`, { align: 'center' });
        
        doc.moveDown(2);
        
        // Use the improved rendering function
        renderGPTAnalysis(doc, data.gptAnalysis);
        
        // Add page break before standard report
        doc.addPage();
      }
      
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
        csatScore,
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
      if (csatScore) {
        doc.text(`Customer Satisfaction (CSAT): ${csatScore}`);
      }

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
    
    // Check if we have any topics with data
    const hasTopicData = (textAnalysis.avgRatingPerTopic?.length > 0 || textAnalysis.avgScorePerTopic?.length > 0);
    
    if (!hasTopicData) {
      doc.fillColor('#666').fontSize(11).text('No topic data available.');
      doc.moveDown();
    } else {
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
      
      // First, log what we're getting for debugging
      console.log(`Processing topics: ${textAnalysis.avgRatingPerTopic?.length || 0} with ratings, ${textAnalysis.avgScorePerTopic?.length || 0} with scores`);
      
      // Process all rating topics
      textAnalysis.avgRatingPerTopic?.forEach(item => {
        if (!combinedTopicStats[item.topic]) combinedTopicStats[item.topic] = {};
        combinedTopicStats[item.topic].avgRating = item.averageRating;
        combinedTopicStats[item.topic].ratingCount = item.count;
        // Store totalConversations if available
        if (item.totalConversations) {
          combinedTopicStats[item.topic].totalConversations = item.totalConversations;
        }
      });
      
      // Process all score topics
      textAnalysis.avgScorePerTopic?.forEach(item => {
        if (!combinedTopicStats[item.topic]) combinedTopicStats[item.topic] = {};
        combinedTopicStats[item.topic].avgScore = item.averageScore;
        combinedTopicStats[item.topic].scoreCount = item.count;
        // Store totalConversations if available and not already set
        if (item.totalConversations && !combinedTopicStats[item.topic].totalConversations) {
          combinedTopicStats[item.topic].totalConversations = item.totalConversations;
        }
      });

      // Sort combined stats by count (using rating count or score count)
      const sortedTopics = Object.entries(combinedTopicStats)
          .map(([topic, data]) => ({ 
            topic, 
            avgRating: data.avgRating,
            avgScore: data.avgScore,
            ratingCount: data.ratingCount || 0,
            scoreCount: data.scoreCount || 0,
            // Use totalConversations from either rating or score data
            totalConversations: data.totalConversations || 
              (textAnalysis.avgRatingPerTopic?.find(t => t.topic === topic)?.totalConversations || 
               textAnalysis.avgScorePerTopic?.find(t => t.topic === topic)?.totalConversations || 0)
          }))
          // Sort primarily by total conversations, secondarily by rating/score count
          .sort((a, b) => {
            // First sort by total conversations
            if (b.totalConversations !== a.totalConversations) {
              return b.totalConversations - a.totalConversations;
            }
            // Then by combined rating/score count
            return (b.ratingCount + b.scoreCount) - (a.ratingCount + a.scoreCount);
          });
      
      console.log(`Found ${sortedTopics.length} combined topics to display`);

      if (sortedTopics.length === 0) {
        doc.fillColor('#666').fontSize(11).text('No topics with ratings or scores found.');
      } else {
        sortedTopics.forEach(item => { // Display all topics
          const rowY = doc.y;
          
          // Display topic with total count in parentheses
          doc.text(`${item.topic} (${item.totalConversations || 0})`, startX, rowY, { width: colWidths[0] - 10, ellipsis: true });
          
          // Display rating and score
          doc.text(item.avgRating !== null && item.avgRating !== undefined ? item.avgRating.toFixed(2) : 'N/A', 
                  startX + colWidths[0], rowY, { width: colWidths[1], align: 'right' });
          doc.text(item.avgScore !== null && item.avgScore !== undefined ? item.avgScore.toFixed(2) : 'N/A', 
                  startX + colWidths[0] + colWidths[1], rowY, { width: colWidths[2], align: 'right' });
          
          // Show rating/score count 
          const countDisplay = `${item.ratingCount}/${item.scoreCount}`;
          doc.text(countDisplay, 
                  startX + colWidths[0] + colWidths[1] + colWidths[2], rowY, { width: colWidths[3], align: 'right' });
          doc.moveDown(0.5);
        });
      }
    }
    doc.moveDown();

    // --- Display N-gram Correlations ---
    doc.fillColor('#333').fontSize(14).text('N-Gram Score Correlation (Pearson r)', { underline: true });
    doc.moveDown(0.5);
    doc.fillColor('#666').fontSize(11).text(
        `Based on TF-IDF values from ${textAnalysis.analyzedDocumentsCount} conversations. ${textAnalysis.ngramInfo?.description || 'Analyzing word patterns'} with top ${textAnalysis.positiveCorrelations?.length} positive and ${textAnalysis.negativeCorrelations?.length} negative correlations shown.`
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