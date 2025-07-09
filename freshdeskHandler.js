import fetch from 'node-fetch';

/**
 * Creates a Freshdesk ticket using the same logic as the frontend
 * but running on the backend to avoid CORS issues
 */
export async function createFreshdeskTicket(ticketData) {
  const url = "https://dillingdk.freshdesk.com/api/v2/tickets";
  const apiKey = "KEO5HmGNqGTtLzygTTM"; // Freshdesk API key
  const auth = Buffer.from(`${apiKey}:X`).toString('base64'); // Base64 encode API key with dummy password

  console.log("Backend: Attempting to create Freshdesk ticket for:", ticketData.email);

  const buildFormData = async () => {
    // Using FormData for exact compatibility with original implementation
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    
    formData.append("subject", ticketData.subject);
    formData.append("description", ticketData.description);
    formData.append("email", ticketData.email);
    formData.append("priority", ticketData.priority);
    formData.append("status", ticketData.status);
    formData.append("type", ticketData.type);
    
    if (ticketData.name) {
      formData.append("name", ticketData.name);
    }

    if (ticketData.group_id) {
      formData.append("group_id", ticketData.group_id);
    }

    if (ticketData.product_id) {
      formData.append("product_id", ticketData.product_id);
    }

    // Append custom fields for category
    if (
      ticketData.custom_fields &&
      ticketData.custom_fields.general_questions_category
    ) {
      formData.append(
        "custom_fields[general_questions_category]",
        ticketData.custom_fields.general_questions_category
      );
    }
    if (
      ticketData.custom_fields &&
      ticketData.custom_fields.general_questions_subcategory
    ) {
      formData.append(
        "custom_fields[general_questions_subcategory]",
        ticketData.custom_fields.general_questions_subcategory
      );
    }

    // Handle attachments if provided
    if (ticketData.attachments && ticketData.attachments.length > 0) {
      const attachment = ticketData.attachments[0];
      try {
        // Convert base64 to buffer for form-data
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

  // Simple retry mechanism – 2 retries on network failures or 5xx
  const MAX_RETRIES = 2;
  let lastError = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
              const formData = await buildFormData();
      
      // Add timeout to prevent hanging requests
      const AbortController = globalThis.AbortController || (await import('abort-controller')).default;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          ...formData.getHeaders() // This adds the correct Content-Type boundary for multipart/form-data
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
      
      return result; // success – return created ticket
      
    } catch (err) {
      lastError = err;
      console.error(`Backend: Freshdesk ticket creation attempt ${attempt + 1} failed:`, err);
      
      // Check if it's a timeout or network error that should be retried
      if ((err.name === 'AbortError' || err.message.includes('network') || err.message.includes('fetch')) && attempt < MAX_RETRIES) {
        console.warn(`Backend: Network/timeout error. Retrying (${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      
      if (attempt >= MAX_RETRIES) {
        break; // Exit retry loop
      }
    }
  }
  
  // If we get here, all retries failed
  const finalError = new Error(`Failed to create Freshdesk ticket after ${MAX_RETRIES + 1} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
  console.error("Backend: Final Freshdesk ticket creation failure:", finalError);
  
  throw finalError;
} 