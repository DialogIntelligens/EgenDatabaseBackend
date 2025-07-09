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
  console.log("Backend: Ticket data size:", JSON.stringify(ticketData).length, "bytes");
  console.log("Backend: Has attachments:", ticketData.attachments && ticketData.attachments.length > 0);

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
      console.log("Backend: Using group_id:", ticketData.group_id);
    }

    if (ticketData.product_id) {
      formData.append("product_id", ticketData.product_id);
      console.log("Backend: Using product_id:", ticketData.product_id);
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
        console.log("Backend: Processing attachment:", attachment.name, "type:", attachment.mime);
        // Convert base64 to buffer for form-data
        const base64Data = attachment.content.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        console.log("Backend: Attachment buffer size:", buffer.length, "bytes");
        formData.append("attachments[]", buffer, {
          filename: attachment.name,
          contentType: attachment.mime
        });
      } catch (err) {
        console.error("Backend: Failed to attach file to Freshdesk ticket", err);
        throw new Error(`Failed to process attachment: ${err.message}`);
      }
    }
    
    return formData;
  };

  // Simple retry mechanism – 3 retries on network failures or 5xx
  const MAX_RETRIES = 3;
  let lastError = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Backend: Freshdesk ticket creation attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
      
      const formData = await buildFormData();
      
      // Add timeout to prevent hanging requests
      const AbortController = globalThis.AbortController || (await import('abort-controller')).default;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log("Backend: Request timeout reached, aborting...");
        controller.abort();
      }, 30000); // 30 second timeout
      
      const startTime = Date.now();
      console.log("Backend: Starting request to Freshdesk API...");
      
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
      const requestDuration = Date.now() - startTime;
      
      console.log(`Backend: Request completed in ${requestDuration}ms with status ${response.status}`);
      console.log("Backend: Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        const errorMsg = `Freshdesk API responded ${response.status}: ${errorText}`;
        console.error(`Backend: Freshdesk ticket creation failed (attempt ${attempt + 1}):`, errorMsg);
        
        // Log detailed error information
        const errorDetails = {
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES + 1,
          requestDuration: requestDuration,
          responseStatus: response.status,
          responseStatusText: response.statusText,
          responseHeaders: Object.fromEntries(response.headers.entries()),
          requestUrl: url,
          requestMethod: "POST",
          ticketEmail: ticketData.email,
          ticketSubject: ticketData.subject,
          hasAttachments: ticketData.attachments && ticketData.attachments.length > 0,
          timestamp: new Date().toISOString(),
          errorText: errorText
        };
        
        console.error(`Backend: Freshdesk ticket creation attempt ${attempt + 1} failed:`, errorDetails);
        
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          console.warn(`Backend: ${errorMsg}. Retrying (${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        
        // Create enhanced error for final failure
        const enhancedError = new Error(errorMsg);
        enhancedError.details = errorDetails;
        enhancedError.category = response.status >= 500 ? 'API_ERROR' : 'VALIDATION_ERROR';
        enhancedError.statusCode = response.status;
        throw enhancedError;
      }

      let result;
      try {
        result = await response.json();
        console.log("Backend: Successfully parsed Freshdesk response");
      } catch (parseError) {
        const parseErrorMsg = `Failed to parse Freshdesk response: ${parseError.message}`;
        console.error("Backend:", parseErrorMsg);
        
        const errorDetails = {
          attempt: attempt + 1,
          requestDuration: requestDuration,
          responseStatus: response.status,
          parseError: parseError.message,
          timestamp: new Date().toISOString()
        };
        
        const enhancedError = new Error(parseErrorMsg);
        enhancedError.details = errorDetails;
        enhancedError.category = 'PARSING_ERROR';
        throw enhancedError;
      }
      
      if (!result || !result.id) {
        const resultErrorMsg = `Freshdesk ticket created but invalid response: ${JSON.stringify(result)}`;
        console.error("Backend:", resultErrorMsg);
        
        const errorDetails = {
          attempt: attempt + 1,
          requestDuration: requestDuration,
          responseStatus: response.status,
          invalidResponse: result,
          timestamp: new Date().toISOString()
        };
        
        const enhancedError = new Error(resultErrorMsg);
        enhancedError.details = errorDetails;
        enhancedError.category = 'API_ERROR';
        throw enhancedError;
      }

      console.log("Backend: Freshdesk ticket created successfully, id:", result.id);
      console.log(`Backend: Total request time: ${requestDuration}ms`);
      
      return result; // success – return created ticket
      
    } catch (err) {
      lastError = err;
      console.error(`Backend: Freshdesk ticket creation attempt ${attempt + 1} failed:`, err);
      
      // Enhanced error logging for different types of failures
      const errorDetails = {
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES + 1,
        errorType: err.name || 'UnknownError',
        errorMessage: err.message,
        errorStack: err.stack,
        ticketEmail: ticketData.email,
        ticketSubject: ticketData.subject,
        timestamp: new Date().toISOString(),
        originalErrorDetails: err.details || null
      };
      
      console.error(`Backend: Detailed error info for attempt ${attempt + 1}:`, errorDetails);
      
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
  
  // Enhanced error details for final failure
  const finalErrorDetails = {
    totalAttempts: MAX_RETRIES + 1,
    finalErrorType: lastError?.name || 'UnknownError',
    finalErrorMessage: lastError?.message || 'Unknown error',
    finalErrorStack: lastError?.stack || 'No stack trace',
    ticketEmail: ticketData.email,
    ticketSubject: ticketData.subject,
    ticketDataSize: JSON.stringify(ticketData).length,
    hasAttachments: ticketData.attachments && ticketData.attachments.length > 0,
    timestamp: new Date().toISOString(),
    lastErrorDetails: lastError?.details || null,
    lastErrorCategory: lastError?.category || 'UNKNOWN_ERROR'
  };
  
  console.error("Backend: Final error details:", finalErrorDetails);
  
  // Attach details to the error for the calling function
  finalError.details = finalErrorDetails;
  finalError.category = lastError?.category || 'API_ERROR';
  
  throw finalError;
} 