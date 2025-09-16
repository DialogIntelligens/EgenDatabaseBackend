export const defaultStatisticsVisibility = {
  totalMessages: true,
  avgMessagesPerDay: true,
  totalConversations: true,
  totalUserRatings: true,
  averageRating: true,
  csatScore: true,
  totalPurchases: true,
  totalRevenue: true,
  averagePurchaseValue: true,
  conversionRate: true,
  greetingRate: true,
  fallbackRate: true,
  totalLeads: true,
  outsideBusinessHours: true,
  totalLivechatConversations: true,
  avgLivechatPerDay: true,
  livechatPercentage: true,
  avgResponseTime: true,
  totalResponses: true
};

export function parseVisibility(value) {
  if (!value) return { ...defaultStatisticsVisibility };
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return { ...defaultStatisticsVisibility, ...parsed };
  } catch {
    return { ...defaultStatisticsVisibility };
  }
}

export function isValidTime(str) {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
  return timeRegex.test(str);
}


