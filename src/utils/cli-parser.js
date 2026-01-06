/**
 * CLI Argument Parser
 * Handles parsing and validation of command line arguments
 */

import { parseDateRangeFromArgs } from './date-utils.js';

/**
 * Parse agent parameters from command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {{slackUserId?: string, manualSourcesFolder?: string}} Parsed agent parameters
 */
export function parseAgentParams(args) {
  const params = {};
  const slackUserIdIndex = args.indexOf('--slack-user-id');
  const manualSourcesFolderIndex = args.indexOf('--manual-sources-folder');

  if (slackUserIdIndex !== -1 && args[slackUserIdIndex + 1]) {
    params.slackUserId = args[slackUserIdIndex + 1];
    // Validate format (should start with U and be alphanumeric)
    if (!/^U[A-Z0-9]+$/i.test(params.slackUserId)) {
      console.warn(
        `Warning: Slack user ID "${params.slackUserId}" doesn't match expected format (should be like U01234567AB)`
      );
    }
  }

  if (manualSourcesFolderIndex !== -1 && args[manualSourcesFolderIndex + 1]) {
    params.manualSourcesFolder = args[manualSourcesFolderIndex + 1];
  }

  return params;
}

/**
 * Extract agent names from command line arguments
 * Removes flag arguments and their values, keeping only agent names
 * @param {string[]} args - Command line arguments
 * @returns {string[]|null} Array of agent names or null if none specified
 */
export function extractAgentNames(args) {
  const agentNames = [];
  let skipNext = false;

  const FLAGS_WITH_VALUES = [
    '--start-date',
    '--end-date',
    '--slack-user-id',
    '--manual-sources-folder'
  ];

  for (let i = 0; i < args.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (FLAGS_WITH_VALUES.includes(args[i])) {
      skipNext = true;
      continue;
    }

    // Skip other flags but keep agent names
    if (!args[i].startsWith('--')) {
      agentNames.push(args[i]);
    }
  }

  return agentNames.length > 0 ? agentNames : null;
}

/**
 * Parse all CLI arguments
 * @param {string[]} args - Command line arguments
 * @returns {{dateRange: object|null, agentParams: object, specificAgents: string[]|null}}
 */
export function parseCliArguments(args) {
  const dateRange = parseDateRangeFromArgs(args);
  const agentParams = parseAgentParams(args);
  const specificAgents = extractAgentNames(args);

  return {
    dateRange,
    agentParams,
    specificAgents
  };
}

/**
 * Display help information
 */
export function displayHelp() {
  console.log(`
Chief of Staff Agent System

Usage:
  npm start                                          Run all agents
  npm start -- agent1 agent2                        Run specific agents
  npm start -- --start-date YYYY-MM-DD --end-date YYYY-MM-DD   Run with custom date range
  npm start -- agent1 agent2 --start-date YYYY-MM-DD --end-date YYYY-MM-DD
  npm start -- --list                                List available agents
  npm start -- --help                                Show this help

Options:
  --start-date YYYY-MM-DD           Start date for data analysis (default: configured days ago, see config.json settings.defaultDays)
  --end-date YYYY-MM-DD             End date for data analysis (default: today)
  --slack-user-id USER_ID           Slack user ID for slack-user-analysis agent (required when running slack-user-analysis)
  --manual-sources-folder FOLDER    Folder within manual_sources to use for business-health agent (e.g., "Week 1", "Week 2", "planning")

Note: When using npm, you MUST use '--' before any arguments

Available Agents:
  - weekly-recap              Weekly team catch-up and recap
  - business-health           Officevibe business and product health
  - product-engineering       Product development and engineering updates
  - okr-progress             OKR updates and progress tracking
  - quarterly-review         Quarterly review of product releases and OKR updates
  - thoughtleadership-updates Product thought leadership and new topics
  - slack-user-analysis      Analyze a Slack user's contributions and communication patterns

Examples:
  npm start
  npm start -- weekly-recap business-health
  npm start -- --start-date 2025-12-20 --end-date 2025-12-27
  npm start -- weekly-recap --start-date 2025-12-20 --end-date 2025-12-27
  npm start -- slack-user-analysis --slack-user-id U01234567AB
  npm start -- business-health --manual-sources-folder "Week 1"
  npm start -- business-health --manual-sources-folder "Week 2" --start-date 2025-12-20 --end-date 2025-12-27
  npm start -- --list
`);
}

/**
 * Log parsed CLI arguments for debugging
 * @param {{dateRange: object|null, agentParams: object, specificAgents: string[]|null}} parsed
 * @param {string[]} rawArgs - Original arguments
 */
export function logParsedArguments(parsed, rawArgs) {
  console.log(`[CLI] Parsed arguments:`);
  console.log(
    `  - Date range: ${
      parsed.dateRange
        ? `${parsed.dateRange.startDate || 'default'} to ${parsed.dateRange.endDate || 'default'}`
        : 'default'
    }`
  );
  console.log(
    `  - Specific agents: ${parsed.specificAgents ? parsed.specificAgents.join(', ') : 'all agents'}`
  );
  if (Object.keys(parsed.agentParams).length > 0) {
    console.log(`  - Agent parameters: ${JSON.stringify(parsed.agentParams)}`);
  }
  console.log(`  - Raw args: ${rawArgs.join(' ')}`);
}

/**
 * Validate agent-specific requirements
 * @param {string[]|null} specificAgents - List of agent names
 * @param {object} agentParams - Agent parameters
 */
export function validateAgentRequirements(specificAgents, agentParams) {
  // Warn if slack-user-analysis is run without slack-user-id
  if (
    specificAgents &&
    specificAgents.includes('slack-user-analysis') &&
    !agentParams.slackUserId
  ) {
    console.warn(`\n⚠️  Warning: slack-user-analysis requires --slack-user-id parameter.`);
    console.warn(`   Example: npm start -- slack-user-analysis --slack-user-id U01234567AB\n`);
  }
}
