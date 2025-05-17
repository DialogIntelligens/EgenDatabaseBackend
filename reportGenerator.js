import PDFDocument from 'pdfkit';
import MarkdownIt from 'markdown-it';
import { Readable } from 'stream';

// Initialize Markdown parser once
const mdParser = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false
});

/**
 * Render markdown text into the PDF using a token-based approach.
 * Supports headings (levels 1-6), paragraphs, bold/strong, ordered & bullet lists.
 * This avoids regex hacks and provides more robust layout handling.
 */
function renderMarkdownToPdf(doc, markdownText) {
  if (!markdownText) return;

  const tokens = mdParser.parse(markdownText, {});
  const listStack = [];// Track ordered/bullet lists

  // Helper to get current list prefix
  const getListPrefix = () => {
    if (listStack.length === 0) return '';
    const top = listStack[listStack.length - 1];
    if (top.type === 'bullet') return '• ';
    // Ordered list
    return `${top.index++}. `;
  };

  // Iterate through tokens
  tokens.forEach(tok => {
    switch (tok.type) {
      case 'heading_open': {
        const level = Number(tok.tag.replace('h', ''));
        const sizeMap = { 1: 18, 2: 16, 3: 14, 4: 13, 5: 12, 6: 12 };
        doc.moveDown( level === 1 ? 1 : 0.8 );
        doc.font('Helvetica-Bold').fontSize(sizeMap[level] || 14);
        break;
      }
      case 'heading_close': {
        doc.moveDown(0.5);
        break;
      }
      case 'paragraph_open': {
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(12);
        break;
      }
      case 'paragraph_close': {
        doc.text('');
        break;
      }
      case 'bullet_list_open': {
        listStack.push({ type: 'bullet' });
        break;
      }
      case 'bullet_list_close': {
        listStack.pop();
        doc.moveDown(0.3);
        break;
      }
      case 'ordered_list_open': {
        const start = parseInt(tok.attrGet('start') || '1', 10);
        listStack.push({ type: 'ordered', index: start });
        break;
      }
      case 'ordered_list_close': {
        listStack.pop();
        doc.moveDown(0.3);
        break;
      }
      case 'list_item_open': {
        doc.moveDown(0.2);
        doc.text(getListPrefix(), { continued: true });
        break;
      }
      case 'list_item_close': {
        doc.text(''); // finish the line
        break;
      }
      case 'inline': {
        // Render inline children – manage bold
        let bold = false;
        tok.children.forEach(child => {
          if (child.type === 'strong_open') {
            bold = true;
            doc.font('Helvetica-Bold');
          } else if (child.type === 'strong_close') {
            bold = false;
            doc.font('Helvetica');
          } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
            doc.text('\n');
          } else if (child.type === 'text') {
            doc.text(child.content, { continued: true });
          }
        });
        doc.text(''); // end line
        // Reset to normal font if we ended bolded
        if (bold) {
          doc.font('Helvetica');
        }
        break;
      }
      default:
        break;
    }
  });

  doc.moveDown(1);
}

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
  
  // Special cases for lists with bold text at the beginning
  // Match numbered patterns like "1. **text**", "1.  **text**", etc.
  const numberedListWithBoldRegex = /^((?:\d+|[a-zA-Z])\.[ \t]*)\*\*(.*?)\*\*/;
  // Match bullet patterns like "• **text**", "- **text**", "* **text**"
  const bulletListWithBoldRegex = /^([•\-\*][ \t]+)\*\*(.*?)\*\*/;
  
  // Check for numbered lists first
  const numberedMatch = text.match(numberedListWithBoldRegex);
  // Then check for bullet lists
  const bulletMatch = !numberedMatch ? text.match(bulletListWithBoldRegex) : null;
  
  // Handle any matched list format
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
    let remainingText = text.substring(startPosition);
    
    // Detect if remaining text starts with a list marker (numbered or bullet)
    const listAfterBoldRegex = /^[ \t]*(?:\d+\.|[a-zA-Z]\.|[•\-\*])[ \t]+/;
    if (listAfterBoldRegex.test(remainingText)) {
      // End the current bold segment and move to a new line for the list
      doc.text('', { continued: false });
      remainingText = remainingText.trimStart();
    }
    
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
        doc.text(`Chatbot Conversion Rate: ${chatbotConversionRate}%`);
        doc.text(`Non-Chatbot Conversion Rate: ${nonChatbotConversionRate}%`);
      }
    } catch (error) {
      reject(error);
    }
  });
}

// Helper function to format time period
function formatTimePeriod(timePeriod) {
  // Implementation of formatTimePeriod function
}