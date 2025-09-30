import { buildPrompt } from '../../promptTemplateV2Routes.js';

/**
 * Image Processing Service
 * Handles image uploads, processing, and description generation
 * Migrated from frontend with enhanced features
 */
export class ImageProcessingService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Process image upload and generate description
   * Migrated from frontend processImage logic with enhancements
   */
  async processImage(imageData, messageText, configuration, maxRetries = 2) {
    try {
      console.log('📷 Backend: Starting image processing');
      
      const { imageAPI, imageEnabled, image_enabled, imagePromptEnabled, chatbot_id } = configuration;

      if (!imageAPI && !imageEnabled && !image_enabled) {
        console.log('📷 Backend: Image processing not enabled - config:', { imageAPI, imageEnabled, image_enabled });
        return '';
      }

      // Validate image data
      const validation = this.validateImageData(imageData);
      if (!validation.isValid) {
        throw new Error(`Invalid image data: ${validation.errors.join(', ')}`);
      }

      // Process with retry logic (migrated from frontend)
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`📷 Backend: Image processing attempt ${attempt}/${maxRetries}`);
          
          const result = await this.processImageWithAPI(imageData, messageText, configuration);
          
          if (result && result.length > 0) {
            console.log(`✅ Image processing succeeded on attempt ${attempt}`);
            return result;
          }
          
        } catch (error) {
          console.error(`❌ Image processing attempt ${attempt} failed:`, error.message);
          
          if (attempt === maxRetries) {
            throw error;
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      return "Error processing image after multiple attempts";

    } catch (error) {
      console.error('📷 Backend: Error in image processing:', error);
      return "Error processing image";
    }
  }

  /**
   * Process image with API call
   * Migrated from frontend image processing logic
   */
  async processImageWithAPI(imageData, messageText, configuration) {
    const { imageAPI, imageEnabled, image_enabled, imagePromptEnabled, chatbot_id } = configuration;
    console.log('📷 Backend: processImageWithAPI called with config:', { imageAPI, imageEnabled, image_enabled, imagePromptEnabled, chatbot_id });
    
    let apiUrl = imageAPI;
    let requestBody = {
      question: messageText,
      uploads: [{
        type: "file",
        name: imageData.name,
        data: imageData.data,
        mime: imageData.mime,
      }]
    };

    // Use template system if no specific imageAPI (migrated from frontend)
    if (!imageAPI && imageEnabled && imagePromptEnabled) {
      apiUrl = "https://den-utrolige-snebold.onrender.com/api/v1/prediction/eed6c6d2-16ee-40ae-be9f-3cc39f91dc2c";
      
      try {
        // Get image prompt template
        const imagePrompt = await buildPrompt(this.pool, chatbot_id, 'image');
        requestBody.overrideConfig = {
          vars: { masterPrompt: imagePrompt }
        };
        console.log('📷 Backend: Applied image prompt template');
      } catch (promptError) {
        console.warn('📷 Backend: Failed to load image prompt, using default:', promptError.message);
      }
    }

    console.log('📷 Backend: Making image API request to:', apiUrl);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Image API request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const description = result.text || "No description available";
    
    console.log('📷 Backend: Image description generated, length:', description.length);
    return description;
  }

  /**
   * Validate image data
   */
  validateImageData(imageData) {
    const errors = [];
    
    if (!imageData) {
      errors.push('Image data is required');
      return { isValid: false, errors };
    }

    if (!imageData.data) {
      errors.push('Image data content is required');
    }

    if (!imageData.name) {
      errors.push('Image filename is required');
    }

    if (!imageData.mime) {
      errors.push('Image MIME type is required');
    } else {
      // Check if it's a valid image MIME type
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!validImageTypes.includes(imageData.mime.toLowerCase())) {
        errors.push(`Invalid image type: ${imageData.mime}. Supported types: ${validImageTypes.join(', ')}`);
      }
    }

    // Check file size if available
    if (imageData.size && imageData.size > 10 * 1024 * 1024) { // 10MB limit
      errors.push('Image file too large (max 10MB)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Factory function to create service instance
 */
export function createImageProcessingService(pool) {
  return new ImageProcessingService(pool);
}
