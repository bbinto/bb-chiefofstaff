import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

/**
 * Agent Runner
 * Executes individual agents based on their markdown instructions
 */
export class AgentRunner {
  constructor(mcpClient, config, dateRange = null) {
    this.mcpClient = mcpClient;
    this.config = config;
    this.dateRange = dateRange; // { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
    
    // Rate limiting: 30,000 tokens per minute = ~500 tokens per second
    // Add delay between calls to stay under limit
    this.minDelayBetweenCalls = 2000; // 2 seconds minimum
    this.lastCallTime = 0;
    this.tokenUsageWindow = []; // Track tokens used in the last minute
    this.maxTokensPerMinute = 28000; // Leave some buffer (30k limit)
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
   * Wait to respect rate limits
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    // Clean up old token usage entries (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    this.tokenUsageWindow = this.tokenUsageWindow.filter(entry => entry.time > oneMinuteAgo);
    
    // Calculate current token usage in the last minute
    const tokensUsed = this.tokenUsageWindow.reduce((sum, entry) => sum + entry.tokens, 0);
    
    // If we're close to the limit, wait longer
    if (tokensUsed > this.maxTokensPerMinute * 0.8) {
      const waitTime = Math.max(this.minDelayBetweenCalls * 2, 5000);
      console.log(`Rate limit: ${tokensUsed}/${this.maxTokensPerMinute} tokens used, waiting ${waitTime}ms...`);
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
  async makeApiCall(params, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await this.waitForRateLimit();
        
        const response = await this.anthropic.messages.create(params);
        
        // Track token usage
        if (response.usage) {
          this.tokenUsageWindow.push({
            time: Date.now(),
            tokens: response.usage.input_tokens || 0
          });
        }
        
        return response;
      } catch (error) {
        // Check if it's a rate limit error
        const isRateLimitError = error.status === 429 || 
                                 error.message?.includes('rate_limit') ||
                                 error.message?.includes('rate limit');
        
        if (isRateLimitError && attempt < retries - 1) {
          // Exponential backoff: wait 5s, 10s, 20s
          const backoffTime = Math.min(5000 * Math.pow(2, attempt), 60000);
          console.log(`Rate limit hit, retrying in ${backoffTime}ms (attempt ${attempt + 1}/${retries})...`);
          await this.sleep(backoffTime);
          continue;
        }
        
        // If not a rate limit error or out of retries, throw
        throw error;
      }
    }
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

    const messages = [
      {
        role: 'user',
        content: `${contextMessage}\n\n${instructions}\n\nPlease execute the agent's instructions now. Use the available MCP tools to gather the required data and provide a comprehensive report following the output format specified in the instructions.`
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
      console.error(`Error running agent ${agentName}:`, error.message);
      if (error.status === 429) {
        console.error('Rate limit exceeded. Consider:');
        console.error('  1. Running agents individually with delays');
        console.error('  2. Reducing the scope of agent instructions');
        console.error('  3. Contacting Anthropic for a rate limit increase');
      }
      return {
        agentName,
        success: false,
        error: error.message
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
        description: 'Read a file from the manual_sources folder. Excel files (.xlsx, .xls) will be parsed and all sheet data will be returned as JSON. Text files will return their content. Use this to access ARR data and other files in the manual_sources directory.',
        input_schema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'The name of the file to read from the manual_sources folder (e.g., "Dec 22-ARR Waterfall OV.xlsx")'
            }
          },
          required: ['filename']
        }
      },
      {
        name: 'list_manual_sources_files',
        description: 'List all files available in the manual_sources folder. Use this to see what ARR data files are available.',
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
        return {
          error: `File not found: ${args.filename}`,
          availableFiles: fs.readdirSync(manualSourcesPath).join(', ')
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

      // For text files, read the content
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        return {
          file: args.filename,
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

      const files = fs.readdirSync(manualSourcesPath);
      const fileDetails = files.map(file => {
        const filePath = path.join(manualSourcesPath, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          type: path.extname(file) || 'unknown'
        };
      });

      return {
        folder: 'manual_sources',
        files: fileDetails,
        count: files.length
      };
    }

    throw new Error(`Unknown custom tool: ${toolName}`);
  }
}
