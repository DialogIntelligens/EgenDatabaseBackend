import express from 'express';

/**
 * Integration Routes
 * Provides API endpoints for fetching chatbot integration configuration
 * Used by universal integration script to load all settings from database
 */
export function registerIntegrationRoutes(app, pool) {
  const router = express.Router();

  /**
   * GET /api/integration-config/:chatbot_id
   * Returns FRONTEND-SAFE configuration for a chatbot
   * ⚠️ PUBLIC ENDPOINT - NO AUTH REQUIRED
   * 🔒 SECURITY: Only select UI fields - NEVER expose API keys or credentials
   * No authentication required - public endpoint for integration scripts
   */
  router.get('/integration-config/:chatbot_id', async (req, res) => {
    try {
      const { chatbot_id } = req.params;

      // 🔒 SECURITY FIX: Explicit field selection instead of SELECT *
      // Only fetch frontend-safe fields - NO credentials or API keys
      const result = await pool.query(`
        SELECT 
          chatbot_id,
          iframe_url,
          first_message,
          image_enabled,
          camera_button_enabled,
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
          currency
        FROM chatbot_settings 
        WHERE chatbot_id = $1
      `, [chatbot_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Chatbot not found',
          chatbot_id 
        });
      }

      const settings = result.rows[0];

      // Transform database column names (snake_case) to frontend format (camelCase)
      const config = {
        // Core identifiers
        chatbotID: settings.chatbot_id,
        iframeUrl: settings.iframe_url || 'https://skalerbartprodukt.onrender.com',
        pagePath: '', // Will be set by integration script

        // First message and image settings
        firstMessage: settings.first_message || '',
        image_enabled: settings.image_enabled || false,
        camera_button_enabled: settings.camera_button_enabled || false,

        // Visual settings
        headerLogoG: settings.header_logo_url || '',
        messageIcon: settings.message_icon_url || '',
        themeColor: settings.theme_color || '#1a1d56',
        aiMessageColor: settings.ai_message_color || '#e5eaf5',
        aiMessageTextColor: settings.ai_message_text_color || '#262641',
        fontFamily: settings.font_family || '',

        // Text content
        headerTitleG: settings.header_title || '',
        headerSubtitleG: settings.header_subtitle || '',
        titleG: settings.chat_window_title || '',
        privacyLink: settings.privacy_link || '',
        subtitleLinkText: settings.subtitle_link_text || '',
        subtitleLinkUrl: settings.subtitle_link_url || '',

        // Lead generation
        leadGen: '%%', // Hardcoded as per current scripts
        leadMail: settings.lead_email || '',
        leadField1: settings.lead_field1_label || 'Navn',
        leadField2: settings.lead_field2_label || 'Email',

        // Feature flags
        useThumbsRating: settings.use_thumbs_rating || false,
        ratingTimerDuration: settings.rating_timer_duration || 18000,
        replaceExclamationWithPeriod: settings.replace_exclamation_with_period || false,
        enableLivechat: settings.enable_livechat || false,
        enableMinimizeButton: settings.enable_minimize_button !== false, // Default true
        enablePopupMessage: settings.enable_popup_message !== false, // Default true
        purchaseTrackingEnabled: settings.purchase_tracking_enabled || false,
        showPoweredBy: settings.show_powered_by !== false, // Default true

        // UI text
        inputPlaceholder: settings.input_placeholder || 'Skriv dit spørgsmål her...',
        ratingMessage: settings.rating_message || 'Fik du besvaret dit spørgsmål?',

        // Product display
        productButtonText: settings.product_button_text || 'SE PRODUKT',
        productButtonColor: settings.product_button_color || '',
        productButtonPadding: settings.product_button_padding || '',
        productImageHeightMultiplier: settings.product_image_height_multiplier || 1,
        productBoxHeightMultiplier: settings.product_box_height_multiplier || 1,

        // Freshdesk form labels
        freshdeskEmailLabel: settings.freshdesk_email_label || 'Din email:',
        freshdeskMessageLabel: settings.freshdesk_message_label || 'Besked til kundeservice:',
        freshdeskImageLabel: settings.freshdesk_image_label || 'Upload billede (valgfrit):',
        freshdeskChooseFileText: settings.freshdesk_choose_file_text || 'Vælg fil',
        freshdeskNoFileText: settings.freshdesk_no_file_text || 'Ingen fil valgt',
        freshdeskSendingText: settings.freshdesk_sending_text || 'Sender...',
        freshdeskSubmitText: settings.freshdesk_submit_text || 'Send henvendelse',
        freshdeskSubjectText: settings.freshdesk_subject_text || 'Din henvendelse',
        freshdeskNameLabel: settings.freshdesk_name_label || 'Dit navn:',

        // Freshdesk validation errors
        freshdeskEmailRequiredError: settings.freshdesk_email_required_error || 'Email er påkrævet',
        freshdeskEmailInvalidError: settings.freshdesk_email_invalid_error || 'Indtast venligst en gyldig email adresse',
        freshdeskFormErrorText: settings.freshdesk_form_error_text || 'Ret venligst fejlene i formularen',
        freshdeskMessageRequiredError: settings.freshdesk_message_required_error || 'Besked er påkrævet',
        freshdeskNameRequiredError: settings.freshdesk_name_required_error || 'Navn er påkrævet',
        freshdeskSubmitErrorText: settings.freshdesk_submit_error_text || 'Der opstod en fejl',

        // Confirmation messages
        contactConfirmationText: settings.contact_confirmation_text || 'Tak for din henvendelse',
        freshdeskConfirmationText: settings.freshdesk_confirmation_text || 'Tak for din henvendelse',

        // Human agent request
        humanAgentQuestionText: settings.human_agent_question_text || 'Vil du gerne tale med en medarbejder?',
        humanAgentYesButtonText: settings.human_agent_yes_button_text || 'Ja tak',
        humanAgentNoButtonText: settings.human_agent_no_button_text || 'Nej tak',

        // Additional settings
        freshdeskGroupId: settings.freshdesk_group_id || null,
        freshdeskProductId: settings.freshdesk_product_id || null,
        toHumanMail: settings.to_human_mail || false,

        // CSS Positioning (popup uses button positioning)
        buttonBottom: settings.button_bottom || '20px',
        buttonRight: settings.button_right || '10px',

        // Purchase tracking configuration
        checkoutPagePatterns: settings.checkout_page_patterns || null,
        priceExtractionLocale: settings.price_extraction_locale || 'en',
        currency: settings.currency || 'DKK',

        // Device detection (set by integration script)
        isTabletView: false,
        isPhoneView: false
      };

      res.json(config);
    } catch (error) {
      console.error('Error fetching integration config:', error);
      res.status(500).json({ 
        error: 'Server error', 
        details: error.message 
      });
    }
  });

  /**
   * GET /api/integration-config-test
   * Test endpoint to verify integration routes are registered
   */
  router.get('/integration-config-test', (req, res) => {
    res.json({ 
      status: 'ok', 
      message: 'Integration routes are working',
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api', router);
  
  console.log('✅ Integration configuration routes registered');
}

