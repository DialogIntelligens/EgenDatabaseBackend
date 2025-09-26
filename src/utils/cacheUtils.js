/**
 * Cache utilities for backend optimizations
 * Implements in-memory caching for frequently accessed data
 */

class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map(); // Time to live for cache entries
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL
  }

  /**
   * Set cache entry with optional TTL
   */
  set(key, value, ttlMs = this.defaultTTL) {
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + ttlMs);
    
    // Schedule cleanup
    setTimeout(() => {
      this.delete(key);
    }, ttlMs);
  }

  /**
   * Get cache entry if not expired
   */
  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    const expiresAt = this.ttl.get(key);
    if (Date.now() > expiresAt) {
      this.delete(key);
      return null;
    }

    return this.cache.get(key);
  }

  /**
   * Delete cache entry
   */
  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.ttl.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    const expired = Array.from(this.ttl.entries()).filter(([, expiry]) => now > expiry).length;
    
    return {
      total: this.cache.size,
      expired,
      active: this.cache.size - expired
    };
  }
}

// Global cache instances
export const configurationCache = new CacheManager();
export const promptCache = new CacheManager();
export const templateCache = new CacheManager();

/**
 * Cache key generators
 */
export function getCacheKey(type, ...params) {
  return `${type}:${params.join(':')}`;
}

/**
 * Cached configuration loader
 */
export async function getCachedConfiguration(chatbotId, loader) {
  const cacheKey = getCacheKey('config', chatbotId);
  let config = configurationCache.get(cacheKey);
  
  if (!config) {
    config = await loader(chatbotId);
    configurationCache.set(cacheKey, config, 2 * 60 * 1000); // 2 minutes TTL
  }
  
  return config;
}

/**
 * Cached prompt loader
 */
export async function getCachedPrompt(chatbotId, flowKey, loader) {
  const cacheKey = getCacheKey('prompt', chatbotId, flowKey);
  let prompt = promptCache.get(cacheKey);
  
  if (!prompt) {
    prompt = await loader(chatbotId, flowKey);
    promptCache.set(cacheKey, prompt, 10 * 60 * 1000); // 10 minutes TTL
  }
  
  return prompt;
}

/**
 * Cache cleanup utility
 */
export function cleanupExpiredCache() {
  const stats = {
    config: configurationCache.getStats(),
    prompt: promptCache.getStats(),
    template: templateCache.getStats()
  };
  
  console.log('🧹 Cache cleanup stats:', stats);
  
  // Force cleanup of expired entries
  [configurationCache, promptCache, templateCache].forEach(cache => {
    const now = Date.now();
    for (const [key, expiry] of cache.ttl.entries()) {
      if (now > expiry) {
        cache.delete(key);
      }
    }
  });
}

/**
 * Clear all caches (for testing/debugging)
 */
export function clearAllCaches() {
  configurationCache.clear();
  promptCache.clear();
  templateCache.clear();
  console.log('🧹 All caches cleared');
}
