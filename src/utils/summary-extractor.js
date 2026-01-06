/**
 * Summary Extractor
 * Extracts executive summaries and insights from report content
 */

import { FRONTEND } from './constants.js';

/**
 * Extract the one-line executive summary from report content
 * @param {string} content - Report content
 * @returns {string|null} One-line summary or null if not found
 */
export function extractOneLineSummary(content) {
  if (!content) return null;

  const lines = content.split('\n');
  let inSummarySection = false;
  let foundHeading = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for the "One-Line Executive Summary" heading
    if (line.match(/One-Line Executive Summary/i)) {
      inSummarySection = true;
      foundHeading = true;
      continue;
    }

    // If we're in the summary section, look for the actual summary content
    if (inSummarySection && foundHeading) {
      // Skip empty lines
      if (line.length === 0) {
        continue;
      }

      // Skip if it's another heading (we've moved to the next section)
      if (line.match(/^#{1,6}\s/)) {
        break;
      }

      // Skip example format lines (contain brackets with placeholders)
      if (
        line.match(/^\[.*\]$/) ||
        line.match(/\[One sentence/) ||
        line.match(/e\.g\./)
      ) {
        continue;
      }

      // Found the summary line - clean it up
      let summary = line
        .replace(/^[-*•]\s+/, '') // Remove list markers
        .replace(/\[.*?\]/g, '') // Remove any remaining brackets
        .replace(/\*\*/g, '') // Remove bold markers
        .replace(/`/g, '') // Remove code markers
        .trim();

      // Skip if it's still too short or looks like a template
      if (summary.length < FRONTEND.MIN_SUMMARY_LENGTH || summary.match(/^\[/)) {
        continue;
      }

      // Return the first valid summary line we find
      if (summary.length > 0) {
        return summary;
      }
    }
  }

  return null;
}

/**
 * Extract first couple of insights from report content (fallback if no one-line summary)
 * @param {string} content - Report content
 * @returns {string[]} Array of insights
 */
export function extractInsights(content) {
  if (!content) return [];

  const insights = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length && insights.length < FRONTEND.MAX_INSIGHTS_TO_EXTRACT; i++) {
    const line = lines[i].trim();

    // Skip headers and metadata
    if (
      line.startsWith('#') ||
      line.startsWith('**Generated') ||
      line.startsWith('---') ||
      line.length === 0
    ) {
      continue;
    }

    // Look for bullet points or numbered lists
    if (line.match(/^[-*•]\s+|^\d+\.\s+/)) {
      const insight = line.replace(/^[-*•]\s+|^\d+\.\s+/, '').trim();
      if (
        insight.length > FRONTEND.MIN_INSIGHT_LENGTH &&
        insight.length < FRONTEND.MAX_INSIGHT_LENGTH
      ) {
        insights.push(insight);
      }
    }

    // Look for key-value pairs or status indicators
    if (
      line.match(/status:|flag:|⚠️|✅|🟡|🔴/) &&
      insights.length < FRONTEND.MAX_INSIGHTS_TO_EXTRACT
    ) {
      const insight = line.replace(/status:|flag:/i, '').trim();
      if (
        insight.length > FRONTEND.MIN_INSIGHT_LENGTH / 2 &&
        insight.length < FRONTEND.MAX_INSIGHT_LENGTH
      ) {
        insights.push(insight);
      }
    }

    // Look for sentences that seem like insights (contain key words)
    if (insights.length < FRONTEND.MAX_INSIGHTS_TO_EXTRACT && line.length > 30 && line.length < 300) {
      if (
        line.match(
          /\b(total|found|identified|shows|indicates|recommend|critical|important|concern|risk|issue)\b/i
        )
      ) {
        // Make sure it's not a header or metadata
        if (!line.match(/^#{1,6}\s/) && !line.match(/^\[/) && !line.match(/^`/)) {
          insights.push(line);
        }
      }
    }
  }

  // If we didn't find enough insights, get first meaningful sentences
  if (insights.length < FRONTEND.MAX_INSIGHTS_TO_EXTRACT) {
    for (
      let i = 0;
      i < lines.length && insights.length < FRONTEND.MAX_INSIGHTS_TO_EXTRACT;
      i++
    ) {
      const line = lines[i].trim();
      if (
        line.length > 40 &&
        line.length < 250 &&
        !line.startsWith('#') &&
        !line.startsWith('**Generated') &&
        !line.startsWith('---') &&
        !line.match(/^\[/) &&
        !line.match(/^`/)
      ) {
        insights.push(line);
      }
    }
  }

  return insights.slice(0, FRONTEND.MAX_INSIGHTS_TO_EXTRACT);
}
