/**
 * Client-side rate limiting utilities
 * Note: This provides basic client-side protection. For production,
 * implement server-side rate limiting in edge functions.
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RequestLog {
  timestamp: number;
  count: number;
}

const requestLogs = new Map<string, RequestLog[]>();

/**
 * Check if a request should be rate limited
 */
export function isRateLimited(
  key: string,
  config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }
): boolean {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  // Get existing logs for this key
  let logs = requestLogs.get(key) || [];
  
  // Remove old logs outside the window
  logs = logs.filter(log => log.timestamp > windowStart);
  
  // Count requests in current window
  const requestCount = logs.reduce((sum, log) => sum + log.count, 0);
  
  if (requestCount >= config.maxRequests) {
    return true;
  }
  
  // Add current request
  logs.push({ timestamp: now, count: 1 });
  requestLogs.set(key, logs);
  
  return false;
}

/**
 * Rate limit for API calls (10 requests per minute)
 */
export function apiRateLimit(endpoint: string): boolean {
  return isRateLimited(`api:${endpoint}`, {
    maxRequests: 10,
    windowMs: 60000,
  });
}

/**
 * Rate limit for search queries (30 per minute)
 */
export function searchRateLimit(userId: string): boolean {
  return isRateLimited(`search:${userId}`, {
    maxRequests: 30,
    windowMs: 60000,
  });
}

/**
 * Rate limit for authentication attempts (5 per 15 minutes)
 */
export function authRateLimit(identifier: string): boolean {
  return isRateLimited(`auth:${identifier}`, {
    maxRequests: 5,
    windowMs: 900000, // 15 minutes
  });
}

/**
 * Rate limit for form submissions (3 per minute)
 */
export function formRateLimit(formId: string, userId: string): boolean {
  return isRateLimited(`form:${formId}:${userId}`, {
    maxRequests: 3,
    windowMs: 60000,
  });
}

/**
 * Clear rate limit for a specific key
 */
export function clearRateLimit(key: string): void {
  requestLogs.delete(key);
}

/**
 * Clear all rate limits (useful for testing)
 */
export function clearAllRateLimits(): void {
  requestLogs.clear();
}

/**
 * Get remaining requests for a key
 */
export function getRemainingRequests(
  key: string,
  config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }
): number {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  const logs = requestLogs.get(key) || [];
  const validLogs = logs.filter(log => log.timestamp > windowStart);
  const requestCount = validLogs.reduce((sum, log) => sum + log.count, 0);
  
  return Math.max(0, config.maxRequests - requestCount);
}
