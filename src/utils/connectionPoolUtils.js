/**
 * Connection pooling utilities for external API calls
 * Optimizes performance for frequent API calls to Flowise, Shopify, etc.
 */

import fetch from 'node-fetch';

class ConnectionPool {
  constructor(maxConnections = 10, timeout = 30000) {
    this.maxConnections = maxConnections;
    this.timeout = timeout;
    this.activeConnections = new Map();
    this.requestQueue = [];
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      retries: 0
    };
  }

  /**
   * Make a pooled HTTP request with retry logic
   */
  async request(url, options = {}, retries = 2) {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.stats.totalRequests++;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Wait for available connection slot
        await this.waitForConnection();
        
        // Track active connection
        this.activeConnections.set(requestId, {
          url,
          startTime: Date.now(),
          attempt: attempt + 1
        });

        // Create timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          this.stats.timeouts++;
        }, this.timeout);

        // Make the request
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        this.activeConnections.delete(requestId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        this.stats.successfulRequests++;
        return response;

      } catch (error) {
        this.activeConnections.delete(requestId);
        
        if (attempt < retries && this.isRetryableError(error)) {
          this.stats.retries++;
          console.log(`🔄 Retrying request to ${url} (attempt ${attempt + 2}/${retries + 1})`);
          await this.delay(1000 * Math.pow(2, attempt)); // Exponential backoff
          continue;
        }
        
        this.stats.failedRequests++;
        throw error;
      }
    }
  }

  /**
   * Wait for available connection slot
   */
  async waitForConnection() {
    while (this.activeConnections.size >= this.maxConnections) {
      await this.delay(100);
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'network',
      'timeout',
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT'
    ];
    
    return retryableErrors.some(errorType => 
      error.message.toLowerCase().includes(errorType.toLowerCase())
    );
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get connection pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeConnections: this.activeConnections.size,
      maxConnections: this.maxConnections,
      successRate: this.stats.totalRequests > 0 
        ? ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      retries: 0
    };
  }
}

// Global connection pools for different services
export const aiApiPool = new ConnectionPool(5, 45000); // 5 connections, 45s timeout for AI APIs
export const orderApiPool = new ConnectionPool(3, 15000); // 3 connections, 15s timeout for order APIs
export const generalApiPool = new ConnectionPool(10, 30000); // 10 connections, 30s timeout for general APIs

/**
 * Make a pooled request to AI APIs
 */
export async function makeAiApiRequest(url, options = {}) {
  return aiApiPool.request(url, options, 2);
}

/**
 * Make a pooled request to order tracking APIs
 */
export async function makeOrderApiRequest(url, options = {}) {
  return orderApiPool.request(url, options, 1);
}

/**
 * Make a pooled request to general APIs
 */
export async function makeGeneralApiRequest(url, options = {}) {
  return generalApiPool.request(url, options, 1);
}

/**
 * Get all connection pool statistics
 */
export function getAllPoolStats() {
  return {
    aiApi: aiApiPool.getStats(),
    orderApi: orderApiPool.getStats(),
    general: generalApiPool.getStats()
  };
}

/**
 * Reset all connection pool statistics
 */
export function resetAllPoolStats() {
  aiApiPool.resetStats();
  orderApiPool.resetStats();
  generalApiPool.resetStats();
}
