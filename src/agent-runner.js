import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { RateLimiter } from './agent/rate-limiter.js';
import { MessageTruncator } from './agent/message-truncator.js';
import { ToolHandler } from './agent/tool-handler.js';
import { calculateDateRange, formatDateRangeDisplay } from './utils/date-utils.js';
import {
  API_DEFAULTS,
  PATHS,
  TOKEN_LIMITS,
  MESSAGE_TRUNCATION,
  RATE_LIMITING,
  RETRY_CONFIG,
  HTTP_STATUS,
  ERROR_TYPES
} from './utils/constants.js';

/**
 * Agent Runner
 * Executes individual agents based on their markdown instructions
 */
export class AgentRunner {
  constructor(mcpClient, config, dateRange = null, agentParams = {}) {
    this.mcpClient = mcpClient;
    this.config = config;
    this.dateRange = dateRange; // { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
    this.agentParams = agentParams; // { slackUserId: 'U...' } for slack-user-analysis
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    this.model = process.env.CLAUDE_MODEL || API_DEFAULTS.MODEL;

    // Initialize helper classes
    this.rateLimiter = new RateLimiter();
    this.messageTruncator = new MessageTruncator();
    this.toolHandler = new ToolHandler(agentParams);
  }

  /**
   * Load agent instructions from markdown file
   */
  loadAgentInstructions(agentName) {
    const agentPath = path.join(process.cwd(), PATHS.AGENTS_DIR, `${agentName}.md`);
    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent file not found: ${agentPath}`);
    }
    return fs.readFileSync(agentPath, 'utf8');
  }


  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Make API call with rate limiting and retry logic
   */
  async makeApiCall(params, retries = RETRY_CONFIG.MAX_RETRIES) {
    // Estimate tokens before making the call
    const estimatedTokens = this.messageTruncator.estimateTokenCount(params.messages || [], params.tools || []);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await this.rateLimiter.waitForRateLimit(estimatedTokens);

        const response = await this.anthropic.messages.create(params);

        // Track token usage (use actual input tokens from response)
        if (response.usage) {
          const inputTokens = response.usage.input_tokens || 0;
          this.rateLimiter.trackTokenUsage(inputTokens);
          this.rateLimiter.resetConsecutiveErrors();
        }

        return response;
      } catch (error) {
        // Check if it's a rate limit error (handle various error formats)
        const errorMessage = (error.message || error.error?.message || JSON.stringify(error) || '').toLowerCase();
        const errorType = error.error?.type || error.type;
        const isRateLimitError = error.status === HTTP_STATUS.RATE_LIMIT ||
                                 error.statusCode === HTTP_STATUS.RATE_LIMIT ||
                                 errorType === ERROR_TYPES.RATE_LIMIT_ERROR ||
                                 errorMessage.includes('rate_limit') ||
                                 errorMessage.includes('rate limit') ||
                                 errorMessage.includes('would exceed the rate limit');

        // Check if it's a "prompt too long" error
        const isPromptTooLong = error.status === HTTP_STATUS.BAD_REQUEST &&
                                (errorType === ERROR_TYPES.INVALID_REQUEST_ERROR ||
                                 errorMessage.includes('prompt is too long') ||
                                 errorMessage.includes('too long') ||
                                 errorMessage.includes('maximum'));

        if (isPromptTooLong) {
          console.error(`❌ Prompt too long error: ${error.error?.message || errorMessage}`);
          console.error('This indicates the conversation history has exceeded the token limit.');
          console.error('The system will attempt to truncate messages and retry...');

          if (attempt < retries - 1) {
            // Truncate messages more aggressively
            if (params.messages) {
              const truncated = this.messageTruncator.truncateMessages(
                params.messages,
                MESSAGE_TRUNCATION.AGGRESSIVE_TRUNCATION_LIMIT,
                params.tools
              );
              // Replace the messages array contents (preserve reference for caller)
              params.messages.length = 0;
              params.messages.push(...truncated);
              console.log(`Retrying with truncated messages (${params.messages.length} messages)...`);
              continue;
            }
          }

          // If we can't truncate or out of retries, throw with helpful message
          throw new Error(`Prompt too long (exceeds ${TOKEN_LIMITS.MAX_TOTAL_TOKENS / 1000}k token limit). Try running the agent with fewer data sources or split the work into smaller tasks.`);
        }

        if (isRateLimitError) {
          await this.rateLimiter.handleRateLimitError(attempt, retries);
          if (attempt < retries - 1) {
            continue;
          }
        }

        // If not a rate limit error or out of retries, throw
        throw error;
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  /**
   * Execute an agent
   */
  async runAgent(agentName) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Running Agent: ${agentName.toUpperCase()}`);
    console.log(`${'='.repeat(80)}\n`);

    const instructions = this.loadAgentInstructions(agentName);

    // Prepare context with configuration
    const contextMessage = this.buildContextMessage();

    // Build parameter message for agents that need it
    let parameterMessage = '';
    if (agentName === 'slack-user-analysis') {
      if (this.agentParams.slackUserId) {
        parameterMessage = `\n\n**IMPORTANT: Slack User ID Parameter**\nThe Slack user ID to analyze is: ${this.agentParams.slackUserId}\nPlease use this user ID to search for their messages and analyze their contributions.`;
      } else {
        parameterMessage = `\n\n**IMPORTANT: Slack User ID Parameter Required**\nNo Slack user ID was provided. Please ask the user for the Slack user ID before proceeding with the analysis. The Slack user ID format is typically "U" followed by alphanumeric characters (e.g., "U01234567AB").`;
      }
    }
    
    if (agentName === 'business-health') {
      if (this.agentParams.manualSourcesFolder) {
        parameterMessage = `\n\n**IMPORTANT: Manual Sources Folder Parameter**\nThe folder to use for manual sources is: "${this.agentParams.manualSourcesFolder}"\nPlease use files from the "${this.agentParams.manualSourcesFolder}" subfolder within manual_sources. When using the read_file_from_manual_sources tool, specify filenames relative to this folder (e.g., if folder is "Week 1" and file is "ARR OV.xlsx", use filename "ARR OV.xlsx" or "Week 1/ARR OV.xlsx").`;
      }
    }

    const messages = [
      {
        role: 'user',
        content: `${contextMessage}\n\n${instructions}${parameterMessage}\n\nPlease execute the agent's instructions now. Use the available MCP tools to gather the required data and provide a comprehensive report following the output format specified in the instructions.`
      }
    ];

    // Get available tools from MCP
    const tools = this.buildToolsSchema();

    try {
      let response = await this.makeApiCall({
        model: this.model,
        max_tokens: API_DEFAULTS.MAX_TOKENS,
        tools,
        messages
      });

      // Handle tool use loop
      while (response.stop_reason === 'tool_use') {
        // Find ALL tool_use blocks in the response (Claude can make multiple parallel tool calls)
        const toolUses = response.content.filter(block => block.type === 'tool_use');

        if (toolUses.length === 0) break;

        console.log(`Agent is using ${toolUses.length} tool(s): ${toolUses.map(t => t.name).join(', ')}`);

        // Execute all tools in parallel
        const toolResults = await Promise.all(
          toolUses.map(async (toolUse) => {
            let toolResult;
            
            // Check if it's a custom filesystem tool
            if (toolUse.name === 'read_file_from_manual_sources' || 
                toolUse.name === 'list_manual_sources_files') {
              toolResult = await this.handleCustomTool(toolUse.name, toolUse.input);
            } else {
              // Use MCP client for other tools
              toolResult = await this.mcpClient.callTool(toolUse.name, toolUse.input);
            }
            
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(toolResult)
            };
          })
        );

        // Add assistant's response with all tool_use blocks
        messages.push({
          role: 'assistant',
          content: response.content
        });

        // Add user message with all tool_result blocks
        messages.push({
          role: 'user',
          content: toolResults
        });

        // Get next response with rate limiting
        // Add extra delay after tool execution to prevent rapid-fire requests
        await this.sleep(RATE_LIMITING.TOOL_EXECUTION_DELAY);

        // Check token count and truncate if needed (keep under 180k to leave buffer)
        const estimatedTokens = this.messageTruncator.estimateTokenCount(messages, tools);
        const maxPromptTokens = TOKEN_LIMITS.MAX_PROMPT_TOKENS;

        if (estimatedTokens > maxPromptTokens) {
          console.log(`⚠️  Token count (${Math.round(estimatedTokens/1000)}k) exceeds limit, truncating messages...`);
          messages = this.messageTruncator.truncateMessages(messages, maxPromptTokens, tools);
        }
        
        response = await this.makeApiCall({
          model: this.model,
          max_tokens: API_DEFAULTS.MAX_TOKENS,
          tools,
          messages
        });
      }

      // Extract final text response
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      const result = {
        agentName,
        success: true,
        output: textContent,
        usage: response.usage
      };
      
      // Include agent-specific parameters in result for reporting
      if (agentName === 'business-health' && this.agentParams.manualSourcesFolder) {
        result.manualSourcesFolder = this.agentParams.manualSourcesFolder;
      }
      
      return result;

    } catch (error) {
      const errorMessage = error.message || error.error?.message || 'Unknown error';
      console.error(`Error running agent ${agentName}:`, errorMessage);
      
      // Check if it's a rate limit error
      const errorType = error.error?.type || error.type;
      const errorMsgLower = errorMessage.toLowerCase();
      const isRateLimitError = error.status === 429 || 
                               error.statusCode === 429 ||
                               errorType === 'rate_limit_error' ||
                               errorMsgLower.includes('rate_limit') ||
                               errorMsgLower.includes('rate limit') ||
                               errorMsgLower.includes('would exceed the rate limit');
      
      // Check if it's a "prompt too long" error
      const isPromptTooLong = error.status === 400 &&
                              (errorType === 'invalid_request_error' ||
                               errorMsgLower.includes('prompt is too long') ||
                               errorMsgLower.includes('too long') ||
                               errorMsgLower.includes('maximum'));
      
      if (isPromptTooLong) {
        console.error('❌ Prompt too long error: The conversation history exceeded the 200k token limit.');
        console.error('This can happen when an agent processes many large data sources.');
        console.error('Suggestions:');
        console.error('  1. The system will automatically truncate messages on retry');
        console.error('  2. Consider splitting the agent work into smaller tasks');
        console.error('  3. Reduce the number of data sources processed at once');
        console.error('  4. For officevibe-strategy-roadmap: process feedback pages in batches');
      } else if (isRateLimitError) {
        console.error('Rate limit exceeded. The system will retry with exponential backoff.');
        console.error('If this persists, consider:');
        console.error('  1. Running agents individually with longer delays');
        console.error('  2. Reducing the scope of agent instructions');
        console.error('  3. Contacting Anthropic for a rate limit increase');
      }
      
      return {
        agentName,
        success: false,
        error: errorMessage,
        errorDetails: isRateLimitError ? 'Rate limit error' : undefined
      };
    }
  }

  /**
   * Build context message with configuration (optimized for token usage)
   */
  buildContextMessage() {
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Get default days from config, default to 7 if not specified
    const defaultDays = this.config?.settings?.defaultDays || 7;
    
    // Use provided date range or calculate defaults
    let endDateISO = todayISO;
    let startDateISO = null;
    let threeDaysAgoISO = null;
    
    if (this.dateRange) {
      endDateISO = this.dateRange.endDate || todayISO;
      
      // If start date is not provided, default to configured days before end date
      if (this.dateRange.startDate) {
        startDateISO = this.dateRange.startDate;
      } else {
        // Default start date to configured days before end date
        const endDateObj = new Date(endDateISO + 'T00:00:00');
        const defaultDaysAgo = new Date(endDateObj);
        defaultDaysAgo.setDate(endDateObj.getDate() - defaultDays);
        startDateISO = defaultDaysAgo.toISOString().split('T')[0];
      }
      
      // Calculate 3 days ago from end date
      const endDateObj = new Date(endDateISO + 'T00:00:00');
      const threeDaysAgo = new Date(endDateObj);
      threeDaysAgo.setDate(endDateObj.getDate() - 3);
      threeDaysAgoISO = threeDaysAgo.toISOString().split('T')[0];
    } else {
      // Default behavior: calculate configured days ago and 3 days ago
      const defaultDaysAgo = new Date(today);
      defaultDaysAgo.setDate(today.getDate() - defaultDays);
      startDateISO = defaultDaysAgo.toISOString().split('T')[0];
      
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);
      threeDaysAgoISO = threeDaysAgo.toISOString().split('T')[0];
    }

    // Build concise configuration - only include essential values
    const teamPMs = (this.config.team?.ovTeamMembers || [])
      .map(m => `${m.name} (${m.email}, Slack: ${m.slackId || 'N/A'})`)
      .join(', ');
    const jiraTeams = (this.config.team?.jiraTeams || []).join(', ');
    const jiraProducts = (this.config.team?.jiraProducts || []).join(', ');
    const ovEntireTeam = (this.config.team?.OVEntireTeam || []).join(', ');
    const slackChannels = this.config.slack?.channels || {};
    const salesChannels = (slackChannels.salesChannels || []).join(', ');
    const csmChannels = (slackChannels.csmChannels || []).join(', ');
    const productGeneral = (slackChannels.productGeneral || []).join(', ');
    const productFeedback = (slackChannels.productFeedback || []).join(', ');
    const teamChannels = (slackChannels.teamChannels || []).join(', ');

    const dateRangeText = `Start: ${startDateISO} | End: ${endDateISO}${threeDaysAgoISO ? ` | 3d ago from end: ${threeDaysAgoISO}` : ''}`;
    const calendarNames = (this.config.calendar?.name || []).join(', ');

    return `# Configuration (Concise Format)

## Dates
${dateRangeText}

## Team
PMs: ${teamPMs}
Jira Teams: ${jiraTeams}
Jira Products: ${jiraProducts}
OV Entire Team: ${ovEntireTeam}

## Calendar
Calendar Names: ${calendarNames || 'None'}
**IMPORTANT: Use google-calendar MCP tools (list-calendars, list-events, search-events, get-freebusy) to access these calendars. Calendar names from config: ${calendarNames || 'None'}. You can use calendar names directly in the tools - they support both calendar IDs and calendar names.**

## Slack
Team channels: ${teamChannels || 'None'}
Product general channels: ${productGeneral || 'None'}
Product feedback channels: ${productFeedback || 'None'}
Sales channels: ${salesChannels || 'None'}
CSM channels: ${csmChannels || 'None'}
My user ID: ${this.config.slack?.myslackuserId || 'N/A'}
**IMPORTANT: All channel values above are Slack channel IDs (format: C075SE700NM). Use these IDs directly in MCP tool calls, NOT channel names.**

## Jira
OKR Board: ${this.config.jira?.ovOkrBoardId || 'N/A'}
Project: ${this.config.jira?.projectKey || 'N/A'}
OV Project: ${this.config.jira?.OVprojectKey || 'N/A'}

## Confluence
VoC Page ID: ${this.config.confluence?.vocPageId || 'N/A'}
Space: ${this.config.confluence?.spaceKey || 'N/A'}

## Hubspot
Product filter: ${this.config.hubspot?.productFilter || 'N/A'}

## Thought Leadership
RSS Feeds: ${(this.config.thoughtleadership?.rssFeeds || []).join(', ') || 'None'}
Web Sources: ${(this.config.thoughtleadership?.webSources || []).join(', ') || 'None'}
Industry News Sources: ${(this.config.thoughtleadership?.industryNewsSources || []).join(', ') || 'None'}

## Dates (CRITICAL)
Use ISO format YYYY-MM-DD for date params. The dates define an INCLUSIVE date range (period) from ${startDateISO} to ${endDateISO} (includes both start and end dates). When querying data sources, use parameters like after: "${startDateISO}" (inclusive) and before: "${endDateISO}" or onOrBefore: "${endDateISO}" (depending on API) to query data within this period.${threeDaysAgoISO ? ` For "last 3 days", use "${threeDaysAgoISO}".` : ''}`;
  }

  /**
   * Build tools schema for Claude from MCP tools + custom filesystem tools
   */
  buildToolsSchema() {
    const availableTools = this.mcpClient.getAvailableTools();
    const mcpTools = availableTools.map(tool => ({
      name: tool.name,
      description: tool.schema.description || `Tool from ${tool.server} server`,
      input_schema: tool.schema.inputSchema || {
        type: 'object',
        properties: {},
        required: []
      }
    }));

    // Add custom filesystem tools using ToolHandler
    const filesystemTools = this.toolHandler.buildCustomToolsSchema();

    return [...mcpTools, ...filesystemTools];
  }

  /**
   * Handle custom filesystem tool calls (delegated to ToolHandler)
   */
  async handleCustomTool(toolName, args) {
    return await this.toolHandler.handleCustomTool(toolName, args);
  }
}
