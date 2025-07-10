import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Simple template processor that replaces {{VARIABLE}} placeholders with actual data
 */
class TemplateProcessor {
  
  /**
   * Process a template with data
   * @param {string} templatePath - Path to the template file
   * @param {Object} data - Data to fill into the template
   * @returns {string} - Processed HTML
   */
  static async processTemplate(templatePath, data) {
    try {
      // Read the template file
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      
      // Process the template with data
      let processedContent = templateContent;
      
      // Handle simple {{VARIABLE}} replacements
      Object.keys(data).forEach(key => {
        const placeholder = `{{${key}}}`;
        const value = data[key];
        processedContent = processedContent.replace(new RegExp(placeholder, 'g'), value || '');
      });
      
      // Handle conditional blocks {{#if VARIABLE}}...{{/if}}
      processedContent = this.processConditionals(processedContent, data);
      
      // Handle loops {{#each ARRAY}}...{{/each}}
      processedContent = this.processLoops(processedContent, data);
      
      return processedContent;
    } catch (error) {
      console.error('Error processing template:', error);
      throw error;
    }
  }
  
  /**
   * Process conditional blocks in the template
   * @param {string} content - Template content
   * @param {Object} data - Data object
   * @returns {string} - Processed content
   */
  static processConditionals(content, data) {
    const conditionalRegex = /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g;
    
    return content.replace(conditionalRegex, (match, variable, block) => {
      const value = data[variable];
      // Return the block if the variable is truthy, otherwise return empty string
      return value ? block : '';
    });
  }
  
  /**
   * Process loop blocks in the template
   * @param {string} content - Template content
   * @param {Object} data - Data object
   * @returns {string} - Processed content
   */
  static processLoops(content, data) {
    const loopRegex = /{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g;
    
    return content.replace(loopRegex, (match, variable, block) => {
      const array = data[variable];
      if (!Array.isArray(array)) {
        return '';
      }
      
      return array.map(item => {
        let itemBlock = block;
        // Replace {{property}} with item.property
        Object.keys(item).forEach(key => {
          const placeholder = `{{${key}}}`;
          itemBlock = itemBlock.replace(new RegExp(placeholder, 'g'), item[key] || '');
        });
        return itemBlock;
      }).join('');
    });
  }
  
  /**
   * Convert HTML to PDF using Puppeteer
   * @param {string} html - HTML content
   * @param {Object} options - PDF options
   * @returns {Buffer} - PDF buffer
   */
  static async htmlToPdf(html, options = {}) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Set content and wait for it to load
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      
      // Generate PDF with proper options
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        ...options
      });
      
      return pdfBuffer;
    } finally {
      await browser.close();
    }
  }
  
  /**
   * Format time period for display
   * @param {string|Object} timePeriod - Time period data
   * @returns {string} - Formatted time period
   */
  static formatTimePeriod(timePeriod) {
    if (typeof timePeriod === 'string') {
      switch (timePeriod) {
        case 'all':
          return 'All Time';
        case '7':
          return 'Last 7 Days';
        case '30':
          return 'Last 30 Days';
        case 'yesterday':
          return 'Yesterday';
        default:
          return timePeriod;
      }
    } else if (timePeriod && timePeriod.custom) {
      const startDate = new Date(timePeriod.startDate).toLocaleDateString();
      const endDate = new Date(timePeriod.endDate).toLocaleDateString();
      return `${startDate} - ${endDate}`;
    }
    return 'Unknown Period';
  }
  
  /**
   * Process markdown content for HTML display
   * @param {string} markdown - Markdown content
   * @returns {string} - HTML content
   */
  static processMarkdown(markdown) {
    if (!markdown) return '';
    
    // Simple markdown processing
    let html = markdown;
    
    // Headers
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    
    // Bold text
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic text
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Paragraphs
    html = html.replace(/\n\s*\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    
    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    
    return html;
  }
  
  /**
   * Prepare data for template processing
   * @param {Object} statisticsData - Raw statistics data
   * @param {string} timePeriod - Time period
   * @returns {Object} - Processed data for template
   */
  static prepareTemplateData(statisticsData, timePeriod) {
    const {
      totalMessages,
      averageMessagesPerDay,
      totalConversations,
      totalCustomerRatings,
      averageCustomerRating,
      csatScore,
      thumbsRating,
      chartImages,
      textAnalysis,
      gptAnalysis,
      topicDistribution,
      emneData,
      companyInfo,
      // Purchase tracking
      totalPurchases = 0,
      totalRevenue = 0,
      conversionRate = 'N/A',
      hasPurchaseTracking = false
    } = statisticsData;
    
    // Process topic distribution for display
    let processedTopics = null;
    if (topicDistribution && topicDistribution.length > 0) {
      const totalTopicCount = topicDistribution.reduce((sum, [_, count]) => sum + count, 0);
      processedTopics = topicDistribution.slice(0, 8).map(([name, count]) => ({
        name: name,
        percentage: Math.round((count / totalTopicCount) * 100)
      }));
    }
    
    // Process text analysis data
    let processedTextAnalysis = null;
    if (textAnalysis) {
      processedTextAnalysis = {
        hasData: true,
        positiveCorrelations: textAnalysis.positiveCorrelations?.slice(0, 10).map(item => ({
          ngram: item.ngram,
          correlation: item.correlation.toFixed(3)
        })) || [],
        negativeCorrelations: textAnalysis.negativeCorrelations?.slice(0, 10).map(item => ({
          ngram: item.ngram,
          correlation: item.correlation.toFixed(3)
        })) || []
      };
    }
    
    return {
      // Basic info
      TIME_PERIOD: this.formatTimePeriod(timePeriod),
      GENERATED_DATE: new Date().toLocaleDateString(),
      COMPANY_INFO: companyInfo || null,
      
      // Statistics
      TOTAL_MESSAGES: totalMessages?.toLocaleString() || '0',
      TOTAL_CONVERSATIONS: totalConversations?.toLocaleString() || '0',
      AVERAGE_MESSAGES_PER_DAY: averageMessagesPerDay || '0',
      AVERAGE_RATING: averageCustomerRating || 'N/A',
      RATING_LABEL: thumbsRating ? 'Thumbs Up %' : 'Average Rating',
      CSAT_SCORE: csatScore || null,
      
      // Purchase tracking
      HAS_PURCHASE_TRACKING: hasPurchaseTracking,
      TOTAL_PURCHASES: totalPurchases?.toLocaleString() || '0',
      TOTAL_REVENUE: totalRevenue?.toLocaleString() || '0',
      CONVERSION_RATE: conversionRate || 'N/A',
      
      // Charts
      DAILY_CHART: chartImages?.dailyChart || null,
      HOURLY_CHART: chartImages?.hourlyChart || null,
      TOPIC_CHART: chartImages?.topicChart || null,
      DAILY_CHART_TITLE: emneData?.isWeekly ? 'Weekly Messages' : 'Daily Messages',
      
      // Topic distribution
      TOPIC_DISTRIBUTION: processedTopics,
      
      // Text analysis
      TEXT_ANALYSIS: processedTextAnalysis?.hasData || false,
      POSITIVE_CORRELATIONS: processedTextAnalysis?.positiveCorrelations || [],
      NEGATIVE_CORRELATIONS: processedTextAnalysis?.negativeCorrelations || [],
      
      // GPT Analysis
      GPT_ANALYSIS: gptAnalysis ? this.processMarkdown(gptAnalysis) : null
    };
  }
  
  /**
   * Generate PDF report from template
   * @param {Object} statisticsData - Statistics data
   * @param {string} timePeriod - Time period
   * @param {string} templateName - Template name (default: 'modern-report-template')
   * @returns {Buffer} - PDF buffer
   */
  static async generateReport(statisticsData, timePeriod, templateName = 'modern-report-template') {
    try {
      const templatePath = path.join(__dirname, 'reportTemplates', `${templateName}.html`);
      
      // Prepare data for template
      const templateData = this.prepareTemplateData(statisticsData, timePeriod);
      
      // Process template
      const processedHtml = await this.processTemplate(templatePath, templateData);
      
      // Generate PDF
      const pdfBuffer = await this.htmlToPdf(processedHtml);
      
      return pdfBuffer;
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }
}

export default TemplateProcessor; 