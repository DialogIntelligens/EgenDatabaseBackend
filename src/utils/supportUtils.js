export function validateSupportStatusPayload({ chatbot_id, is_live }) {
  if (!chatbot_id) {
    return 'chatbot_id and is_live (boolean) are required';
  }
  if (typeof is_live !== 'boolean') {
    return 'chatbot_id and is_live (boolean) are required';
  }
  return null;
}


