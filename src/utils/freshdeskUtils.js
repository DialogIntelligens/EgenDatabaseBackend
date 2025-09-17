import fetch from 'node-fetch';

export async function createFreshdeskTicket(ticketData) {
  const url = "https://dillingdk.freshdesk.com/api/v2/tickets";
  const apiKey = "KEO5HmGNqGTtLzygTTM"; // TODO: move to process.env.FRESHDESK_API_KEY
  const auth = Buffer.from(`${apiKey}:X`).toString('base64');

  console.log("Backend: Attempting to create Freshdesk ticket for:", ticketData.email);

  const buildFormData = async () => {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append("subject", ticketData.subject);
    formData.append("description", ticketData.description);
    formData.append("email", ticketData.email);
    formData.append("priority", ticketData.priority);
    formData.append("status", ticketData.status);
    formData.append("type", ticketData.type);
    if (ticketData.name) formData.append("name", ticketData.name);
    if (ticketData.group_id) formData.append("group_id", ticketData.group_id);
    if (ticketData.product_id) formData.append("product_id", ticketData.product_id);
    if (ticketData.custom_fields?.general_questions_category) {
      formData.append("custom_fields[general_questions_category]", ticketData.custom_fields.general_questions_category);
    }
    if (ticketData.custom_fields?.general_questions_subcategory) {
      formData.append("custom_fields[general_questions_subcategory]", ticketData.custom_fields.general_questions_subcategory);
    }
    if (ticketData.attachments && ticketData.attachments.length > 0) {
      const attachment = ticketData.attachments[0];
      try {
        const base64Data = attachment.content.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        formData.append("attachments[]", buffer, {
          filename: attachment.name,
          contentType: attachment.mime
        });
      } catch (err) {
        console.error("Failed to attach file to Freshdesk ticket", err);
      }
    }
    return formData;
  };

  const MAX_RETRIES = 2;
  let lastError = null;
  const AbortController = globalThis.AbortController || (await import('abort-controller')).default;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let timeoutId;
    try {
      const formData = await buildFormData();
      const controller = new AbortController();
      timeoutId = setTimeout(() => {
        console.log(`Backend: Aborting Freshdesk request due to timeout (attempt ${attempt + 1})`);
        controller.abort();
      }, 25000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          ...formData.getHeaders()
        },
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const errorMsg = `Freshdesk API responded ${response.status}: ${errorText}`;
        console.error(`Backend: Freshdesk ticket creation failed (attempt ${attempt + 1}):`, errorMsg);
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          console.warn(`Backend: ${errorMsg}. Retrying (${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(errorMsg);
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error(`Failed to parse Freshdesk response: ${parseError.message}`);
      }
      if (!result || !result.id) {
        throw new Error(`Freshdesk ticket created but invalid response: ${JSON.stringify(result)}`);
      }
      console.log("Backend: Freshdesk ticket created successfully, id:", result.id);
      return result;
    } catch (err) {
      if (typeof timeoutId !== 'undefined') clearTimeout(timeoutId);
      lastError = err;
      console.error(`Backend: Freshdesk ticket creation attempt ${attempt + 1} failed:`, err);
      if ((err.name === 'AbortError' || err.message.includes('network') || err.message.includes('fetch')) && attempt < MAX_RETRIES) {
        const errorType = err.name === 'AbortError' ? 'Timeout' : 'Network';
        console.warn(`Backend: ${errorType} error on attempt ${attempt + 1}. Retrying (${attempt + 1}/${MAX_RETRIES}). Error: ${err.message}`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (attempt >= MAX_RETRIES) break;
    }
  }

  const finalError = new Error(`Failed to create Freshdesk ticket after ${MAX_RETRIES + 1} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
  console.error("Backend: Final Freshdesk ticket creation failure:", finalError);
  finalError.context = {
    attempts: MAX_RETRIES + 1,
    lastError: lastError ? (lastError.message || JSON.stringify(lastError)) : null,
    ticketMeta: {
      email: ticketData.email,
      subject: ticketData.subject,
      hasAttachment: !!(ticketData.attachments && ticketData.attachments.length)
    }
  };
  throw finalError;
}


