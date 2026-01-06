/**
 * Message Truncator
 * Handles truncation of conversation messages to stay under token limits
 */

import { TOKEN_LIMITS, MESSAGE_TRUNCATION } from '../utils/constants.js';

/**
 * Message Truncator Class
 * Estimates token counts and truncates messages intelligently
 */
export class MessageTruncator {
  /**
   * Rough estimate of token count from messages
   * @param {Array} messages - Array of messages
   * @param {Array} tools - Array of tool schemas
   * @returns {number} Estimated token count
   */
  estimateTokenCount(messages, tools = []) {
    let totalChars = 0;

    // Count characters in messages
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            totalChars += block.text.length;
          } else if (block.type === 'tool_use' && block.input) {
            totalChars += JSON.stringify(block.input).length;
          } else if (block.type === 'tool_result' && block.content) {
            totalChars +=
              typeof block.content === 'string'
                ? block.content.length
                : JSON.stringify(block.content).length;
          }
        }
      }
    }

    // Add tool schema overhead
    const toolOverhead = tools.length * TOKEN_LIMITS.TOOL_OVERHEAD_PER_TOOL;

    // Rough approximation
    const estimatedTokens = Math.ceil(totalChars / TOKEN_LIMITS.CHARS_PER_TOKEN) + toolOverhead;

    return estimatedTokens;
  }

  /**
   * Truncate messages to stay under token limit
   * Keeps the initial user message (instructions) and recent tool interactions
   * @param {Array} messages - Array of messages
   * @param {number} maxTokens - Maximum token limit
   * @param {Array} tools - Array of tool schemas
   * @returns {Array} Truncated messages
   */
  truncateMessages(messages, maxTokens = TOKEN_LIMITS.MAX_PROMPT_TOKENS, tools = []) {
    // Always keep the first message (instructions)
    if (messages.length <= 1) {
      return messages;
    }

    const firstMessage = messages[0];
    const recentMessages = [];

    // Start from the end and work backwards
    const baseTokens = this.estimateTokenCount([firstMessage], tools);

    // Keep at least the last few messages (recent tool interactions)
    let messagesKept = 0;

    for (let i = messages.length - 1; i >= 1; i--) {
      // Test if adding this message would exceed limit
      const testMessages = [firstMessage, ...recentMessages, messages[i]];
      const testTokens = this.estimateTokenCount(testMessages, tools);

      // If adding this message would exceed limit and we've kept minimum, stop
      if (
        testTokens > maxTokens &&
        messagesKept >= MESSAGE_TRUNCATION.MIN_RECENT_MESSAGES
      ) {
        break;
      }

      // Add this message to recent messages (at the beginning since we're going backwards)
      recentMessages.unshift(messages[i]);
      messagesKept++;
    }

    const truncated = [firstMessage, ...recentMessages];
    const finalTokens = this.estimateTokenCount(truncated, tools);

    if (messages.length > truncated.length) {
      const removed = messages.length - truncated.length;
      console.log(
        `⚠️  Message truncation: Removed ${removed} old message(s), kept ${truncated.length}/${messages.length} messages`
      );
      console.log(
        `   Token count: ${Math.round(finalTokens / 1000)}k (limit: ${Math.round(maxTokens / 1000)}k)`
      );
    }

    return truncated;
  }
}
