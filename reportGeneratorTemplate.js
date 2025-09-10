import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import MarkdownIt from 'markdown-it';
import puppeteer from 'puppeteer-core';
import { getReportTranslations } from './reportTranslations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Markdown parser
const mdParser = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

/**
 * Generate a PDF report using HTML template
 * @param {Object} data - Statistics data
 * @param {string|Object} timePeriod - Time period for the report
 * @param {string} language - Language code for translations
 * @returns {Promise<Buffer|null>} PDF buffer or null if skipped
 */
export async function generateStatisticsReportTemplate(data, timePeriod, language = 'en') {
  try {
    console.log('Starting template-based PDF generation...');

    // Load template
    const templatePath = path.join(__dirname, 'reportTemplates', 'default.html');
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found at: ${templatePath}`);
    }
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile(templateSource);

    // Render GPT analysis markdown to HTML
    let gptAnalysisHtml = '';
    if (data.gptAnalysis) {
      gptAnalysisHtml = mdParser.render(data.gptAnalysis);
    }

    // Get translations
    const translations = getReportTranslations(language);

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
      dailyChart: data.chartImages?.dailyChart,
      hourlyChart: data.chartImages?.hourlyChart,
      topicChart: data.chartImages?.topicChart,
      isWeekly: data.dailyData?.isWeekly || false,
      reportTitle: data.companyInfo || 'Statistics Report',
      dailyAverage: data.averageMessagesPerDay || (data.totalMessages && data.timePeriodDays ? (data.totalMessages / data.timePeriodDays).toFixed(1) : 'N/A'),
      thumbsRating: data.thumbsRating || false,
      hasPurchaseTracking: data.hasPurchaseTracking || data.purchaseStats?.hasPurchaseTracking || false,
      totalPurchases: data.totalPurchases || data.purchaseStats?.totalPurchases || 0,
      totalRevenue: data.totalRevenue || data.purchaseStats?.totalRevenue || 0,
      averagePurchaseValue: data.averagePurchaseValue || data.purchaseStats?.averagePurchaseValue || 'N/A',
      conversionRate: data.conversionRate || data.purchaseStats?.conversionRate || 'N/A',
      hasGreetingRateData: data.hasGreetingRateData || data.greetingRateStats?.hasGreetingRateData || false,
      greetingRate: data.greetingRate || data.greetingRateStats?.greetingRate || 'N/A',
      hasFallbackData: data.hasFallbackData || data.fallbackRateStats?.hasFallbackData || false,
      fallbackRate: data.fallbackRate || data.fallbackRateStats?.fallbackRate || 'N/A',
      translations,
      reportTitleTranslated: translations.reportTitle,
      reportSubtitleTranslated: translations.reportSubtitle,
      analysisPeriodTranslated: translations.analysisPeriod,
      generatedTranslated: translations.generated,
      aiInsightsTranslated: translations.aiInsights,
      keyInsightsTranslated: translations.keyInsights,
      performanceAnalyticsTranslated: translations.performanceAnalytics,
      performanceMetricsTranslated: translations.performanceMetrics
    };

    const html = template(templateData);

    // --- Skip PDF locally ---
    if (process.env.NODE_ENV !== 'production') {
      console.log('Skipping PDF generation locally');
      return null;
    }

    // Dynamically import chromium only in production
    const chromium = await import('chromium');

    console.log('Launching puppeteer browser...');
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromium.path,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ['networkidle0', 'domcontentloaded'] });

    console.log('Generating PDF...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
      preferCSSPageSize: true
    });

    await browser.close();
    console.log('PDF generated successfully, size:', pdfBuffer.length);
    return pdfBuffer;

  } catch (error) {
    console.error('Error generating template-based PDF:', error);
    return null;
  }
}

/**
 * Format time period for display
 * @param {string|Object} timePeriod
 * @returns {string}
 */
function formatTimePeriod(timePeriod) {
  if (!timePeriod) return 'All Time';
  if (timePeriod === 'all') return 'All Time';
  if (timePeriod === '7') return 'Last 7 Days';
  if (timePeriod === '30') return 'Last 30 Days';
  if (timePeriod === 'yesterday') return 'Yesterday';
  if (timePeriod.custom && timePeriod.startDate && timePeriod.endDate) {
    const start = new Date(timePeriod.startDate);
    const end = new Date(timePeriod.endDate);
    return `${start.toLocaleDateString('da-DK')} to ${end.toLocaleDateString('da-DK')}`;
  }
  return 'Custom Range';
}
