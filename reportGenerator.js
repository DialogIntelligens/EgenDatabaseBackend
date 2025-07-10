import PDFDocument from 'pdfkit';
import MarkdownIt from 'markdown-it';
import { Readable } from 'stream';
import TemplateProcessor from './templateProcessor.js';
import { generateGPTAnalysis } from './gptAnalysis.js';
import { performTextAnalysis } from './textAnalysis.js';

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

  // Preprocess text to convert legacy format to proper markdown
  // Handle the raw OpenAI output which might not be perfect markdown
  
  // First normalize line endings and ensure consistent spacing
  let preprocessedText = markdownText
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  // Convert ** headings ** to # Heading format
  preprocessedText = preprocessedText.replace(/^\s*\*\*(.*?)\*\*\s*$/mg, '# $1');
  
  // Handle numbered list items with bold text at the start: "1. **Text**" format
  // This is a common pattern in the GPT output
  preprocessedText = preprocessedText.replace(/^(\d+)\.\s+\*\*(.*?)\*\*(.*)$/mg, '$1. **$2**$3');
  
  // Fix the common pattern where a list item number is separated from its content
  preprocessedText = preprocessedText.replace(/^(\d+)\.\s*\n\s*/mg, '$1. ');
  
  // Ensure blank lines before headers for proper markdown parsing
  preprocessedText = preprocessedText.replace(/^(#)/mg, '\n$1');
  
  // Parse the preprocessed text with markdown-it
  const tokens = mdParser.parse(preprocessedText, {});
  const listStack = [];// Track ordered/bullet lists
  let lastTokenType = null; // Track the last token type
  let inListItem = false; // Track if we're inside a list item
  let listItemContent = ''; // Collect list item content

  // Helper to get current list prefix
  const getListPrefix = () => {
    if (listStack.length === 0) return '';
    const top = listStack[listStack.length - 1];
    if (top.type === 'bullet') return '• ';
    // Ordered list
    return `${top.index++}. `;
  };
  
  // Render a list item with proper formatting
  const renderListItem = (content) => {
    if (!content || content.trim() === '') return;
    
    // Get the appropriate list prefix (bullet or number)
    const prefix = getListPrefix();
    
    // Create proper list item indentation
    const listIndent = 20; // consistent indent for all list levels
    
    // Check if content contains bold markers
    if (content.includes('**')) {
      // If there are bold markers, we need to handle them specially
      // Render the prefix (number or bullet)
      doc.text(prefix, { 
        continued: true,
        indent: listIndent
      });
      
      // Split by bold markers
      let parts = content.split('**');
      let isBold = false; // Start with normal text
      
      parts.forEach((part, index) => {
        if (part !== '') {
          doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica');
          doc.text(part, {
            continued: index < parts.length - 1,
            width: 450,
            align: 'left'
          });
        }
        isBold = !isBold; // Toggle bold state
      });
      
      // Ensure we end the line
      if (parts.length % 2 === 0) {
        doc.text('');
      }
    } else {
      // Simple case - just render the content
      doc.text(prefix, { 
        continued: true,
        indent: listIndent
      });
      
      doc.text(content, {
        continued: false,
        align: 'left',
        width: 450
      });
    }
  };

  // Iterate through tokens
  tokens.forEach(tok => {
    switch (tok.type) {
      case 'heading_open': {
        const level = Number(tok.tag.replace('h', ''));
        const sizeMap = { 1: 18, 2: 16, 3: 14, 4: 13, 5: 12, 6: 12 };
        
        // Add extra space before headings (except first heading)
        if (lastTokenType !== null) {
          doc.moveDown(1.5);
        }
        
        doc.font('Helvetica-Bold').fontSize(sizeMap[level] || 14);
        break;
      }
      case 'heading_close': {
        doc.moveDown(0.5);
        break;
      }
      case 'paragraph_open': {
        if (lastTokenType !== 'list_item_close') {
          doc.moveDown(0.5);
        }
        doc.font('Helvetica').fontSize(12);
        break;
      }
      case 'paragraph_close': {
        doc.text('');
        break;
      }
      case 'bullet_list_open': {
        doc.moveDown(0.5);
        listStack.push({ type: 'bullet' });
        break;
      }
      case 'bullet_list_close': {
        listStack.pop();
        doc.moveDown(0.5);
        break;
      }
      case 'ordered_list_open': {
        doc.moveDown(0.5);
        const start = parseInt(tok.attrGet('start') || '1', 10);
        listStack.push({ type: 'ordered', index: start });
        break;
      }
      case 'ordered_list_close': {
        listStack.pop();
        doc.moveDown(0.5);
        break;
      }
      case 'list_item_open': {
        doc.font('Helvetica').fontSize(12);
        // Store that we're in a list item, will be used by inline handler
        listItemContent = '';
        inListItem = true;
        break;
      }
      case 'list_item_close': {
        // Render the collected list item content
        if (inListItem && listItemContent) {
          renderListItem(listItemContent);
          listItemContent = '';
        }
        inListItem = false;
        break;
      }
      case 'inline': {
        // Are we inside a list item?
        const insideListItem = inListItem || 
                            (lastTokenType === 'list_item_open' || 
                             (tokens[tokens.indexOf(tok) - 1] && 
                              tokens[tokens.indexOf(tok) - 1].type === 'list_item_open'));
        
        // Gather all text content for this inline segment
        let inlineContent = '';
        let segments = [];
        let currentText = '';
        let currentBold = false;
        
        // Process all inline children
        tok.children.forEach(child => {
          if (child.type === 'strong_open') {
            if (currentText) {
              segments.push({ text: currentText, bold: currentBold });
              currentText = '';
            }
            currentBold = true;
          } else if (child.type === 'strong_close') {
            if (currentText) {
              segments.push({ text: currentText, bold: currentBold });
              currentText = '';
            }
            currentBold = false;
          } else if (child.type === 'text') {
            currentText += child.content;
          } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
            // For list items, convert breaks to spaces
            if (insideListItem) {
              currentText += ' ';
            } else {
              // For regular paragraphs, preserve breaks
              if (currentText) {
                segments.push({ text: currentText, bold: currentBold });
                currentText = '';
              }
              segments.push({ text: '\n', bold: false, isBreak: true });
            }
          }
        });
        
        // Add any remaining text
        if (currentText) {
          segments.push({ text: currentText, bold: currentBold });
        }
        
        // For list items, collect the content to be rendered later
        if (insideListItem) {
          // Combine all segments into a single string
          segments.forEach(segment => {
            // If we need to maintain bold formatting, we'll need to handle this specially
            if (segment.bold) {
              listItemContent += `**${segment.text}**`;
            } else {
              listItemContent += segment.text;
            }
          });
        } else {
          // For normal paragraphs, render directly
          segments.forEach((segment, index) => {
            if (segment.isBreak) {
              doc.text(''); // End the current line
            } else {
              doc.font(segment.bold ? 'Helvetica-Bold' : 'Helvetica');
              doc.text(segment.text, { 
                continued: index < segments.length - 1 && !segments[index + 1].isBreak,
                width: 480,
                lineGap: 4
              });
            }
          });
          
          // Ensure we end the text if needed
          if (segments.length === 0 || !segments[segments.length - 1].isBreak) {
            doc.text('');
          }
        }
        
        break;
      }
      default:
        break;
    }
    lastTokenType = tok.type;
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

    // Debug: Log image data length and a sample
    console.log('Adding image to PDF. Data length:', imageData.length, 'Sample:', imageData.slice(0, 100));

    // Set default size and position if not provided
    const x = options.x || 50;
    const y = options.y || doc.y;
    const width = options.width || 500;
    const height = options.height || 300;

    // Draw a border rectangle for debugging
    doc.save();
    doc.rect(x, y, width, height).stroke('#cccccc');
    doc.restore();

    // Add image to the PDF
    doc.image(Buffer.from(imageData, 'base64'), x, y, {
      fit: [width, height],
      align: 'center',
      valign: 'center'
    });

    // Move the cursor below the image
    doc.y = y + height + 10;

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
        renderMarkdownToPdf(doc, data.gptAnalysis);
        
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

      // Add daily/weekly messages chart (only if image is available)
      doc.addPage();
      doc.fillColor('#333')
         .fontSize(16)
         .text('Message Volume Over Time', { align: 'center' });
      doc.moveDown();
      
      if (chartImages?.dailyChart) {
        const imageAdded = addBase64ImageToPdf(doc, chartImages.dailyChart, { x: 50, y: doc.y, width: 500, height: 300 });
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
        const imageAdded = addBase64ImageToPdf(doc, chartImages.hourlyChart, { x: 50, y: doc.y, width: 500, height: 300 });
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
        const imageAdded = addBase64ImageToPdf(doc, chartImages.topicChart, { x: 50, y: doc.y, width: 500, height: 300 });
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
      
      // Add footer
      doc.moveDown(2);
      const date = new Date();
      doc.fontSize(10)
         .fillColor('#999')
         .text(`Report generated on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`, { align: 'center' });
      
      // Finalize the PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Helper function to format time period
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
  } else if (timePeriod.custom && timePeriod.startDate && timePeriod.endDate) {
    const start = new Date(timePeriod.startDate);
    const end = new Date(timePeriod.endDate);
    return `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
  }
  
  return 'Custom Range';
}

/**
 * Generate a professional PDF report using templates
 * @param {Object} options - Report generation options
 * @returns {Buffer} - PDF buffer
 */
export async function generateProfessionalReport({
  statisticsData,
  timePeriod,
  conversations = [],
  includeTextAnalysis = false,
  includeGPTAnalysis = false,
  maxConversations = 25,
  progressCallback = null,
  templateName = 'modern-report-template'
}) {
  try {
    // Initialize progress
    if (progressCallback) {
      progressCallback('Initializing report generation...', 0);
    }

    // Create a copy of statistics data to avoid mutation
    const reportData = { ...statisticsData };

    // Add text analysis if requested
    if (includeTextAnalysis && conversations.length > 0) {
      if (progressCallback) {
        progressCallback('Performing text analysis...', 20);
      }
      
      try {
        const textAnalysis = await performTextAnalysis(conversations);
        reportData.textAnalysis = textAnalysis;
      } catch (error) {
        console.error('Text analysis failed:', error);
        // Continue without text analysis
      }
    }

    // Add GPT analysis if requested
    if (includeGPTAnalysis) {
      if (progressCallback) {
        progressCallback('Generating AI insights...', 40);
      }
      
      try {
        // Prepare conversation contents for GPT analysis
        const conversationContents = conversations.slice(0, maxConversations).map(conv => {
          let conversationData = conv.conversation_data || [];
          
          // Parse conversation data if it's a string
          if (typeof conversationData === 'string') {
            try {
              conversationData = JSON.parse(conversationData);
            } catch (e) {
              console.error('Error parsing conversation data:', e);
              conversationData = [];
            }
          }
          
          return {
            topic: conv.emne || 'Unknown',
            score: conv.score || 'N/A',
            rating: conv.customer_rating || null,
            messages: Array.isArray(conversationData) ? conversationData.map(msg => ({
              isUser: msg.isUser || msg.sender === 'user',
              text: msg.text || msg.message || ''
            })) : []
          };
        });
        
        const gptAnalysis = await generateGPTAnalysis(
          reportData,
          timePeriod,
          conversationContents,
          maxConversations,
          progressCallback
        );
        
        reportData.gptAnalysis = gptAnalysis;
      } catch (error) {
        console.error('GPT analysis failed:', error);
        reportData.gptAnalysis = 'AI analysis could not be generated due to an error.';
      }
    }

    // Generate the PDF using the template processor
    if (progressCallback) {
      progressCallback('Generating PDF report...', 80);
    }
    
    const pdfBuffer = await TemplateProcessor.generateReport(
      reportData,
      timePeriod,
      templateName
    );

    if (progressCallback) {
      progressCallback('Report generation complete!', 100);
    }

    return pdfBuffer;

  } catch (error) {
    console.error('Error generating professional report:', error);
    throw error;
  }
}

/**
 * Legacy function to maintain backward compatibility
 * @deprecated Use generateProfessionalReport instead
 */
export async function generateReport(options) {
  return generateProfessionalReport(options);
}