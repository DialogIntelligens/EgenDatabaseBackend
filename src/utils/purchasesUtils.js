export function validatePurchasePayload(body) {
  const { user_id, chatbot_id, amount } = body || {};
  if (!user_id || user_id.toString().trim() === "") {
    return "user_id is required";
  }
  if (!chatbot_id || chatbot_id.toString().trim() === "") {
    return "chatbot_id is required";
  }
  if (amount === undefined || amount === null || isNaN(parseFloat(amount))) {
    return "amount must be a valid number";
  }
  return null;
}
