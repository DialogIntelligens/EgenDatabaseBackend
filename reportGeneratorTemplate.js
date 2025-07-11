import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import MarkdownIt from 'markdown-it';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Markdown parser
const mdParser = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

/**
 * Generate a PDF report using HTML template
 * @param {Object} data - The statistics data
 * @param {string} timePeriod - The time period for the report
 * @returns {Promise<Buffer>} - The PDF buffer
 */
export async function generateStatisticsReportTemplate(data, timePeriod) {
  try {
    console.log('Starting template-based PDF generation...');
    console.log('Current working directory:', process.cwd());
    
    // Read the HTML template
    const templatePath = path.join(__dirname, 'reportTemplates', 'default.html');
    console.log('Template path:', templatePath);
    
    // Check if template file exists
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found at: ${templatePath}`);
    }
    
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    console.log('Template loaded successfully, size:', templateSource.length);
    
    // Compile the template
    const template = Handlebars.compile(templateSource);
    
    // Process GPT analysis markdown to HTML
    let gptAnalysisHtml = '';
    if (data.gptAnalysis) {
      gptAnalysisHtml = mdParser.render(data.gptAnalysis);
    }
    
    // Prepare template data
    const templateData = {
      ...data,
      timePeriod: formatTimePeriod(timePeriod),
      gptAnalysis: gptAnalysisHtml,
      generatedDate: new Date().toLocaleDateString('da-DK', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      // Chart images from chartImages object
      dailyChart: data.chartImages?.dailyChart,
      hourlyChart: data.chartImages?.hourlyChart,
      topicChart: data.chartImages?.topicChart,
      // Determine if weekly or daily chart
      isWeekly: data.dailyData?.isWeekly || false,
      // Purchase tracking flags - check for data from different sources
      hasPurchaseTracking: data.hasPurchaseTracking || data.purchaseStats?.hasPurchaseTracking || false,
      totalPurchases: data.totalPurchases || data.purchaseStats?.totalPurchases || 0,
      totalRevenue: data.totalRevenue || data.purchaseStats?.totalRevenue || 0,
      averagePurchaseValue: data.averagePurchaseValue || data.purchaseStats?.averagePurchaseValue || 'N/A',
      conversionRate: data.conversionRate || data.purchaseStats?.conversionRate || 'N/A',
      // Greeting rate flags - check for data from different sources
      hasGreetingRateData: data.hasGreetingRateData || data.greetingRateStats?.hasGreetingRateData || false,
      greetingRate: data.greetingRate || data.greetingRateStats?.greetingRate || 'N/A',
      // Fallback rate flags - check for data from different sources
      hasFallbackData: data.hasFallbackData || data.fallbackRateStats?.hasFallbackData || false,
      fallbackRate: data.fallbackRate || data.fallbackRateStats?.fallbackRate || 'N/A'
    };
    
    // Generate HTML
    const html = template(templateData);
    
    // Launch puppeteer with production-friendly settings
    console.log('Launching puppeteer browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    console.log('Puppeteer browser launched successfully');
    
    const page = await browser.newPage();
    
    // Set content and wait for fonts to load
    await page.setContent(html, { 
      waitUntil: ['networkidle0', 'domcontentloaded'] 
    });
    
    // Generate PDF
    console.log('Generating PDF...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      },
      printBackground: true,
      preferCSSPageSize: true
    });
    
    console.log('PDF generated successfully, size:', pdfBuffer.length);
    await browser.close();
    
    return pdfBuffer;
    
  } catch (error) {
    console.error('Error generating template-based PDF:', error);
    throw error;
  }
}

/**
 * Helper function to format time period
 * @param {string|Object} timePeriod - The time period
 * @returns {string} - Formatted time period string
 */
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
    return `${start.toLocaleDateString('da-DK')} to ${end.toLocaleDateString('da-DK')}`;
  }
  
  return 'Custom Range';
} 