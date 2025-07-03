import express from 'express';

const router = express.Router();

// Freshdesk configuration
const FRESHDESK_DOMAIN = 'dillingdk.freshdesk.com';
const FRESHDESK_API_KEY = 'KEO5HmGNqGTtLzygTTM';
const FRESHDESK_API_URL = `https://${FRESHDESK_DOMAIN}/api/v2/tickets`;

/**
 * Create a Freshdesk ticket
 * POST /api/create-freshdesk-ticket
 */
router.post('/create-freshdesk-ticket', async (req, res) => {
  try {
    const {
      subject,
      description,
      email,
      priority = 1,
      status = 2,
      type = 'Chatbot',
      name,
      group_id,
      custom_fields,
      attachments
    } = req.body;

    console.log('Creating Freshdesk ticket for:', email);

    // Validate required fields
    if (!subject || !description || !email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: subject, description, email'
      });
    }

    // Prepare FormData for Freshdesk API
    const FormData = (await import('form-data')).default;
    const formData = new FormData();

    // Add basic ticket fields
    formData.append('subject', subject);
    formData.append('description', description);
    formData.append('email', email);
    formData.append('priority', priority.toString());
    formData.append('status', status.toString());
    formData.append('type', type);

    if (name) {
      formData.append('name', name);
    }

    if (group_id) {
      formData.append('group_id', group_id.toString());
    }

    // Add custom fields
    if (custom_fields) {
      if (custom_fields.general_questions_category) {
        formData.append('custom_fields[general_questions_category]', custom_fields.general_questions_category);
      }
      if (custom_fields.general_questions_subcategory) {
        formData.append('custom_fields[general_questions_subcategory]', custom_fields.general_questions_subcategory);
      }
    }

    // Handle attachments
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        try {
          // Convert base64 to buffer
          const base64Data = attachment.data.replace(/^data:.*,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          
          formData.append('attachments[]', buffer, {
            filename: attachment.name,
            contentType: attachment.mime
          });
        } catch (attachmentError) {
          console.error('Error processing attachment:', attachmentError);
          // Continue without this attachment rather than failing the entire request
        }
      }
    }

    // Prepare authentication
    const auth = Buffer.from(`${FRESHDESK_API_KEY}:X`).toString('base64');

    // Make request to Freshdesk API with retry logic
    const MAX_RETRIES = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`Freshdesk API attempt ${attempt}/${MAX_RETRIES}`);

        const response = await fetch(FRESHDESK_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            ...formData.getHeaders()
          },
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          const errorMsg = `Freshdesk API error ${response.status}: ${errorText}`;
          
          // Retry on 5xx errors
          if (response.status >= 500 && attempt < MAX_RETRIES) {
            console.warn(`${errorMsg}. Retrying in ${attempt}s...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            continue;
          }
          
          throw new Error(errorMsg);
        }

        const result = await response.json();
        
        if (!result.id) {
          throw new Error(`Invalid Freshdesk response: ${JSON.stringify(result)}`);
        }

        console.log(`Freshdesk ticket created successfully: ${result.id}`);
        
        return res.json({
          success: true,
          ticket_id: result.id,
          ticket_url: `https://${FRESHDESK_DOMAIN}/a/tickets/${result.id}`,
          created_at: result.created_at,
          status: result.status
        });

      } catch (error) {
        lastError = error;
        console.error(`Freshdesk API attempt ${attempt} failed:`, error.message);
        
        if (attempt >= MAX_RETRIES) {
          break;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }

    // All retries failed
    console.error('All Freshdesk API attempts failed:', lastError);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to create Freshdesk ticket after multiple attempts',
      details: lastError?.message || 'Unknown error'
    });

  } catch (error) {
    console.error('Freshdesk ticket creation error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * Get Freshdesk ticket status
 * GET /api/freshdesk-ticket/:ticketId
 */
router.get('/freshdesk-ticket/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    if (!ticketId) {
      return res.status(400).json({
        success: false,
        error: 'Ticket ID is required'
      });
    }

    const auth = Buffer.from(`${FRESHDESK_API_KEY}:X`).toString('base64');
    
    const response = await fetch(`${FRESHDESK_API_URL}/${ticketId}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Freshdesk API error: ${errorText}`
      });
    }

    const ticket = await response.json();
    
    return res.json({
      success: true,
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        requester_id: ticket.requester_id
      }
    });

  } catch (error) {
    console.error('Error fetching Freshdesk ticket:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

export { router as freshdeskRouter }; 