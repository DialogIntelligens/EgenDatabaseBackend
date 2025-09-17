export function sanitizeBodylabResponseText(responseText) {
  let cleanedText = responseText
    .replace(/[\r\n]+/g, ' ')
    .replace(/,\s*}/g, '}')
    .replace(/,\s*\]/g, ']')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  if (!cleanedText.trim().startsWith('{') && !cleanedText.trim().startsWith('[')) {
    cleanedText = `{"status":"success", "orders":${cleanedText}}`;
  }
  let braceCount = 0;
  let bracketCount = 0;
  for (const ch of cleanedText) {
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
    if (ch === '[') bracketCount++;
    if (ch === ']') bracketCount--;
  }
  if (braceCount > 0) cleanedText += '}'.repeat(braceCount);
  if (bracketCount > 0) cleanedText += ']'.repeat(bracketCount);
  return cleanedText;
}

export function extractOrdersWithRegex(cleanedText) {
  const orderNumberMatches = [...cleanedText.matchAll(/"order_number"\s*:\s*"([^"]+)"/g)];
  const orderStatusMatches = [...cleanedText.matchAll(/"order_status"\s*:\s*"([^"]+)"/g)];
  const trackingNumberMatches = [...cleanedText.matchAll(/"trackingNumber"\s*:\s*"([^"]+)"/g)];
  const trackingDateMatches = [...cleanedText.matchAll(/"trackingDate"\s*:\s*"([^"]+)"/g)];
  const attentionMatches = [...cleanedText.matchAll(/"attention"\s*:\s*"([^"]+)"/g)];
  if (orderNumberMatches.length === 0) return null;
  return orderNumberMatches.map((m, i) => ({
    order_number: m[1],
    order_status: orderStatusMatches[i]?.[1] || 'Unknown',
    trackingNumber: trackingNumberMatches[i]?.[1] || '',
    trackingDate: trackingDateMatches[i]?.[1] || '',
    attention: attentionMatches[i]?.[1] || ''
  }));
}


