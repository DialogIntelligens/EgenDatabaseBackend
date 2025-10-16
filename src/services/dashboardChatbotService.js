/**
 * Dashboard Chatbot Settings Service
 * Handles CRUD operations for chatbot settings in the dashboard
 */

export class DashboardChatbotService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get chatbot settings for dashboard editing
   * Returns ALL fields needed for dashboard UI (authenticated endpoint)
   */
  async getChatbotSettings(chatbotId) {
    try {
      const result = await this.pool.query(`
        SELECT 
          chatbot_id,
          theme_color,
          ai_message_color,
          ai_message_text_color,
          border_radius_multiplier,
          header_logo_url,
          message_icon_url,
          header_title,
          header_subtitle,
          chat_window_title,
          first_message,
          font_family,
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
          image_enabled,
          camera_button_enabled,
          button_bottom,
          button_right,
          checkout_page_patterns,
          price_extraction_locale,
          currency,
          iframe_url
        FROM chatbot_settings 
        WHERE chatbot_id = $1
      `, [chatbotId]);

      if (result.rows.length === 0) {
        return { statusCode: 404, payload: { error: 'Chatbot not found' } };
      }

      const settings = result.rows[0];

      // Transform to frontend-friendly format (camelCase)
      const response = {
        chatbotID: settings.chatbot_id,
        themeColor: settings.theme_color || '#c6a459',
        aiMessageColor: settings.ai_message_color || '#e9ecef',
        aiMessageTextColor: settings.ai_message_text_color || '#000000',
        borderRadiusMultiplier: settings.border_radius_multiplier || 1.0,
        headerLogoG: settings.header_logo_url || '',
        messageIcon: settings.message_icon_url || '',
        headerTitle: settings.header_title || '',
        headerSubtitle: settings.header_subtitle || '',
        siteTitle: settings.chat_window_title || '',
        initialMessage: settings.first_message || '',
        fontFamily: settings.font_family || '',
        privacyLink: settings.privacy_link || '',
        subtitleLinkText: settings.subtitle_link_text || '',
        subtitleLinkUrl: settings.subtitle_link_url || '',
        leadMail: settings.lead_email || '',
        leadField1: settings.lead_field1_label || 'Navn',
        leadField2: settings.lead_field2_label || 'Email',
        useThumbsRating: settings.use_thumbs_rating || false,
        ratingTimerDuration: settings.rating_timer_duration || 18000,
        replaceExclamationWithPeriod: settings.replace_exclamation_with_period || false,
        purchaseTrackingEnabled: settings.purchase_tracking_enabled || false,
        enableLivechat: settings.enable_livechat || false,
        enableMinimizeButton: settings.enable_minimize_button || false,
        enablePopupMessage: settings.enable_popup_message || false,
        showPoweredBy: settings.show_powered_by !== false, // Default true
        inputPlaceholder: settings.input_placeholder || 'Skriv dit spørgsmål her...',
        ratingMessage: settings.rating_message || 'Fik du besvaret dit spørgsmål?',
        productButtonText: settings.product_button_text || 'SE PRODUKT',
        productButtonColor: settings.product_button_color || '',
        productButtonPadding: settings.product_button_padding || '',
        productImageHeightMultiplier: settings.product_image_height_multiplier || 1.0,
        productBoxHeightMultiplier: settings.product_box_height_multiplier || 1.0,
        freshdeskEmailLabel: settings.freshdesk_email_label || 'Din email:',
        freshdeskMessageLabel: settings.freshdesk_message_label || 'Besked til kundeservice:',
        freshdeskImageLabel: settings.freshdesk_image_label || 'Upload billede (valgfrit):',
        freshdeskChooseFileText: settings.freshdesk_choose_file_text || 'Vælg fil',
        freshdeskNoFileText: settings.freshdesk_no_file_text || 'Ingen fil valgt',
        freshdeskSendingText: settings.freshdesk_sending_text || 'Sender...',
        freshdeskSubmitText: settings.freshdesk_submit_text || 'Send henvendelse',
        freshdeskSubjectText: settings.freshdesk_subject_text || 'Din henvendelse',
        freshdeskNameLabel: settings.freshdesk_name_label || 'Dit navn:',
        freshdeskEmailRequiredError: settings.freshdesk_email_required_error || 'Email er påkrævet',
        freshdeskEmailInvalidError: settings.freshdesk_email_invalid_error || 'Indtast venligst en gyldig email adresse',
        freshdeskFormErrorText: settings.freshdesk_form_error_text || 'Ret venligst fejlene i formularen',
        freshdeskMessageRequiredError: settings.freshdesk_message_required_error || 'Besked er påkrævet',
        freshdeskNameRequiredError: settings.freshdesk_name_required_error || 'Navn er påkrævet',
        freshdeskSubmitErrorText: settings.freshdesk_submit_error_text || 'Der opstod en fejl',
        contactConfirmationText: settings.contact_confirmation_text || 'Tak for din henvendelse',
        freshdeskConfirmationText: settings.freshdesk_confirmation_text || 'Tak for din henvendelse',
        humanAgentQuestionText: settings.human_agent_question_text || 'Vil du gerne tale med en medarbejder?',
        humanAgentYesButtonText: settings.human_agent_yes_button_text || 'Ja tak',
        humanAgentNoButtonText: settings.human_agent_no_button_text || 'Nej tak',
        freshdeskGroupId: settings.freshdesk_group_id || null,
        freshdeskProductId: settings.freshdesk_product_id || null,
        toHumanMail: settings.to_human_mail || false,
        imageEnabled: settings.image_enabled || false,
        cameraButtonEnabled: settings.camera_button_enabled || false,
        buttonBottom: settings.button_bottom || '20px',
        buttonRight: settings.button_right || '20px',
        checkoutPagePatterns: settings.checkout_page_patterns || [],
        priceExtractionLocale: settings.price_extraction_locale || 'en',
        currency: settings.currency || 'DKK',
        iframeUrl: settings.iframe_url || 'https://skalerbartprodukt.onrender.com'
      };

      return { statusCode: 200, payload: response };
    } catch (error) {
      console.error('Error fetching chatbot settings:', error);
      return { statusCode: 500, payload: { error: 'Database error', details: error.message } };
    }
  }

  /**
   * Update chatbot settings from dashboard
   * Updates all editable fields
   */
  async updateChatbotSettings(chatbotId, settings) {
    try {
      // Transform from camelCase to snake_case for database
      const result = await this.pool.query(`
        UPDATE chatbot_settings 
        SET 
          theme_color = COALESCE($2, theme_color),
          ai_message_color = COALESCE($3, ai_message_color),
          ai_message_text_color = COALESCE($4, ai_message_text_color),
          border_radius_multiplier = COALESCE($5, border_radius_multiplier),
          header_logo_url = COALESCE($6, header_logo_url),
          message_icon_url = COALESCE($7, message_icon_url),
          header_title = COALESCE($8, header_title),
          header_subtitle = COALESCE($9, header_subtitle),
          chat_window_title = COALESCE($10, chat_window_title),
          first_message = COALESCE($11, first_message),
          font_family = COALESCE($12, font_family),
          privacy_link = COALESCE($13, privacy_link),
          subtitle_link_text = COALESCE($14, subtitle_link_text),
          subtitle_link_url = COALESCE($15, subtitle_link_url),
          lead_email = COALESCE($16, lead_email),
          lead_field1_label = COALESCE($17, lead_field1_label),
          lead_field2_label = COALESCE($18, lead_field2_label),
          use_thumbs_rating = COALESCE($19, use_thumbs_rating),
          rating_timer_duration = COALESCE($20, rating_timer_duration),
          replace_exclamation_with_period = COALESCE($21, replace_exclamation_with_period),
          enable_livechat = COALESCE($22, enable_livechat),
          purchase_tracking_enabled = COALESCE($23, purchase_tracking_enabled),
          show_powered_by = COALESCE($24, show_powered_by),
          input_placeholder = COALESCE($25, input_placeholder),
          rating_message = COALESCE($26, rating_message),
          product_button_text = COALESCE($27, product_button_text),
          product_button_color = COALESCE($28, product_button_color),
          product_button_padding = COALESCE($29, product_button_padding),
          product_image_height_multiplier = COALESCE($30, product_image_height_multiplier),
          product_box_height_multiplier = COALESCE($31, product_box_height_multiplier),
          image_enabled = COALESCE($32, image_enabled),
          camera_button_enabled = COALESCE($33, camera_button_enabled),
          updated_at = CURRENT_TIMESTAMP
        WHERE chatbot_id = $1
        RETURNING chatbot_id
      `, [
        chatbotId,
        settings.themeColor,
        settings.aiMessageColor,
        settings.aiMessageTextColor,
        settings.borderRadiusMultiplier,
        settings.headerLogoG,
        settings.messageIcon,
        settings.headerTitle,
        settings.headerSubtitle,
        settings.siteTitle,
        settings.initialMessage,
        settings.fontFamily,
        settings.privacyLink,
        settings.subtitleLinkText,
        settings.subtitleLinkUrl,
        settings.leadMail,
        settings.leadField1,
        settings.leadField2,
        settings.useThumbsRating,
        settings.ratingTimerDuration,
        settings.replaceExclamationWithPeriod,
        settings.enableLivechat,
        settings.purchaseTrackingEnabled,
        settings.showPoweredBy,
        settings.inputPlaceholder,
        settings.ratingMessage,
        settings.productButtonText,
        settings.productButtonColor,
        settings.productButtonPadding,
        settings.productImageHeightMultiplier,
        settings.productBoxHeightMultiplier,
        settings.imageEnabled,
        settings.cameraButtonEnabled
      ]);

      if (result.rows.length === 0) {
        return { statusCode: 404, payload: { error: 'Chatbot not found' } };
      }

      console.log(`✅ Updated chatbot settings for: ${chatbotId}`);
      return { statusCode: 200, payload: { message: 'Settings updated successfully', chatbot_id: chatbotId } };
    } catch (error) {
      console.error('Error updating chatbot settings:', error);
      return { statusCode: 500, payload: { error: 'Database error', details: error.message } };
    }
  }

  /**
   * Get list of chatbots accessible to a user
   * Based on user's chatbot_ids array
   */
  async getUserChatbots(userId) {
    try {
      // First get the user's chatbot IDs
      const userResult = await this.pool.query(`
        SELECT chatbot_ids 
        FROM users 
        WHERE id = $1
      `, [userId]);

      if (userResult.rows.length === 0) {
        return { statusCode: 404, payload: { error: 'User not found' } };
      }

      const chatbotIds = userResult.rows[0].chatbot_ids || [];
      
      if (chatbotIds.length === 0) {
        return { statusCode: 200, payload: { chatbots: [] } };
      }

      // Get basic info for all the user's chatbots
      const chatbotsResult = await this.pool.query(`
        SELECT 
          chatbot_id,
          chat_window_title,
          header_title,
          theme_color
        FROM chatbot_settings 
        WHERE chatbot_id = ANY($1)
        ORDER BY chatbot_id
      `, [chatbotIds]);

      const chatbots = chatbotsResult.rows.map(row => ({
        chatbotId: row.chatbot_id,
        displayName: row.chat_window_title || row.header_title || row.chatbot_id,
        themeColor: row.theme_color
      }));

      return { statusCode: 200, payload: { chatbots } };
    } catch (error) {
      console.error('Error fetching user chatbots:', error);
      return { statusCode: 500, payload: { error: 'Database error', details: error.message } };
    }
  }
}

