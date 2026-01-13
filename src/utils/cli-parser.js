/**
 * CLI Argument Parser
 * Handles parsing and validation of command line arguments
 */

import { parseDateRangeFromArgs } from './date-utils.js';

/**
 * Parse agent parameters from command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {{slackUserId?: string, manualSourcesFolder?: string, folder?: string, email?: string, week?: string, reportFile?: string}} Parsed agent parameters
 */
export function parseAgentParams(args) {
  console.log('[CLI Parser] Parsing agent parameters from args:', args);
  const params = {};
  const slackUserIdIndex = args.indexOf('--slack-user-id');
  const manualSourcesFolderIndex = args.indexOf('--manual-sources-folder');
  const folderIndex = args.indexOf('--folder');
  const emailIndex = args.indexOf('--email');
  const weekIndex = args.indexOf('--week');
  const reportFileIndex = args.indexOf('--report-file');

  console.log('[CLI Parser] Parameter indices - slackUserId:', slackUserIdIndex, 'manualSourcesFolder:', manualSourcesFolderIndex, 'folder:', folderIndex, 'email:', emailIndex, 'week:', weekIndex, 'reportFile:', reportFileIndex);

  if (slackUserIdIndex !== -1 && args[slackUserIdIndex + 1]) {
    params.slackUserId = args[slackUserIdIndex + 1];
    console.log('[CLI Parser] Found slackUserId:', params.slackUserId);
    // Validate format (should start with U and be alphanumeric)
    if (!/^U[A-Z0-9]+$/i.test(params.slackUserId)) {
      console.warn(
        `Warning: Slack user ID "${params.slackUserId}" doesn't match expected format (should be like U01234567AB)`
      );
    }
  }

  if (manualSourcesFolderIndex !== -1 && args[manualSourcesFolderIndex + 1]) {
    params.manualSourcesFolder = args[manualSourcesFolderIndex + 1];
    console.log('[CLI Parser] Found manualSourcesFolder:', params.manualSourcesFolder);
  }

  if (folderIndex !== -1 && args[folderIndex + 1]) {
    params.folder = args[folderIndex + 1];
    console.log('[CLI Parser] Found folder parameter:', params.folder);
  } else {
    console.log('[CLI Parser] No folder parameter found in args');
  }

  if (emailIndex !== -1 && args[emailIndex + 1]) {
    params.email = args[emailIndex + 1];
    console.log('[CLI Parser] Found email:', params.email);
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
      console.warn(
        `Warning: Email "${params.email}" doesn't match expected format (should be like user@example.com)`
      );
    }
  }

  if (weekIndex !== -1 && args[weekIndex + 1]) {
    params.week = args[weekIndex + 1];
    console.log('[CLI Parser] Found week:', params.week);
    // Basic validation - week should match pattern like "week 1" or "week 1 2025"
    if (!/week\s+\d+(\s+\d{4})?/i.test(params.week)) {
      console.warn(
        `Warning: Week "${params.week}" doesn't match expected format (should be like "week 1" or "week 1 2025")`
      );
    }
  }

  if (reportFileIndex !== -1 && args[reportFileIndex + 1]) {
    params.reportFile = args[reportFileIndex + 1];
    console.log('[CLI Parser] Found reportFile:', params.reportFile);
    // Basic validation - should end with .md
    if (!params.reportFile.endsWith('.md')) {
      console.warn(
        `Warning: Report file "${params.reportFile}" doesn't end with .md (should be like "reports/business-health-2025-01-12-10-30-00.md")`
      );
    }
  }

  console.log('[CLI Parser] Final parsed params:', params);
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
    '--manual-sources-folder',
    '--folder',
    '--email',
    '--week',
    '--report-file'
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
  --email EMAIL                     Email address for 1-1 agent (required when running 1-1)
  --manual-sources-folder FOLDER    Folder within manual_sources to use for business-health agent (e.g., "Week 1", "Week 2", "planning")
  --folder FOLDER                   Folder within manual_sources to use for telemetry-deepdive agent (e.g., "week1", "week2")
  --week WEEK                       Calendar week for weekly-executive-summary agent (e.g., "week 1" or "week 1 2025") (required when running weekly-executive-summary)
  --report-file FILE_PATH           Report file path for tts agent (e.g., "reports/business-health-2025-01-12-10-30-00.md") (required when running tts)

Note: When using npm, you MUST use '--' before any arguments

Available Agents:
  - weekly-recap                    Weekly team catch-up and recap
  - business-health                 Officevibe business and product health
  - product-engineering             Product development and engineering updates
  - okr-progress                    OKR updates and progress tracking
  - quarterly-review               Quarterly review of product releases and OKR updates
  - quarterly-performance-review   Quarterly performance review for Director of Product
  - thoughtleadership-updates      Product thought leadership and new topics
  - slack-user-analysis            Analyze a Slack user's contributions and communication patterns
  - 1-1                            Prepare for a 1-1 meeting with a specific person (requires --email)
  - weekly-executive-summary       Generate executive summary from all reports for a specific calendar week (requires --week)
  - tts                            Convert a markdown report to speech using Hume AI (requires --report-file)
  - good-vibes-recognition         Helps identify team members deserving recognition based on their recent contributions, achievements, and positive impact across Slack channels

Examples:
  npm start
  npm start -- weekly-recap business-health
  npm start -- --start-date 2025-12-20 --end-date 2025-12-27
  npm start -- weekly-recap --start-date 2025-12-20 --end-date 2025-12-27
  npm start -- slack-user-analysis --slack-user-id U01234567AB
  npm start -- 1-1 --email lanny.geffen@workleap.com
  npm start -- business-health --manual-sources-folder "Week 1"
  npm start -- business-health --manual-sources-folder "Week 2" --start-date 2025-12-20 --end-date 2025-12-27
  npm start -- telemetry-deepdive --folder week1
  npm start -- telemetry-deepdive --folder week2
  npm start -- weekly-executive-summary --week "week 1"
  npm start -- weekly-executive-summary --week "week 2 2025"
  npm start -- tts --report-file "reports/business-health-2025-01-12-10-30-00.md"
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

  // Warn if 1-1 is run without email
  if (
    specificAgents &&
    specificAgents.includes('1-1') &&
    !agentParams.email
  ) {
    console.warn(`\n⚠️  Warning: 1-1 agent requires --email parameter.`);
    console.warn(`   Example: npm start -- 1-1 --email lanny.geffen@workleap.com\n`);
  }

  // Warn if weekly-executive-summary is run without week
  if (
    specificAgents &&
    specificAgents.includes('weekly-executive-summary') &&
    !agentParams.week
  ) {
    console.warn(`\n⚠️  Warning: weekly-executive-summary requires --week parameter.`);
    console.warn(`   Example: npm start -- weekly-executive-summary --week "week 1"`);
    console.warn(`   Example: npm start -- weekly-executive-summary --week "week 2 2025"\n`);
  }

  // Warn if tts is run without report-file
  if (
    specificAgents &&
    specificAgents.includes('tts') &&
    !agentParams.reportFile
  ) {
    console.warn(`\n⚠️  Warning: tts agent requires --report-file parameter.`);
    console.warn(`   Example: npm start -- tts --report-file "reports/business-health-2025-01-12-10-30-00.md"\n`);
  }
}
