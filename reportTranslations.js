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

    // FAQ Analysis (replace correlation translations)
    customerQuestionAnalysis: '❓ Kunde Spørgsmål Analyse',
    topFAQs: '📋 Top 5 Hyppigst Stillede Spørgsmål (FAQ)',
    faqDescription: 'De mest almindelige spørgsmål som kunder stiller til chatbotten:',
    times: 'gange',
    ofConversations: 'af samtaler',
    variations: 'variationer',
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

    // FAQ Analysis (replace correlation translations)
    customerQuestionAnalysis: '❓ Customer Question Analysis',
    topFAQs: '📋 Top 5 Frequently Asked Questions (FAQ)',
    faqDescription: 'The most common questions customers ask the chatbot:',
    times: 'times',
    ofConversations: 'of conversations',
    variations: 'variations',
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
    totalMessagesDesc: 'totala meddelanden indikerar aktiv användarinteraktion',
    customerSatisfactionDesc: 'betyg visar utmärkt servicekvalitet',
    consistentPerformanceDesc: 'CSAT poäng visar pålitlig support',
    businessImpactDesc: 'intäkter genererade genom chatbot interaktioner',

    // Language Analysis
    customerLanguageAnalysis: '📊 Kundspråkanalys',
    positivePatterns: '✅ Mest Positiva Språkmönster',
    negativePatterns: '⚠️ Mest Negativa Språkmönster',
    positiveDescription: 'Ord och fraser som korrelerar med högre kundnöjdhetspoäng:',
    negativeDescription: 'Ord och fraser som korrelerar med lägre kundnöjdhetspoäng:',
    conversationsText: 'konversationer',
    languagePatternAnalysis: '🧠 Språkmönster Analys & Insikter',
    customerCommunicationAnalysis: '📊 Kundkommunikationsanalys',

    // Metrics
    totalMessages: 'Totala Meddelanden',
    totalMessagesMetricDesc: 'Användarinteraktioner med chatbot system',
    avgMessagesPerDay: 'Genomsnittliga Meddelanden/Dag',
    avgMessagesPerDayDesc: 'Dagligt meddelandevolym genomsnitt',
    totalConversations: 'Totala Konversationer',
    totalConversationsDesc: 'Unika kund chat sessioner',
    // FAQ Analysis (replace correlation translations)
    customerQuestionAnalysis: '❓ Kundfrågaanalys',
    topFAQs: '📋 Top 5 Vanligaste Frågorna (FAQ)',
    faqDescription: 'De vanligaste frågorna som kunder ställer till chatbotten:',
    times: 'gånger',
    ofConversations: 'av konversationer',
    variations: 'variationer',

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
    greetingSuccessRate: 'Hälsnings Framgångsgrad',
    greetingSuccessRateDesc: 'Framgångsrika konversations initieringar',
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
