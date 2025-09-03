/**
 * Report Translations
 * Centralized translation file for PDF report generation
 *
 * Usage:
 * import { getReportTranslation } from './reportTranslations.js';
 * const title = getReportTranslation('reportTitle', 'da');
 */

export const reportTranslations = {
  da: {
    // Main Report Headers
    reportTitle: 'AI Analyse Indsigter',
    reportSubtitle: 'Chatbot Performance & Kunde Intelligence Rapport',
    analysisPeriod: 'Analyse Periode',
    generated: 'Genereret',

    // Section Headers
    aiInsights: 'AI-Drevne Forretningsindsigter',
    keyInsights: '🔍 Nøgle Performance Indsigter',
    performanceAnalytics: '📈 Performance Analytics Dashboard',
    performanceMetrics: '📊 Performance Metrics Oversigt',

    // Key Insights
    highEngagement: 'Høj Engagement',
    customerSatisfaction: 'Kundetilfredshed',
    consistentPerformance: 'Konsistent Performance',
    businessImpact: 'Forretningspåvirkning',

    // Descriptions
    totalMessagesDesc: 'samlede beskeder indikerer aktiv brugerinteraktion',
    customerSatisfactionDesc: 'rating viser fremragende servicekvalitet',
    consistentPerformanceDesc: 'CSAT score demonstrerer pålidelig support',
    businessImpactDesc: 'omsætning genereret gennem chatbot interaktioner',

    // Language Analysis
    customerLanguageAnalysis: '📊 Kunde Sproganalyse',
    positivePatterns: '✅ Mest Positive Sprogmønstre',
    negativePatterns: '⚠️ Mest Negative Sprogmønstre',
    positiveDescription: 'Ord og sætninger der korrelerer med højere kundetilfredshedsscore:',
    negativeDescription: 'Ord og sætninger der korrelerer med lavere kundetilfredshedsscore:',
    conversationsText: 'samtaler',
    languagePatternAnalysis: '🧠 Sprogmønster Analyse & Indsigter',
    customerCommunicationAnalysis: '📊 Kunde Kommunikationsanalyse',

    // Metrics
    totalMessages: 'Samlede Beskeder',
    totalMessagesMetricDesc: 'Brugerinteraktioner med chatbot system',
    avgMessagesPerDay: 'Gennemsnitlige Beskeder/Dag',
    avgMessagesPerDayDesc: 'Dagligt beskedvolumen gennemsnit',
    totalConversations: 'Samlede Samtaler',
    totalConversationsDesc: 'Unikke kunde chat sessioner',
    totalCustomerRatings: 'Samlede Kundebedømmelser',
    totalCustomerRatingsDesc: 'Antal kunde feedback svar',
    customerSatisfactionMetric: 'Kundetilfredshed',
    customerSatisfactionMetricDesc: 'Gennemsnitlig bruger rating score',
    csatScore: 'CSAT Score',
    csatScoreDesc: 'Kundetilfredshedsprocent',

    // Purchase Metrics
    totalPurchases: 'Samlede Køb',
    totalPurchasesDesc: 'Antal gennemførte transaktioner',
    totalRevenue: 'Samlet Omsætning',
    totalRevenueDesc: 'Omsætning genereret gennem chatbot',
    avgPurchaseValue: 'Gennemsnitlig Købsværdi',
    avgPurchaseValueDesc: 'Gennemsnitlig transaktionsbeløb',
    conversionRate: 'Konverteringsrate',
    conversionRateDesc: 'Besked-til-køb konvertering',

    // Other Metrics
    greetingSuccessRate: 'Hilsen Succesrate',
    greetingSuccessRateDesc: 'Succesfulde samtale initieringer',
    fallbackRate: 'Fallback Rate',
    fallbackRateDesc: 'Uhåndterede kunde forespørgsler',
    totalLeads: 'Samlede Leads',
    totalLeadsDesc: 'Kunde kontakter genereret',

    // Chart Titles
    dailyMessageVolume: 'Daglig Beskedvolumen Trends',
    weeklyMessageVolume: 'Ugentlig Beskedvolumen Trends',
    peakActivityHours: 'Peak Aktivitetstimer Analyse',
    customerInquiryTopics: 'Kunde Forespørgsel Emne Fordeling',

    // Chart Descriptions
    messageDistributionDaily: 'Beskedfordelings mønstre over daglige intervaller viser peak aktivitetsperioder',
    messageDistributionWeekly: 'Beskedfordelings mønstre over ugentlige intervaller viser peak aktivitetsperioder',
    customerEngagementPatterns: 'Kunde engagement mønstre gennem dagen afslører optimale support timer',
    topicDiscussion: 'Mest diskuterede emner og kunde interesser der driver engagement'
  },

  en: {
    // Main Report Headers
    reportTitle: 'AI Analysis Insights',
    reportSubtitle: 'Chatbot Performance & Customer Intelligence Report',
    analysisPeriod: 'Analysis Period',
    generated: 'Generated',

    // Section Headers
    aiInsights: 'AI-Powered Business Insights',
    keyInsights: '🔍 Key Performance Insights',
    performanceAnalytics: '📈 Performance Analytics Dashboard',
    performanceMetrics: '📊 Performance Metrics Overview',

    // Key Insights
    highEngagement: 'High Engagement',
    customerSatisfaction: 'Customer Satisfaction',
    consistentPerformance: 'Consistent Performance',
    businessImpact: 'Business Impact',

    // Descriptions
    totalMessagesDesc: 'total messages indicate active user interaction',
    customerSatisfactionDesc: 'rating shows excellent service quality',
    consistentPerformanceDesc: 'CSAT score demonstrates reliable support',
    businessImpactDesc: 'revenue generated through chatbot interactions',

    // Language Analysis
    customerLanguageAnalysis: '📊 Customer Language Analysis',
    positivePatterns: '✅ Most Positive Language Patterns',
    negativePatterns: '⚠️ Most Negative Language Patterns',
    positiveDescription: 'Words and phrases that correlate with higher customer satisfaction scores:',
    negativeDescription: 'Words and phrases that correlate with lower customer satisfaction scores:',
    conversationsText: 'conversations',
    languagePatternAnalysis: '🧠 Language Pattern Analysis & Insights',
    customerCommunicationAnalysis: '📊 Customer Communication Analysis',

    // Metrics
    totalMessages: 'Total Messages',
    totalMessagesMetricDesc: 'User interactions with chatbot system',
    avgMessagesPerDay: 'Average Messages/Day',
    avgMessagesPerDayDesc: 'Daily message volume average',
    totalConversations: 'Total Conversations',
    totalConversationsDesc: 'Unique customer chat sessions',
    totalCustomerRatings: 'Total Customer Ratings',
    totalCustomerRatingsDesc: 'Number of customer feedback responses',
    customerSatisfactionMetric: 'Customer Satisfaction',
    customerSatisfactionMetricDesc: 'Average user rating score',
    csatScore: 'CSAT Score',
    csatScoreDesc: 'Customer satisfaction percentage',

    // Purchase Metrics
    totalPurchases: 'Total Purchases',
    totalPurchasesDesc: 'Number of completed transactions',
    totalRevenue: 'Total Revenue',
    totalRevenueDesc: 'Revenue generated through chatbot',
    avgPurchaseValue: 'Average Purchase Value',
    avgPurchaseValueDesc: 'Average transaction amount',
    conversionRate: 'Conversion Rate',
    conversionRateDesc: 'Message-to-purchase conversion',

    // Other Metrics
    greetingSuccessRate: 'Greeting Success Rate',
    greetingSuccessRateDesc: 'Successful conversation initiations',
    fallbackRate: 'Fallback Rate',
    fallbackRateDesc: 'Unhandled customer queries',
    totalLeads: 'Total Leads',
    totalLeadsDesc: 'Customer contacts generated',

    // Chart Titles
    dailyMessageVolume: 'Daily Message Volume Trends',
    weeklyMessageVolume: 'Weekly Message Volume Trends',
    peakActivityHours: 'Peak Activity Hours Analysis',
    customerInquiryTopics: 'Customer Inquiry Topic Distribution',

    // Chart Descriptions
    messageDistributionDaily: 'Message distribution patterns over daily intervals showing peak activity periods',
    messageDistributionWeekly: 'Message distribution patterns over weekly intervals showing peak activity periods',
    customerEngagementPatterns: 'Customer engagement patterns throughout the day revealing optimal support hours',
    topicDiscussion: 'Most frequently discussed topics and customer interests driving engagement'
  }
};

/**
 * Get translation for a specific key and language
 * @param {string} key - Translation key
 * @param {string} language - Language code (da, en, sv, etc.)
 * @returns {string} - Translated text with fallback to English
 */
export function getReportTranslation(key, language = 'en') {
  return reportTranslations[language]?.[key] || reportTranslations['en']?.[key] || key;
}

/**
 * Get all translations for a specific language
 * @param {string} language - Language code
 * @returns {Object} - All translations for that language
 */
export function getReportTranslations(language = 'en') {
  return reportTranslations[language] || reportTranslations['en'];
}

/**
 * Check if a language is supported
 * @param {string} language - Language code
 * @returns {boolean} - Whether the language is supported
 */
export function isLanguageSupported(language) {
  return language in reportTranslations;
}

/**
 * Get list of supported languages
 * @returns {Array} - Array of supported language codes
 */
export function getSupportedLanguages() {
  return Object.keys(reportTranslations);
}
