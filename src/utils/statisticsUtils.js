export function parseChatbotIds(param) {
  if (!param) return null;
  return param.split(',');
}

export function buildDateFilter(start_date, end_date, startIndex = 2) {
  if (start_date && end_date) {
    return {
      clause: ` AND created_at BETWEEN $${startIndex} AND $${startIndex + 1}`,
      params: [start_date, end_date],
      nextIndex: startIndex + 2
    };
  }
  return { clause: '', params: [], nextIndex: startIndex };
}


