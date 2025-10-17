/**
 * Chatbot Settings Service
 * Handles all database operations for chatbot_settings table
 * Used by Dashboard to manage chatbot configuration
 */

/**
 * Get all editable settings for a chatbot
 * Returns complete configuration for Dashboard editing
 */
export async function getChatbotSettingsService(chatbotId, pool) {
  try {
    const result = await pool.query(`
      SELECT 
        chatbot_id,
        image_enabled,
        camera_button_enabled,
        first_message,
        iframe_url,
        header_logo_url,
        message_icon_url,
        theme_color,
        ai_message_color,
        ai_message_text_color,
        font_family,
        header_title,
        header_subtitle,
        chat_window_title,
        privacy_link,
        subtitle_link_text,
        subtitle_link_url,
        lead_email,
        lead_field1_label,
        lead_field2_label,
        use_thumbs_rating,
        rating_timer_duration,
        replace_exclamation_with_period,
        enable_livechat,
        enable_minimize_button,
        enable_popup_message,
        purchase_tracking_enabled,
        show_powered_by,
        input_placeholder,
        rating_message,
        product_button_text,
        product_button_color,
        product_button_padding,
        product_image_height_multiplier,
        product_box_height_multiplier,
        freshdesk_email_label,
        freshdesk_message_label,
        freshdesk_image_label,
        freshdesk_choose_file_text,
        freshdesk_no_file_text,
        freshdesk_sending_text,
        freshdesk_submit_text,
        freshdesk_subject_text,
        freshdesk_name_label,
        freshdesk_email_required_error,
        freshdesk_email_invalid_error,
        freshdesk_form_error_text,
        freshdesk_message_required_error,
        freshdesk_name_required_error,
        freshdesk_submit_error_text,
        contact_confirmation_text,
        freshdesk_confirmation_text,
        human_agent_question_text,
        human_agent_yes_button_text,
        human_agent_no_button_text,
        freshdesk_group_id,
        freshdesk_product_id,
        to_human_mail,
        button_bottom,
        button_right,
        checkout_page_patterns,
        price_extraction_locale,
        currency,
        border_radius_multiplier,
        settings_updated_at
      FROM chatbot_settings 
      WHERE chatbot_id = $1
    `, [chatbotId]);

    if (result.rows.length === 0) {
      return { 
        statusCode: 404, 
        payload: { error: 'Chatbot not found', chatbot_id: chatbotId } 
      };
    }

    return { 
      statusCode: 200, 
      payload: result.rows[0] 
    };
  } catch (error) {
    console.error('Error fetching chatbot settings:', error);
    return { 
      statusCode: 500, 
      payload: { error: 'Server error', details: error.message } 
    };
  }
}

/**
 * Update chatbot settings
 * Updates only provided fields, leaves others unchanged
 */
export async function updateChatbotSettingsService(chatbotId, updates, pool) {
  try {
    // First verify the chatbot exists
    const checkResult = await pool.query(
      'SELECT chatbot_id FROM chatbot_settings WHERE chatbot_id = $1',
      [chatbotId]
    );

    if (checkResult.rows.length === 0) {
      return { 
        statusCode: 404, 
        payload: { error: 'Chatbot not found', chatbot_id: chatbotId } 
      };
    }

    // Build dynamic UPDATE query based on provided fields
    const allowedFields = [
      'image_enabled',
      'camera_button_enabled',
      'first_message',
      'iframe_url',
      'header_logo_url',
      'message_icon_url',
      'theme_color',
      'ai_message_color',
      'ai_message_text_color',
      'font_family',
      'header_title',
      'header_subtitle',
      'chat_window_title',
      'privacy_link',
      'subtitle_link_text',
      'subtitle_link_url',
      'lead_email',
      'lead_field1_label',
      'lead_field2_label',
      'use_thumbs_rating',
      'rating_timer_duration',
      'replace_exclamation_with_period',
      'enable_livechat',
      'enable_minimize_button',
      'enable_popup_message',
      'purchase_tracking_enabled',
      'show_powered_by',
      'input_placeholder',
      'rating_message',
      'product_button_text',
      'product_button_color',
      'product_button_padding',
      'product_image_height_multiplier',
      'product_box_height_multiplier',
      'freshdesk_email_label',
      'freshdesk_message_label',
      'freshdesk_image_label',
      'freshdesk_choose_file_text',
      'freshdesk_no_file_text',
      'freshdesk_sending_text',
      'freshdesk_submit_text',
      'freshdesk_subject_text',
      'freshdesk_name_label',
      'freshdesk_email_required_error',
      'freshdesk_email_invalid_error',
      'freshdesk_form_error_text',
      'freshdesk_message_required_error',
      'freshdesk_name_required_error',
      'freshdesk_submit_error_text',
      'contact_confirmation_text',
      'freshdesk_confirmation_text',
      'human_agent_question_text',
      'human_agent_yes_button_text',
      'human_agent_no_button_text',
      'freshdesk_group_id',
      'freshdesk_product_id',
      'to_human_mail',
      'button_bottom',
      'button_right',
      'checkout_page_patterns',
      'price_extraction_locale',
      'currency',
      'border_radius_multiplier'
    ];

    const setStatements = [];
    const values = [];
    let paramIndex = 1;

    // Add chatbot_id as first parameter
    values.push(chatbotId);
    paramIndex++;

    // Build SET clause dynamically
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setStatements.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    if (setStatements.length === 0) {
      return { 
        statusCode: 400, 
        payload: { error: 'No valid fields provided for update' } 
      };
    }

    // Always update the settings_updated_at timestamp
    setStatements.push(`settings_updated_at = NOW()`);

    const query = `
      UPDATE chatbot_settings 
      SET ${setStatements.join(', ')}
      WHERE chatbot_id = $1
      RETURNING *
    `;

    const result = await pool.query(query, values);

    return { 
      statusCode: 200, 
      payload: { 
        message: 'Chatbot settings updated successfully', 
        settings: result.rows[0] 
      } 
    };
  } catch (error) {
    console.error('Error updating chatbot settings:', error);
    return { 
      statusCode: 500, 
      payload: { error: 'Server error', details: error.message } 
    };
  }
}

/**
 * Get list of all chatbot IDs (for dropdown/selection)
 */
export async function getAllChatbotIdsService(pool) {
  try {
    const result = await pool.query(`
      SELECT chatbot_id 
      FROM chatbot_settings 
      ORDER BY chatbot_id ASC
    `);

    return { 
      statusCode: 200, 
      payload: result.rows.map(row => row.chatbot_id) 
    };
  } catch (error) {
    console.error('Error fetching chatbot IDs:', error);
    return { 
      statusCode: 500, 
      payload: { error: 'Server error', details: error.message } 
    };
  }
}

