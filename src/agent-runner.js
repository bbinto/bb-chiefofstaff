import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import pdfParse from 'pdf-parse';

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
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
    
    // Rate limiting: 30,000 tokens per minute
    // Add delay between calls to stay under limit
    this.minDelayBetweenCalls = 5000; // 5 seconds minimum (more conservative)
    this.lastCallTime = 0;
    this.tokenUsageWindow = []; // Track tokens used in the last minute
    this.maxTokensPerMinute = 25000; // More conservative buffer (30k limit - 5k safety margin)
    this.consecutiveRateLimitErrors = 0; // Track consecutive rate limit errors
  }

  /**
   * Load agent instructions from markdown file
   */
  loadAgentInstructions(agentName) {
    const agentPath = path.join(process.cwd(), 'agents', `${agentName}.md`);
    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent file not found: ${agentPath}`);
    }
    return fs.readFileSync(agentPath, 'utf8');
  }

  /**
   * Rough estimate of token count from messages (approximation: ~4 chars per token)
   */
  estimateTokenCount(messages, tools) {
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
            totalChars += typeof block.content === 'string' ? block.content.length : JSON.stringify(block.content).length;
          }
        }
      }
    }
    
    // Add tool schema overhead (rough estimate: ~100 tokens per tool)
    const toolOverhead = tools ? tools.length * 100 : 0;
    
    // Rough approximation: ~4 characters per token (conservative)
    const estimatedTokens = Math.ceil(totalChars / 4) + toolOverhead;
    
    return estimatedTokens;
  }

  /**
   * Truncate messages to stay under token limit
   * Keeps the initial user message (instructions) and recent tool interactions
   */
  truncateMessages(messages, maxTokens = 180000, tools = []) {
    // Always keep the first message (instructions)
    if (messages.length <= 1) {
      return messages;
    }

    const firstMessage = messages[0];
    const recentMessages = [];
    
    // Start from the end and work backwards, keeping recent messages
    // until we approach the limit
    const baseTokens = this.estimateTokenCount([firstMessage], tools);
    
    // Keep at least the last few messages (recent tool interactions)
    const minRecentMessages = 4; // Keep at least last 4 messages (2 tool interaction pairs)
    let messagesKept = 0;
    
    for (let i = messages.length - 1; i >= 1; i--) {
      // Test if adding this message would exceed limit
      const testMessages = [firstMessage, ...recentMessages, messages[i]];
      const testTokens = this.estimateTokenCount(testMessages, tools);
      
      // If adding this message would exceed limit and we've kept minimum, stop
      if (testTokens > maxTokens && messagesKept >= minRecentMessages) {
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
      console.log(`⚠️  Message truncation: Removed ${removed} old message(s), kept ${truncated.length}/${messages.length} messages`);
      console.log(`   Token count: ${Math.round(finalTokens/1000)}k (limit: ${Math.round(maxTokens/1000)}k)`);
    }
    
    return truncated;
  }

  /**
   * Wait to respect rate limits
   */
  async waitForRateLimit(estimatedTokens = 0) {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    // Clean up old token usage entries (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    this.tokenUsageWindow = this.tokenUsageWindow.filter(entry => entry.time > oneMinuteAgo);
    
    // Calculate current token usage in the last minute
    const tokensUsed = this.tokenUsageWindow.reduce((sum, entry) => sum + entry.tokens, 0);
    
    // If this request would exceed the limit, wait longer
    const projectedUsage = tokensUsed + estimatedTokens;
    const usageRatio = tokensUsed / this.maxTokensPerMinute;
    
    if (projectedUsage > this.maxTokensPerMinute) {
      // We would exceed the limit, wait until enough tokens are available
      const tokensToWaitFor = projectedUsage - this.maxTokensPerMinute * 0.8; // Wait until 80% capacity
      // Assuming tokens expire at a rate of maxTokensPerMinute per minute
      const waitTime = Math.ceil((tokensToWaitFor / this.maxTokensPerMinute) * 60000) + 2000; // Add 2s buffer
      console.log(`Rate limit: ${tokensUsed}/${this.maxTokensPerMinute} tokens used (${Math.round(usageRatio * 100)}%), estimated request: ${estimatedTokens} tokens, waiting ${Math.ceil(waitTime / 1000)}s...`);
      await this.sleep(Math.min(waitTime, 60000)); // Cap at 60 seconds
    } else if (usageRatio > 0.7) {
      // If we're over 70% capacity, use longer delays
      const waitTime = Math.max(this.minDelayBetweenCalls * 3, 15000);
      console.log(`Rate limit: ${tokensUsed}/${this.maxTokensPerMinute} tokens used (${Math.round(usageRatio * 100)}%), waiting ${Math.ceil(waitTime / 1000)}s...`);
      await this.sleep(waitTime);
    } else if (timeSinceLastCall < this.minDelayBetweenCalls) {
      const waitTime = this.minDelayBetweenCalls - timeSinceLastCall;
      await this.sleep(waitTime);
    }
    
    this.lastCallTime = Date.now();
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
  async makeApiCall(params, retries = 5) {
    // Estimate tokens before making the call
    const estimatedTokens = this.estimateTokenCount(params.messages || [], params.tools || []);
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await this.waitForRateLimit(estimatedTokens);
        
        const response = await this.anthropic.messages.create(params);
        
        // Track token usage (use actual input tokens from response)
        if (response.usage) {
          const inputTokens = response.usage.input_tokens || 0;
          this.tokenUsageWindow.push({
            time: Date.now(),
            tokens: inputTokens
          });
          
          // Reset consecutive rate limit errors on success
          this.consecutiveRateLimitErrors = 0;
        }
        
        return response;
      } catch (error) {
        // Check if it's a rate limit error (handle various error formats)
        const errorMessage = (error.message || error.error?.message || JSON.stringify(error) || '').toLowerCase();
        const errorType = error.error?.type || error.type;
        const isRateLimitError = error.status === 429 || 
                                 error.statusCode === 429 ||
                                 errorType === 'rate_limit_error' ||
                                 errorMessage.includes('rate_limit') ||
                                 errorMessage.includes('rate limit') ||
                                 errorMessage.includes('would exceed the rate limit');
        
        // Check if it's a "prompt too long" error
        const isPromptTooLong = error.status === 400 &&
                                (errorType === 'invalid_request_error' ||
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
              const truncated = this.truncateMessages(params.messages, 150000, params.tools); // More aggressive truncation
              // Replace the messages array contents (preserve reference for caller)
              params.messages.length = 0;
              params.messages.push(...truncated);
              console.log(`Retrying with truncated messages (${params.messages.length} messages)...`);
              continue;
            }
          }
          
          // If we can't truncate or out of retries, throw with helpful message
          throw new Error(`Prompt too long (exceeds 200k token limit). Try running the agent with fewer data sources or split the work into smaller tasks.`);
        }
        
        if (isRateLimitError) {
          this.consecutiveRateLimitErrors++;
          
          if (attempt < retries - 1) {
            // More aggressive exponential backoff for rate limits
            // Start at 30 seconds, then 60, 90, 120 seconds
            const backoffTime = Math.min(30000 * (attempt + 1), 120000);
            console.log(`Rate limit hit (${this.consecutiveRateLimitErrors} consecutive), waiting ${Math.ceil(backoffTime / 1000)}s before retry (attempt ${attempt + 1}/${retries})...`);
            
            // Also wait for the rate limit window to clear
            const waitForWindow = 65000; // Wait 65 seconds to ensure a new minute window
            await this.sleep(Math.max(backoffTime, waitForWindow));
            
            // Reset token usage window if we've had multiple consecutive errors
            if (this.consecutiveRateLimitErrors >= 2) {
              console.log('Resetting token usage window after consecutive rate limit errors...');
              this.tokenUsageWindow = [];
              this.lastCallTime = 0;
            }
            
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
        max_tokens: 8000,
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
        await this.sleep(1000); // 1 second delay after tool execution
        
        // Check token count and truncate if needed (keep under 180k to leave buffer)
        const estimatedTokens = this.estimateTokenCount(messages, tools);
        const maxPromptTokens = 180000; // Leave 20k buffer below 200k limit
        
        if (estimatedTokens > maxPromptTokens) {
          console.log(`⚠️  Token count (${Math.round(estimatedTokens/1000)}k) exceeds limit, truncating messages...`);
          messages = this.truncateMessages(messages, maxPromptTokens, tools);
        }
        
        response = await this.makeApiCall({
          model: this.model,
          max_tokens: 8000,
          tools,
          messages
        });
      }

      // Extract final text response
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      return {
        agentName,
        success: true,
        output: textContent,
        usage: response.usage
      };

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
      .map(m => `${m.name} (${m.email})`)
      .join(', ');
    const jiraTeams = (this.config.team?.jiraTeams || []).join(', ');

    const slackChannels = this.config.slack?.channels || {};
    const salesChannels = (slackChannels.salesChannels || []).join(', ');
    const csmChannels = (slackChannels.csmChannels || []).join(', ');

    const dateRangeText = `Start: ${startDateISO} | End: ${endDateISO}${threeDaysAgoISO ? ` | 3d ago from end: ${threeDaysAgoISO}` : ''}`;

    return `# Configuration (Concise Format)

## Dates
${dateRangeText}

## Team
PMs: ${teamPMs}
Jira Teams: ${jiraTeams}

## Slack
Sales channels: ${salesChannels || 'None'}
CSM channels: ${csmChannels || 'None'}
My user ID: ${this.config.slack?.myslackuserId || 'N/A'}

## Jira
OKR Board: ${this.config.jira?.ovOkrBoardId || 'N/A'}
Project: ${this.config.jira?.projectKey || 'N/A'}

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

    // Add custom filesystem tools for reading manual_sources
    const filesystemTools = [
      {
        name: 'read_file_from_manual_sources',
        description: 'Read a file from the manual_sources folder (including subdirectories like Q4/). Excel files (.xlsx, .xls) will be parsed and all sheet data will be returned as JSON. CSV and text files will return their content. PDF files will be parsed and their text content extracted. Use this to access ARR data, Goodvibes exports, Mixpanel PDFs, and other files in the manual_sources directory.',
        input_schema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'The name of the file to read from the manual_sources folder. Can include subdirectories, e.g., "Q4/Good-Vibes-2025-12-29T14-11-50.csv" or "Q4/ARR Waterfall.xlsx" or "Dec 22-ARR Waterfall OV.xlsx"'
            }
          },
          required: ['filename']
        }
      },
      {
        name: 'list_manual_sources_files',
        description: 'List all files available in the manual_sources folder and its subdirectories (recursively). Use this to see what ARR data files, Goodvibes exports, Mixpanel PDFs, and other files are available. Returns files with their paths relative to manual_sources.',
        input_schema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ];

    return [...mcpTools, ...filesystemTools];
  }

  /**
   * Handle custom filesystem tool calls
   */
  async handleCustomTool(toolName, args) {
    if (toolName === 'read_file_from_manual_sources') {
      const manualSourcesPath = path.resolve(process.cwd(), 'manual_sources');
      const filePath = path.resolve(manualSourcesPath, args.filename);
      
      // Security: ensure the file is within manual_sources directory
      const resolvedManualSources = path.resolve(manualSourcesPath);
      if (!filePath.startsWith(resolvedManualSources + path.sep) && filePath !== resolvedManualSources) {
        throw new Error('Invalid file path: file must be in manual_sources folder');
      }

      if (!fs.existsSync(filePath)) {
        // Try to provide helpful error message with available files
        const availableFiles = this.listAllFilesRecursive(manualSourcesPath);
        return {
          error: `File not found: ${args.filename}`,
          availableFiles: availableFiles.slice(0, 20).join(', '), // Show first 20 files
          totalFiles: availableFiles.length,
          hint: 'Use list_manual_sources_files to see all available files including those in subdirectories like Q4/'
        };
      }

      // For Excel files, parse and return the data
      const stats = fs.statSync(filePath);
      const isExcel = filePath.endsWith('.xlsx') || filePath.endsWith('.xls');
      
      if (isExcel) {
        try {
          // Read the Excel file
          const workbook = XLSX.readFile(filePath);
          
          // Get all sheet names
          const sheetNames = workbook.SheetNames;
          
          // Parse all sheets into JSON
          const sheetsData = {};
          sheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            // Convert to JSON with header row
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
              defval: '', // Use empty string for empty cells
              raw: false // Format values (dates, numbers, etc.)
            });
            sheetsData[sheetName] = jsonData;
          });
          
          return {
            file: args.filename,
            type: 'Excel file',
            modified: stats.mtime.toISOString(),
            sheetNames: sheetNames,
            data: sheetsData,
            summary: `Excel file with ${sheetNames.length} sheet(s): ${sheetNames.join(', ')}. Data parsed successfully.`
          };
        } catch (error) {
          return {
            file: args.filename,
            type: 'Excel file',
            error: `Error parsing Excel file: ${error.message}`,
            modified: stats.mtime.toISOString()
          };
        }
      }

      // For CSV files, read the content
      const isCSV = filePath.endsWith('.csv');
      if (isCSV) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          return {
            file: args.filename,
            type: 'CSV file',
            modified: stats.mtime.toISOString(),
            content: content,
            size: stats.size,
            lines: content.split('\n').length
          };
        } catch (error) {
          return {
            error: `Error reading CSV file: ${error.message}`,
            file: args.filename
          };
        }
      }

      // For PDF files, parse and return the content
      const isPDF = filePath.endsWith('.pdf');
      if (isPDF) {
        try {
          const dataBuffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(dataBuffer);
          
          return {
            file: args.filename,
            type: 'PDF file',
            modified: stats.mtime.toISOString(),
            size: stats.size,
            pages: pdfData.numpages,
            text: pdfData.text,
            info: pdfData.info || {},
            metadata: pdfData.metadata || {},
            summary: `PDF file parsed successfully. ${pdfData.numpages} page(s). ${pdfData.text.length} characters of text extracted.`
          };
        } catch (error) {
          return {
            file: args.filename,
            type: 'PDF file',
            error: `Error parsing PDF file: ${error.message}`,
            modified: stats.mtime.toISOString(),
            size: stats.size
          };
        }
      }

      // For other text files, read the content
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        return {
          file: args.filename,
          type: 'Text file',
          modified: stats.mtime.toISOString(),
          content: content
        };
      } catch (error) {
        return {
          error: `Error reading file: ${error.message}`,
          file: args.filename
        };
      }
    }

    if (toolName === 'list_manual_sources_files') {
      const manualSourcesPath = path.resolve(process.cwd(), 'manual_sources');
      
      if (!fs.existsSync(manualSourcesPath)) {
        return {
          error: 'manual_sources folder does not exist',
          path: manualSourcesPath
        };
      }

      // Recursively list all files
      const allFiles = this.listAllFilesRecursive(manualSourcesPath);
      const fileDetails = allFiles.map(relativePath => {
        const filePath = path.join(manualSourcesPath, relativePath);
        const stats = fs.statSync(filePath);
        return {
          name: relativePath, // Include subdirectory path
          size: stats.size,
          modified: stats.mtime.toISOString(),
          type: path.extname(relativePath) || 'unknown',
          isDirectory: false
        };
      });

      // Also list directories for context
      const directories = this.listAllDirectoriesRecursive(manualSourcesPath);
      const dirDetails = directories.map(relativePath => ({
        name: relativePath + '/',
        isDirectory: true
      }));

      return {
        folder: 'manual_sources',
        directories: dirDetails,
        files: fileDetails,
        totalFiles: fileDetails.length,
        totalDirectories: dirDetails.length
      };
    }

    throw new Error(`Unknown custom tool: ${toolName}`);
  }

  /**
   * Recursively list all files in a directory
   */
  listAllFilesRecursive(dirPath, basePath = '') {
    const files = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        // Recursively list files in subdirectories
        files.push(...this.listAllFilesRecursive(fullPath, relativePath));
      } else {
        files.push(relativePath);
      }
    }

    return files;
  }

  /**
   * Recursively list all directories in a directory
   */
  listAllDirectoriesRecursive(dirPath, basePath = '') {
    const directories = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
        directories.push(relativePath);
        // Recursively list subdirectories
        const fullPath = path.join(dirPath, entry.name);
        directories.push(...this.listAllDirectoriesRecursive(fullPath, relativePath));
      }
    }

    return directories;
  }
}
