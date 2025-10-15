/**
 * Transform raw statistics data into PDF-friendly format
 * @param {Object} rawData - Raw statistics data from frontend
 * @returns {Object} Transformed data for PDF generation
 */
export function transformStatisticsForPDF(rawData) {
  console.log("Transforming statistics data for PDF generation...");
  console.log("Raw data keys:", Object.keys(rawData));

  // Handle the case where rawData might be the raw JSON numbers from frontend
  const transformed = {
    // Basic message statistics
    totalMessages: Number(rawData.totalMessages) || 0,
    totalConversations: Number(rawData.totalConversations) || 0,
    averageMessagesPerDay: Number(rawData.averageMessagesPerDay) || 0,

    // Time period information
    timePeriodDays: Number(rawData.timePeriodDays) || 1,

    // Daily and hourly data arrays
    dailyData: Array.isArray(rawData.dailyData) ? rawData.dailyData : [],
    hourlyData: Array.isArray(rawData.hourlyData) ? rawData.hourlyData : [],

    // Topic analysis
    topTopics: Array.isArray(rawData.topTopics) ? rawData.topTopics : [],

    // Sentiment analysis
    sentimentAnalysis: rawData.sentimentAnalysis || {
      positive: 0,
      negative: 0,
      neutral: 0
    },

    // Purchase tracking data
    hasPurchaseTracking: Boolean(rawData.hasPurchaseTracking),
    totalPurchases: Number(rawData.totalPurchases) || 0,
    totalRevenue: Number(rawData.totalRevenue) || 0,
    averagePurchaseValue: Number(rawData.averagePurchaseValue) || 0,
    conversionRate: Number(rawData.conversionRate) || 0,

    // Fallback rate statistics
    hasFallbackData: Boolean(rawData.hasFallbackData),
    fallbackRate: Number(rawData.fallbackRate) || 0,

    // Ligegyldig rate statistics
    hasLigegyldigData: Boolean(rawData.hasLigegyldigData),
    ligegyldigRate: Number(rawData.ligegyldigRate) || 0,

    // Response time data
    hasResponseTimeData: Boolean(rawData.hasResponseTimeData),
    avgResponseTime: rawData.avgResponseTime || 'N/A',

    // Livechat statistics
    totalLivechatConversations: Number(rawData.totalLivechatConversations) || 0,
    avgLivechatPerDay: Number(rawData.avgLivechatPerDay) || 0,

    // Chart images (if provided)
    chartImages: rawData.chartImages || {},

    // Company information
    companyInfo: rawData.companyInfo || null,

    // GPT analysis (will be added later in the process)
    gptAnalysis: rawData.gptAnalysis || null,

    // Additional metadata
    generatedAt: new Date().toISOString(),

    // Handle any custom fields that might exist
    ...Object.keys(rawData).reduce((acc, key) => {
      // Include any additional fields not explicitly handled above
      if (!['totalMessages', 'totalConversations', 'averageMessagesPerDay', 'timePeriodDays',
            'dailyData', 'hourlyData', 'topTopics', 'sentimentAnalysis', 'hasPurchaseTracking',
            'totalPurchases', 'totalRevenue', 'averagePurchaseValue', 'conversionRate',
            'hasFallbackData', 'fallbackRate',
            'hasLigegyldigData', 'ligegyldigRate', 'hasResponseTimeData', 'avgResponseTime',
            'totalLivechatConversations', 'avgLivechatPerDay', 'chartImages', 'companyInfo', 'gptAnalysis'].includes(key)) {
        acc[key] = rawData[key];
      }
      return acc;
    }, {})
  };

  // Calculate derived fields
  if (transformed.totalMessages > 0 && transformed.timePeriodDays > 0) {
    transformed.averageMessagesPerDay = Number((transformed.totalMessages / transformed.timePeriodDays).toFixed(1));
  }

  // Calculate conversion rate if we have purchase data
  if (transformed.hasPurchaseTracking && transformed.totalConversations > 0) {
    transformed.conversionRate = Number(((transformed.totalPurchases / transformed.totalConversations) * 100).toFixed(2));
  }

  console.log("Transformed data keys:", Object.keys(transformed));
  console.log("Key statistics:", {
    totalMessages: transformed.totalMessages,
    totalConversations: transformed.totalConversations,
    averageMessagesPerDay: transformed.averageMessagesPerDay,
    hasPurchaseTracking: transformed.hasPurchaseTracking,
    totalPurchases: transformed.totalPurchases
  });

  return transformed;
}
