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
    totalMessagesDesc: 'samlede beskeder',
    customerSatisfactionDesc: 'rating',
    consistentPerformanceDesc: 'CSAT score',
    businessImpactDesc: 'omsætning',

    // FAQ Analysis (replace correlation translations)
    customerQuestionAnalysis: '❓ Kunde Spørgsmål Analyse',
    topFAQs: '📋 Top 5 Hyppigst Stillede Spørgsmål (FAQ)',
    faqDescription: 'De mest almindelige spørgsmål som kunder stiller til chatbotten:',
    timesAsked: 'gange spurgt af kunder',
    variationsExplained: 'forskellige måder at spørge på',
    languagePatternAnalysis: '🧠 Sprogmønster Analyse & Indsigter',
    customerCommunicationAnalysis: '📊 Kunde Kommunikationsanalyse',
    askedText: 'Stillet',
    timesText: 'gange',
    uniqueVariationsText: 'unikke variationer',
    askedByCustomers: 'Stillet af kunder:',
    numberOfVariations: 'Antal unikke variationer:',

    // Metrics
    totalMessages: 'Samlede Beskeder',
    totalMessagesMetricDesc: 'Brugerinteraktioner med chatbot system',
    avgMessagesPerDay: 'Gennemsnitlige Beskeder/Dag',
    avgMessagesPerDayDesc: 'Dagligt besked volumen gennemsnit',
    totalConversations: 'Samlede Samtaler',
    totalConversationsDesc: 'Unikke kunde chat sessioner',

    totalCustomerRatings: 'Samlede Kunde Vurderinger',
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
    avgPurchaseValueDesc: 'Gennemsnitligt transaktionsbeløb',
    conversionRate: 'Konverteringsrate',
    conversionRateDesc: 'Besked-til-køb konvertering',

    // Other Metrics
    fallbackRate: 'Fallback Rate',
    fallbackRateDesc: 'Uhåndterede kunde forespørgsler',
    totalLeads: 'Samlede Leads',
    totalLeadsDesc: 'Kunde kontakter genereret',

    // Chart Titles
    dailyMessageVolume: 'Daglig Besked Volumen Trends',
    weeklyMessageVolume: 'Ugentlig Besked Volumen Trends',
    peakActivityHours: 'Peak Aktivitetstimer Analyse',
    customerInquiryTopics: 'Kunde Forespørgsel Emne Fordeling',

    // Chart Descriptions
    messageDistributionDaily: 'Besked fordelingsmønstre over daglige intervaller der viser peak aktivitetsperioder',
    messageDistributionWeekly: 'Besked fordelingsmønstre over ugentlige intervaller der viser peak aktivitetsperioder',
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
    totalMessagesDesc: 'total messages',
    customerSatisfactionDesc: 'rating',
    consistentPerformanceDesc: 'CSAT score',
    businessImpactDesc: 'revenue',

    // FAQ Analysis (replace correlation translations)
    customerQuestionAnalysis: '❓ Customer Question Analysis',
    topFAQs: '📋 Top 5 Frequently Asked Questions (FAQ)',
    faqDescription: 'The most common questions customers ask the chatbot:',
    timesAsked: 'times asked by customers',
    variationsExplained: 'different ways of asking',
    languagePatternAnalysis: '🧠 Language Pattern Analysis & Insights',
    customerCommunicationAnalysis: '📊 Customer Communication Analysis',
    askedText: 'Asked',
    timesText: 'times',
    uniqueVariationsText: 'unique variations',
    askedByCustomers: 'Asked by customers:',
    numberOfVariations: 'Number of unique variations:',

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
    fallbackRate: 'Fallback Rate',
    fallbackRateDesc: 'Unhandled customer inquiries',
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
    customerEngagementPatterns: 'Customer engagement patterns throughout the day reveal optimal support hours',
    topicDiscussion: 'Most frequently discussed topics and customer interests driving engagement'
  },

  sv: {
    // Main Report Headers
    reportTitle: 'AI Analysinsikter',
    reportSubtitle: 'Chatbot Prestanda & Kundintelligens Rapport',
    analysisPeriod: 'Analysperiod',
    generated: 'Genererad',

    // Section Headers
    aiInsights: 'AI-Drivna Affärsinsikter',
    keyInsights: '🔍 Nyckel Prestanda Insikter',
    performanceAnalytics: '📈 Prestanda Analytics Dashboard',
    performanceMetrics: '📊 Prestanda Mätvärden Översikt',

    // Key Insights
    highEngagement: 'Högt Engagemang',
    customerSatisfaction: 'Kundnöjdhet',
    consistentPerformance: 'Konsekvent Prestanda',
    businessImpact: 'Affärspåverkan',

    // Descriptions
    totalMessagesDesc: 'totala meddelanden',
    customerSatisfactionDesc: 'betyg',
    consistentPerformanceDesc: 'CSAT poäng',
    businessImpactDesc: 'intäkter',

    // FAQ Analysis
    customerQuestionAnalysis: '❓ Kundfrågaanalys',
    topFAQs: '📋 Top 5 Vanligaste Frågorna (FAQ)',
    faqDescription: 'De vanligaste frågorna som kunder ställer till chatbotten:',
    askedText: 'Frågat',
    timesText: 'gånger',
    uniqueVariationsText: 'unika variationer',
    askedByCustomers: 'Frågat av kunder:',
    numberOfVariations: 'Antal unika variationer:',

    // Metrics
    totalMessages: 'Totala Meddelanden',
    totalMessagesMetricDesc: 'Användarinteraktioner med chatbot system',
    avgMessagesPerDay: 'Genomsnittliga Meddelanden/Dag',
    avgMessagesPerDayDesc: 'Dagligt meddelandevolym genomsnitt',
    totalConversations: 'Totala Konversationer',
    totalConversationsDesc: 'Unika kund chat sessioner',

    totalCustomerRatings: 'Totala Kundbetyg',
    totalCustomerRatingsDesc: 'Antal kund feedback svar',
    customerSatisfactionMetric: 'Kundnöjdhet',
    customerSatisfactionMetricDesc: 'Genomsnittlig användar betyg poäng',
    csatScore: 'CSAT Poäng',
    csatScoreDesc: 'Kundnöjdhetsprocent',

    // Purchase Metrics
    totalPurchases: 'Totala Köp',
    totalPurchasesDesc: 'Antal slutförda transaktioner',
    totalRevenue: 'Total Intäkt',
    totalRevenueDesc: 'Intäkter genererade genom chatbot',
    avgPurchaseValue: 'Genomsnittligt Köpvärde',
    avgPurchaseValueDesc: 'Genomsnittligt transaktionsbelopp',
    conversionRate: 'Konverteringsgrad',
    conversionRateDesc: 'Meddelande-till-köp konvertering',

    // Other Metrics
    fallbackRate: 'Fallback Grad',
    fallbackRateDesc: 'Ohanterade kund förfrågningar',
    totalLeads: 'Totala Leads',
    totalLeadsDesc: 'Kund kontakter genererade',

    // Chart Titles
    dailyMessageVolume: 'Daglig Meddelandevolym Trender',
    weeklyMessageVolume: 'Veckovis Meddelandevolym Trender',
    peakActivityHours: 'Peak Aktivitetstimmar Analys',
    customerInquiryTopics: 'Kund Förfrågan Ämne Fördelning',

    // Chart Descriptions
    messageDistributionDaily: 'Meddelandefördelning mönster över dagliga intervall som visar peak aktivitetsperioder',
    messageDistributionWeekly: 'Meddelandefördelning mönster över veckovisa intervall som visar peak aktivitetsperioder',
    customerEngagementPatterns: 'Kund engagemang mönster genom dagen avslöjar optimala support timmar',
    topicDiscussion: 'Mest frekvent diskuterade ämnen och kund intressen som driver engagemang'
  }
};

/**
 * Get translation for a specific key and language
 * @param {string} key - Translation key
 * @param {string} language - Language code (da, en, sv, etc.)
 * @returns {string} - Translated text with fallback to English
 */
export function getReportTranslation(key, language = 'en') {
  const translations = reportTranslations[language] || reportTranslations.en;
  return translations[key] || reportTranslations.en[key] || key;
}

/**
 * Get all translations for a specific language
 * @param {string} language - Language code (da, en, sv, etc.)
 * @returns {Object} - All translations for the language with English fallback
 */
export function getReportTranslations(language = 'en') {
  const baseTranslations = reportTranslations.en;
  const languageTranslations = reportTranslations[language] || {};
  
  // Merge with English as fallback
  return { ...baseTranslations, ...languageTranslations };
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