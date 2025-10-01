/**
 * Streaming Utilities
 * Helper functions for SSE streaming and performance tracking
 */

/**
 * SSE Event Types
 */
export const SSE_EVENTS = {
  START: 'start',
  TOKEN: 'token', 
  END: 'end',
  ERROR: 'error',
  CONTEXT: 'context',
  MARKER: 'marker'
};

/**
 * Marker Types
 */
export const MARKERS = {
  CONTACT_FORM: '%%',
  FRESHDESK: '$$',
  HUMAN_AGENT: '&&',
  IMAGE_UPLOAD: '§'
};

/**
 * Create SSE event data
 */
export function createSSEEvent(eventType, data = {}) {
  return {
    event: eventType,
    data: data,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format SSE response for client
 */
export function formatSSEResponse(eventType, data) {
  return `data: ${JSON.stringify(createSSEEvent(eventType, data))}\n\n`;
}

/**
 * Performance tracker for backend streaming
 */
export class StreamingPerformanceTracker {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.startTime = performance.now();
    this.phases = [];
    this.tokenCount = 0;
    this.firstTokenTime = null;
    this.lastTokenTime = null;
  }

  startPhase(name, metadata = {}) {
    const phase = {
      name,
      metadata,
      startTime: performance.now(),
      endTime: null,
      duration: null
    };
    this.phases.push(phase);
    return phase;
  }

  endPhase(name, additionalMetadata = {}) {
    const phase = this.phases.find(p => p.name === name && p.endTime === null);
    if (phase) {
      phase.endTime = performance.now();
      phase.duration = phase.endTime - phase.startTime;
      phase.metadata = { ...phase.metadata, ...additionalMetadata };
    }
  }

  recordToken() {
    this.tokenCount++;
    const now = performance.now();
    
    if (this.firstTokenTime === null) {
      this.firstTokenTime = now;
    }
    this.lastTokenTime = now;
  }

  getSummary() {
    const totalTime = performance.now() - this.startTime;
    const timeToFirstToken = this.firstTokenTime ? this.firstTokenTime - this.startTime : null;
    const streamingDuration = this.lastTokenTime && this.firstTokenTime ? 
      this.lastTokenTime - this.firstTokenTime : null;
    const tokensPerSecond = streamingDuration && this.tokenCount > 0 ? 
      (this.tokenCount / (streamingDuration / 1000)) : null;

    return {
      sessionId: this.sessionId,
      totalTime: Math.round(totalTime),
      timeToFirstToken: timeToFirstToken ? Math.round(timeToFirstToken) : null,
      tokenCount: this.tokenCount,
      tokensPerSecond: tokensPerSecond ? tokensPerSecond.toFixed(1) : null,
      phases: this.phases.map(p => ({
        name: p.name,
        duration: p.duration ? Math.round(p.duration) : null,
        metadata: p.metadata
      }))
    };
  }

  log() {
    const summary = this.getSummary();
    console.log(`⏱️ Backend Streaming Performance [${this.sessionId}]:`, summary);
    return summary;
  }
}

/**
 * Chunk processor for handling different content types
 */
export class ChunkProcessor {
  constructor() {
    this.reset();
  }

  reset() {
    this.lastChunk = "";
    this.lastFreshChunk = "";
    this.lastHumanAgentChunk = "";
    this.lastImageChunk = "";
    this.isBuffering = false;
    this.bufferedContent = "";
    this.currentText = "";
    this.currentTextWithMarkers = "";
  }

  /**
   * Process a token and detect markers
   */
  processToken(token, markers = MARKERS) {
    let displayToken = token;
    let tokenWithMarkers = token;
    const detectedMarkers = {};

    // Contact form marker (%%)
    const combinedContact = this.lastChunk + token;
    if (combinedContact.includes(markers.CONTACT_FORM)) {
      detectedMarkers.contactForm = true;
      displayToken = combinedContact.replace(markers.CONTACT_FORM, "");
    }
    this.lastChunk = displayToken.slice(-2);

    // Freshdesk marker ($$)
    if (markers.FRESHDESK) {
      const combinedFresh = this.lastFreshChunk + token;
      if (combinedFresh.includes(markers.FRESHDESK)) {
        detectedMarkers.freshdesk = true;
        tokenWithMarkers = combinedFresh.slice(this.lastFreshChunk.length);
        displayToken = combinedFresh.replaceAll(markers.FRESHDESK, "").slice(this.lastFreshChunk.length);
        this.lastFreshChunk = displayToken.length >= markers.FRESHDESK.length ? 
          displayToken.slice(-markers.FRESHDESK.length) : displayToken;
      } else {
        this.lastFreshChunk = token.length >= markers.FRESHDESK.length ? 
          token.slice(-markers.FRESHDESK.length) : token;
      }
    }

    // Human agent marker (&&)
    if (markers.HUMAN_AGENT) {
      const combinedHuman = this.lastHumanAgentChunk + token;
      if (combinedHuman.includes(markers.HUMAN_AGENT)) {
        detectedMarkers.humanAgent = true;
        tokenWithMarkers = combinedHuman.slice(this.lastHumanAgentChunk.length);
        displayToken = combinedHuman.replaceAll(markers.HUMAN_AGENT, "").slice(this.lastHumanAgentChunk.length);
        this.lastHumanAgentChunk = displayToken.length >= markers.HUMAN_AGENT.length ? 
          displayToken.slice(-markers.HUMAN_AGENT.length) : displayToken;
      } else {
        this.lastHumanAgentChunk = token.length >= markers.HUMAN_AGENT.length ? 
          token.slice(-markers.HUMAN_AGENT.length) : token;
      }
    }

    // Image marker (§)
    if (markers.IMAGE_UPLOAD) {
      const combinedImage = this.lastImageChunk + token;
      if (combinedImage.includes(markers.IMAGE_UPLOAD)) {
        detectedMarkers.imageUpload = true;
        tokenWithMarkers = markers.IMAGE_UPLOAD;
        displayToken = combinedImage.replaceAll(markers.IMAGE_UPLOAD, "").slice(this.lastImageChunk.length);
        
        // Fix for image marker - remove already added 'i' part
        if (this.lastImageChunk.length > 0 && this.currentText.endsWith(this.lastImageChunk)) {
          this.currentText = this.currentText.slice(0, -this.lastImageChunk.length);
          this.currentTextWithMarkers = this.currentTextWithMarkers.slice(0, -this.lastImageChunk.length);
        }
        
        this.currentTextWithMarkers += markers.IMAGE_UPLOAD;
        this.lastImageChunk = displayToken.length >= markers.IMAGE_UPLOAD.length ? 
          displayToken.slice(-markers.IMAGE_UPLOAD.length) : displayToken;
      } else {
        this.lastImageChunk = token.length >= markers.IMAGE_UPLOAD.length ? 
          token.slice(-markers.IMAGE_UPLOAD.length) : token;
      }
    }

    return {
      displayToken,
      tokenWithMarkers,
      detectedMarkers,
      lastChunk: this.lastChunk,
      lastFreshChunk: this.lastFreshChunk,
      lastHumanAgentChunk: this.lastHumanAgentChunk,
      lastImageChunk: this.lastImageChunk
    };
  }

  /**
   * Handle product block buffering (XXX...YYY)
   */
  processProductBlock(token) {
    if (!this.isBuffering) {
      if (token.includes("XXX")) {
        this.isBuffering = true;
        this.bufferedContent = token;
        return { shouldEmit: false, content: "" };
      } else {
        this.currentText += token;
        this.currentTextWithMarkers += token;
        return { shouldEmit: true, content: token };
      }
    } else {
      this.bufferedContent += token;
      if (token.includes("YYY")) {
        const content = this.bufferedContent;
        this.currentText += content;
        this.currentTextWithMarkers += content;
        this.bufferedContent = "";
        this.isBuffering = false;
        return { shouldEmit: true, content: content };
      } else {
        return { shouldEmit: false, content: "" };
      }
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      currentText: this.currentText,
      currentTextWithMarkers: this.currentTextWithMarkers,
      isBuffering: this.isBuffering,
      bufferedContent: this.bufferedContent
    };
  }
}

/**
 * Retry logic for API calls
 */
export class RetryHandler {
  constructor(maxRetries = 2, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async executeWithRetry(asyncFn, context = {}) {
    let lastError = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await asyncFn();
      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attempt + 1}/${this.maxRetries + 1} failed:`, error.message);
        
        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt === this.maxRetries) {
          break;
        }
        
        // Wait before retry with exponential backoff
        const delay = this.baseDelay * Math.pow(2, attempt);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  isRetryableError(error) {
    const retryablePatterns = [
      'network',
      'timeout',
      'fetch',
      'ECONNRESET',
      'ETIMEDOUT',
      '5' // 5xx status codes
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }
}

/**
 * Session management utilities
 */
export function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateStreamingSessionId() {
  return `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate streaming session data
 */
export function validateStreamingSession(sessionData) {
  const required = ['user_id', 'chatbot_id', 'message_text'];
  const missing = required.filter(field => !sessionData[field]);
  
  if (missing.length > 0) {
    return {
      isValid: false,
      errors: [`Missing required fields: ${missing.join(', ')}`]
    };
  }

  return { isValid: true, errors: [] };
}
