/**
 * Mixpanel Rate Limiter
 * Manages rate limiting for Mixpanel MCP API calls according to:
 * - 60 queries per hour
 * - 3 queries per second
 * - Maximum 100 concurrent queries
 * - Handles 429 errors with retry logic
 */

import { MIXPANEL_RATE_LIMITS } from '../utils/constants.js';

/**
 * Mixpanel Rate Limiter Class
 * Tracks queries and enforces Mixpanel API rate limits
 */
export class MixpanelRateLimiter {
  constructor() {
    // Track queries in the last hour (sliding window)
    this.hourlyQueries = [];
    
    // Track queries in the last second (sliding window)
    this.secondlyQueries = [];
    
    // Track currently active/pending queries
    this.concurrentQueries = 0;
    
    // Track consecutive 429 errors
    this.consecutive429Errors = 0;
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up old queries outside the time windows
   */
  cleanupQueryWindows() {
    const now = Date.now();
    const oneHourAgo = now - MIXPANEL_RATE_LIMITS.HOUR_WINDOW_MS;
    const oneSecondAgo = now - MIXPANEL_RATE_LIMITS.SECOND_WINDOW_MS;

    // Remove queries older than 1 hour
    this.hourlyQueries = this.hourlyQueries.filter(time => time > oneHourAgo);
    
    // Remove queries older than 1 second
    this.secondlyQueries = this.secondlyQueries.filter(time => time > oneSecondAgo);
  }

  /**
   * Check if we're approaching or at rate limits
   * @returns {object} Status object with limit information
   */
  checkLimits() {
    this.cleanupQueryWindows();

    const hourlyCount = this.hourlyQueries.length;
    const secondlyCount = this.secondlyQueries.length;

    return {
      hourlyCount,
      hourlyLimit: MIXPANEL_RATE_LIMITS.QUERIES_PER_HOUR,
      secondlyCount,
      secondlyLimit: MIXPANEL_RATE_LIMITS.QUERIES_PER_SECOND,
      concurrentCount: this.concurrentQueries,
      concurrentLimit: MIXPANEL_RATE_LIMITS.MAX_CONCURRENT_QUERIES,
      canMakeQuery: 
        hourlyCount < MIXPANEL_RATE_LIMITS.QUERIES_PER_HOUR &&
        secondlyCount < MIXPANEL_RATE_LIMITS.QUERIES_PER_SECOND &&
        this.concurrentQueries < MIXPANEL_RATE_LIMITS.MAX_CONCURRENT_QUERIES
    };
  }

  /**
   * Wait until we can make a query without exceeding rate limits
   * @returns {Promise<void>}
   */
  async waitForRateLimit() {
    while (true) {
      const limits = this.checkLimits();
      
      if (limits.canMakeQuery) {
        break; // We can make the query now
      }

      // Calculate wait time based on which limit we're hitting
      let waitTime = MIXPANEL_RATE_LIMITS.MIN_DELAY_BETWEEN_QUERIES;

      if (limits.secondlyCount >= MIXPANEL_RATE_LIMITS.QUERIES_PER_SECOND) {
        // Wait for the oldest query in the second window to expire
        if (this.secondlyQueries.length > 0) {
          const oldestQuery = Math.min(...this.secondlyQueries);
          const timeUntilOldestExpires = MIXPANEL_RATE_LIMITS.SECOND_WINDOW_MS - (Date.now() - oldestQuery);
          waitTime = Math.max(waitTime, timeUntilOldestExpires + 10); // Add 10ms buffer
        }
      }

      if (limits.hourlyCount >= MIXPANEL_RATE_LIMITS.QUERIES_PER_HOUR) {
        // Wait for the oldest query in the hour window to expire
        if (this.hourlyQueries.length > 0) {
          const oldestQuery = Math.min(...this.hourlyQueries);
          const timeUntilOldestExpires = MIXPANEL_RATE_LIMITS.HOUR_WINDOW_MS - (Date.now() - oldestQuery);
          waitTime = Math.max(waitTime, timeUntilOldestExpires + 100); // Add 100ms buffer
          
          console.log(
            `[Mixpanel Rate Limit] Hourly limit reached (${limits.hourlyCount}/${MIXPANEL_RATE_LIMITS.QUERIES_PER_HOUR}). ` +
            `Waiting ${Math.ceil(timeUntilOldestExpires / 1000)}s until oldest query expires...`
          );
        }
      }

      if (limits.concurrentCount >= MIXPANEL_RATE_LIMITS.MAX_CONCURRENT_QUERIES) {
        // If we hit concurrent limit, wait a bit and check again
        waitTime = Math.max(waitTime, 100);
        console.log(
          `[Mixpanel Rate Limit] Concurrent limit reached (${limits.concurrentCount}/${MIXPANEL_RATE_LIMITS.MAX_CONCURRENT_QUERIES}). ` +
          `Waiting ${waitTime}ms before retry...`
        );
      }

      if (limits.secondlyCount >= MIXPANEL_RATE_LIMITS.QUERIES_PER_SECOND) {
        console.log(
          `[Mixpanel Rate Limit] Second limit reached (${limits.secondlyCount}/${MIXPANEL_RATE_LIMITS.QUERIES_PER_SECOND}). ` +
          `Waiting ${Math.ceil(waitTime)}ms...`
        );
      }

      await this.sleep(Math.min(waitTime, 1000)); // Cap wait at 1 second per iteration
    }
  }

  /**
   * Record that a query is starting
   * @returns {object} Query tracking object with timestamps for cleanup if needed
   */
  startQuery() {
    const now = Date.now();
    this.hourlyQueries.push(now);
    this.secondlyQueries.push(now);
    this.concurrentQueries++;
    return { timestamp: now };
  }

  /**
   * Record that a query has completed
   */
  endQuery() {
    this.concurrentQueries = Math.max(0, this.concurrentQueries - 1);
  }

  /**
   * Remove a query from the tracking windows (used when a 429 error occurs)
   * @param {number} timestamp - The timestamp of the query to remove
   */
  removeQuery(timestamp) {
    // Remove the specific timestamp from both windows
    const hourlyIndex = this.hourlyQueries.indexOf(timestamp);
    if (hourlyIndex !== -1) {
      this.hourlyQueries.splice(hourlyIndex, 1);
    }
    
    const secondlyIndex = this.secondlyQueries.indexOf(timestamp);
    if (secondlyIndex !== -1) {
      this.secondlyQueries.splice(secondlyIndex, 1);
    }
  }

  /**
   * Reset consecutive 429 error counter
   */
  resetConsecutive429Errors() {
    this.consecutive429Errors = 0;
  }

  /**
   * Increment consecutive 429 error counter
   */
  incrementConsecutive429Errors() {
    this.consecutive429Errors++;
  }

  /**
   * Handle 429 rate limit error with exponential backoff
   * @param {number} attempt - Current retry attempt number (0-indexed)
   * @returns {Promise<void>}
   */
  async handle429Error(attempt) {
    this.incrementConsecutive429Errors();
    
    // Exponential backoff: start with 5 seconds, double each attempt (max 60 seconds)
    const backoffTime = Math.min(
      MIXPANEL_RATE_LIMITS.RETRY_INITIAL_BACKOFF * Math.pow(2, attempt),
      MIXPANEL_RATE_LIMITS.RETRY_MAX_BACKOFF
    );

    console.log(
      `[Mixpanel Rate Limit] Received 429 error (${this.consecutive429Errors} consecutive). ` +
      `Waiting ${Math.ceil(backoffTime / 1000)}s before retry (attempt ${attempt + 1}/${MIXPANEL_RATE_LIMITS.RETRY_MAX_ATTEMPTS})...`
    );

    // Also clear old queries to make room
    this.cleanupQueryWindows();

    await this.sleep(backoffTime);
  }

  /**
   * Check if an error is a 429 rate limit error
   * @param {Error} error - The error to check
   * @returns {boolean} True if it's a 429 error
   */
  is429Error(error) {
    if (!error) return false;
    
    const errorMessage = error.message || '';
    const errorString = String(error);
    
    // Check for 429 status code or rate limit indicators
    return (
      errorMessage.includes('429') ||
      errorString.includes('429') ||
      errorMessage.toLowerCase().includes('rate limit') ||
      errorMessage.toLowerCase().includes('too many requests') ||
      (error.status === 429) ||
      (error.code === 429)
    );
  }

  /**
   * Wrap a function call with rate limiting
   * @param {Function} fn - The function to call (should return a Promise)
   * @param {string} toolName - Name of the tool being called (for logging)
   * @returns {Promise<any>} The result of the function call
   */
  async withRateLimit(fn, toolName = 'unknown') {
    const limits = this.checkLimits();
    
    // Log current status if we're close to limits
    if (limits.hourlyCount >= MIXPANEL_RATE_LIMITS.QUERIES_PER_HOUR * 0.8) {
      console.log(
        `[Mixpanel Rate Limit] Warning: ${limits.hourlyCount}/${MIXPANEL_RATE_LIMITS.QUERIES_PER_HOUR} queries used this hour (${Math.round(limits.hourlyCount / MIXPANEL_RATE_LIMITS.QUERIES_PER_HOUR * 100)}%)`
      );
    }

    // Wait until we can make the query
    await this.waitForRateLimit();

    // Record that we're starting a query (returns tracking info)
    const queryTracker = this.startQuery();

    try {
      // Execute the query
      const result = await fn();
      
      // Success - reset consecutive error counter
      this.resetConsecutive429Errors();
      
      return result;
    } catch (error) {
      // Check if it's a 429 error
      if (this.is429Error(error)) {
        // Remove this query from tracking since it failed due to rate limiting
        // We don't want to count failed queries against our limits
        this.removeQuery(queryTracker.timestamp);
        queryRemoved = true;
        
        throw error; // Re-throw to let caller handle retry logic
      }
      
      // For other errors, still reset the consecutive counter
      // (since it's not a rate limit issue)
      this.resetConsecutive429Errors();
      
      throw error;
    } finally {
      // Always decrement concurrent queries when done
      // (unless we already removed it due to 429, but we still need to decrement concurrent)
      this.endQuery();
    }
  }
}