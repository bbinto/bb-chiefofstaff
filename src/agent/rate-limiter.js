/**
 * Rate Limiter
 * Manages API rate limiting and token usage tracking
 */

import { RATE_LIMITING, TOKEN_LIMITS, RETRY_CONFIG } from '../utils/constants.js';

/**
 * Rate Limiter Class
 * Tracks token usage and enforces rate limits
 */
export class RateLimiter {
  constructor() {
    this.lastCallTime = 0;
    this.tokenUsageWindow = []; // Track tokens used in the last minute
    this.consecutiveRateLimitErrors = 0;
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
   * Clean up old token usage entries (older than 1 minute)
   */
  cleanTokenUsageWindow() {
    const now = Date.now();
    const oneMinuteAgo = now - RATE_LIMITING.RATE_LIMIT_WINDOW;
    this.tokenUsageWindow = this.tokenUsageWindow.filter(entry => entry.time > oneMinuteAgo);
  }

  /**
   * Get current token usage in the last minute
   * @returns {number} Total tokens used
   */
  getCurrentTokenUsage() {
    this.cleanTokenUsageWindow();
    return this.tokenUsageWindow.reduce((sum, entry) => sum + entry.tokens, 0);
  }

  /**
   * Track token usage
   * @param {number} tokens - Number of tokens to track
   */
  trackTokenUsage(tokens) {
    this.tokenUsageWindow.push({
      time: Date.now(),
      tokens: tokens
    });
  }

  /**
   * Reset consecutive rate limit error counter
   */
  resetConsecutiveErrors() {
    this.consecutiveRateLimitErrors = 0;
  }

  /**
   * Increment consecutive rate limit error counter
   */
  incrementConsecutiveErrors() {
    this.consecutiveRateLimitErrors++;
  }

  /**
   * Reset token usage window (used after multiple consecutive rate limit errors)
   */
  resetTokenUsageWindow() {
    this.tokenUsageWindow = [];
    this.lastCallTime = 0;
  }

  /**
   * Wait to respect rate limits
   * @param {number} estimatedTokens - Estimated tokens for the request
   * @returns {Promise<void>}
   */
  async waitForRateLimit(estimatedTokens = 0) {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    this.cleanTokenUsageWindow();

    const tokensUsed = this.getCurrentTokenUsage();
    const projectedUsage = tokensUsed + estimatedTokens;
    const usageRatio = tokensUsed / TOKEN_LIMITS.MAX_TOKENS_PER_MINUTE;

    if (projectedUsage > TOKEN_LIMITS.MAX_TOKENS_PER_MINUTE) {
      // We would exceed the limit, wait until enough tokens are available
      const tokensToWaitFor = projectedUsage - TOKEN_LIMITS.MAX_TOKENS_PER_MINUTE * 0.8; // Wait until 80% capacity
      const waitTime =
        Math.ceil((tokensToWaitFor / TOKEN_LIMITS.MAX_TOKENS_PER_MINUTE) * RATE_LIMITING.RATE_LIMIT_WINDOW) +
        RATE_LIMITING.RATE_LIMIT_BUFFER;
      console.log(
        `Rate limit: ${tokensUsed}/${TOKEN_LIMITS.MAX_TOKENS_PER_MINUTE} tokens used (${Math.round(
          usageRatio * 100
        )}%), estimated request: ${estimatedTokens} tokens, waiting ${Math.ceil(waitTime / 1000)}s...`
      );
      await this.sleep(Math.min(waitTime, RATE_LIMITING.MAX_WAIT_TIME));
    } else if (usageRatio > RATE_LIMITING.RATE_LIMIT_THRESHOLD) {
      // If we're over threshold, use longer delays
      const waitTime = Math.max(
        RATE_LIMITING.MIN_DELAY_BETWEEN_CALLS * 3,
        RATE_LIMITING.HIGH_USAGE_DELAY
      );
      console.log(
        `Rate limit: ${tokensUsed}/${TOKEN_LIMITS.MAX_TOKENS_PER_MINUTE} tokens used (${Math.round(
          usageRatio * 100
        )}%), waiting ${Math.ceil(waitTime / 1000)}s...`
      );
      await this.sleep(waitTime);
    } else if (timeSinceLastCall < RATE_LIMITING.MIN_DELAY_BETWEEN_CALLS) {
      const waitTime = RATE_LIMITING.MIN_DELAY_BETWEEN_CALLS - timeSinceLastCall;
      await this.sleep(waitTime);
    }

    this.lastCallTime = Date.now();
  }

  /**
   * Handle rate limit error with exponential backoff
   * @param {number} attempt - Current retry attempt number
   * @param {number} maxRetries - Maximum number of retries
   * @returns {Promise<void>}
   */
  async handleRateLimitError(attempt, maxRetries) {
    this.incrementConsecutiveErrors();

    if (attempt < maxRetries - 1) {
      // Exponential backoff
      const backoffTime = Math.min(
        RETRY_CONFIG.RATE_LIMIT_INITIAL_BACKOFF * (attempt + 1),
        RETRY_CONFIG.RATE_LIMIT_MAX_BACKOFF
      );
      console.log(
        `Rate limit hit (${this.consecutiveRateLimitErrors} consecutive), waiting ${Math.ceil(
          backoffTime / 1000
        )}s before retry (attempt ${attempt + 1}/${maxRetries})...`
      );

      // Wait for rate limit window to clear
      const waitForWindow = RETRY_CONFIG.RATE_LIMIT_CLEAR_WINDOW;
      await this.sleep(Math.max(backoffTime, waitForWindow));

      // Reset token usage window if we've had multiple consecutive errors
      if (this.consecutiveRateLimitErrors >= RETRY_CONFIG.CONSECUTIVE_ERROR_RESET_THRESHOLD) {
        console.log('Resetting token usage window after consecutive rate limit errors...');
        this.resetTokenUsageWindow();
      }
    }
  }
}
