import fetch from 'node-fetch';

/**
 * Creates a Freshdesk ticket using the same logic as the frontend
 * but running on the backend to avoid CORS issues
 */
export async function createFreshdeskTicket(ticketData) {
  const url = "https://dillingdk.freshdesk.com/api/v2/tickets";
  const apiKey = "KEO5HmGNqGTtLzygTTM"; // Freshdesk API key
  const auth = Buffer.from(`${apiKey}:X`).toString('base64'); // Base64 encode API key with dummy password
  const startTime = Date.now();

  // Log sanitized ticket data for debugging
  const sanitizedData = {
    email: ticketData.email,
    subject: ticketData.subject,
    hasAttachments: ticketData.attachments?.length > 0,
    groupId: ticketData.group_id,
    productId: ticketData.product_id,
    descriptionLength: ticketData.description?.length || 0,
    priority: ticketData.priority,
    status: ticketData.status,
    type: ticketData.type
  };

  console.log("🎫 BACKEND: Starting Freshdesk ticket creation", {
    sanitizedData,
    timestamp: new Date().toISOString(),
    freshdeskUrl: url
  });

  const buildFormData = async () => {
    const formDataStartTime = Date.now();
    
    // Using FormData for exact compatibility with original implementation
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    
    console.log("🎫 BACKEND: Building FormData object");
    
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
        console.log("🎫 BACKEND: Processing attachment", {
          filename: attachment.name,
          mimeType: attachment.mime,
          hasContent: !!attachment.content
        });
        
        // Convert base64 to buffer for form-data
        const base64Data = attachment.content.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        console.log("🎫 BACKEND: Attachment processed", {
          filename: attachment.name,
          bufferSize: buffer.length,
          mimeType: attachment.mime
        });
        
        formData.append("attachments[]", buffer, {
          filename: attachment.name,
          contentType: attachment.mime
        });
      } catch (err) {
        console.error("🎫 BACKEND: Failed to process attachment", {
          error: err.message,
          filename: attachment.name
        });
      }
    }
    
    const formDataTime = Date.now() - formDataStartTime;
    console.log("🎫 BACKEND: FormData built successfully", {
      buildTime: formDataTime,
      hasAttachments: ticketData.attachments?.length > 0
    });
    
    return formData;
  };

  // Enhanced retry mechanism with detailed logging
  const MAX_RETRIES = 2;
  let lastError = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const attemptStartTime = Date.now();
    
    try {
      console.log(`🎫 BACKEND: Attempt ${attempt + 1}/${MAX_RETRIES + 1} starting`, {
        attemptNumber: attempt + 1,
        totalElapsed: attemptStartTime - startTime
      });
      
      const formData = await buildFormData();
      
      // Add timeout to prevent hanging requests
      const AbortController = globalThis.AbortController || (await import('abort-controller')).default;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`🎫 BACKEND: Request timeout after 30s on attempt ${attempt + 1}`);
        controller.abort();
      }, 30000);
      
      const requestHeaders = {
        Authorization: `Basic ${auth}`,
        ...formData.getHeaders() // This adds the correct Content-Type boundary for multipart/form-data
      };
      
      console.log(`🎫 BACKEND: Making HTTP request to Freshdesk`, {
        url,
        method: 'POST',
        attempt: attempt + 1,
        headers: {
          hasAuth: !!requestHeaders.Authorization,
          contentType: requestHeaders['content-type']?.split(';')[0] || 'unknown'
        }
      });
      
      const response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - attemptStartTime;
      
      console.log(`🎫 BACKEND: HTTP response received from Freshdesk`, {
        status: response.status,
        statusText: response.statusText,
        responseTime,
        attempt: attempt + 1,
        headers: {
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length'),
          server: response.headers.get('server'),
          rateLimit: response.headers.get('x-ratelimit-remaining')
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMsg = `Freshdesk API responded ${response.status}: ${errorText}`;
        
        console.error(`🎫 BACKEND: Freshdesk API error on attempt ${attempt + 1}`, {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 500), // Truncate long error messages
          responseTime,
          willRetry: response.status >= 500 && attempt < MAX_RETRIES,
          headers: {
            server: response.headers.get('server'),
            rateLimit: response.headers.get('x-ratelimit-remaining')
          }
        });
        
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          const retryDelay = 1000 * (attempt + 1);
          console.log(`🎫 BACKEND: Retrying after ${retryDelay}ms due to server error`);
          await new Promise((r) => setTimeout(r, retryDelay));
          continue;
        }
        throw new Error(errorMsg);
      }

      let result;
      try {
        result = await response.json();
        console.log(`🎫 BACKEND: Freshdesk response parsed successfully`, {
          hasId: !!result.id,
          resultKeys: Object.keys(result || {}),
          responseTime,
          attempt: attempt + 1
        });
      } catch (parseError) {
        console.error(`🎫 BACKEND: Failed to parse Freshdesk JSON response on attempt ${attempt + 1}`, {
          parseError: parseError.message,
          responseTime
        });
        throw new Error(`Failed to parse Freshdesk response: ${parseError.message}`);
      }
      
      if (!result || !result.id) {
        console.error(`🎫 BACKEND: Invalid Freshdesk response structure on attempt ${attempt + 1}`, {
          result: result,
          responseTime
        });
        throw new Error(`Freshdesk ticket created but invalid response: ${JSON.stringify(result)}`);
      }

      const totalTime = Date.now() - startTime;
      console.log("🎫 BACKEND: Freshdesk ticket created successfully", {
        ticketId: result.id,
        totalTime,
        attempts: attempt + 1,
        email: ticketData.email,
        subject: ticketData.subject
      });
      
      return result; // success – return created ticket
      
    } catch (err) {
      lastError = err;
      const attemptTime = Date.now() - attemptStartTime;
      
      console.error(`🎫 BACKEND: Attempt ${attempt + 1} failed`, {
        error: err.message,
        errorType: err.name,
        attemptTime,
        totalElapsed: Date.now() - startTime,
        willRetry: (err.name === 'AbortError' || err.message.includes('network') || err.message.includes('fetch')) && attempt < MAX_RETRIES
      });
      
      // Check if it's a timeout or network error that should be retried
      if ((err.name === 'AbortError' || err.message.includes('network') || err.message.includes('fetch')) && attempt < MAX_RETRIES) {
        const retryDelay = 1000 * (attempt + 1);
        console.log(`🎫 BACKEND: Network/timeout error, retrying after ${retryDelay}ms`);
        await new Promise((r) => setTimeout(r, retryDelay));
        continue;
      }
      
      if (attempt >= MAX_RETRIES) {
        break; // Exit retry loop
      }
    }
  }
  
  // If we get here, all retries failed
  const finalError = new Error(`Failed to create Freshdesk ticket after ${MAX_RETRIES + 1} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
  const totalTime = Date.now() - startTime;
  
  console.error("🎫 BACKEND: All attempts failed", {
    finalError: finalError.message,
    lastError: lastError?.message,
    totalTime,
    attempts: MAX_RETRIES + 1,
    email: ticketData.email,
    sanitizedData
  });
  
  throw finalError;
} 