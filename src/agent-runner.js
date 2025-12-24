import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

/**
 * Agent Runner
 * Executes individual agents based on their markdown instructions
 */
export class AgentRunner {
  constructor(mcpClient, config) {
    this.mcpClient = mcpClient;
    this.config = config;
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
            const toolResult = await this.mcpClient.callTool(toolUse.name, toolUse.input);
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(toolResult.content)
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
   * Build context message with configuration
   */
  buildContextMessage() {
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString().split('T')[0];
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    const threeDaysAgoISO = threeDaysAgo.toISOString().split('T')[0];

    return `# Context and Configuration

You have access to the following configuration data:

## Team Information
${JSON.stringify(this.config.team, null, 2)}

## Slack Configuration
${JSON.stringify(this.config.slack, null, 2)}

## Calendar Configuration
${JSON.stringify(this.config.calendar, null, 2)}

## Jira Configuration
${JSON.stringify(this.config.jira, null, 2)}

## Confluence Configuration
${JSON.stringify(this.config.confluence, null, 2)}

## Other Configuration
- Hubspot: ${JSON.stringify(this.config.hubspot, null, 2)}
- Mixpanel: ${JSON.stringify(this.config.mixpanel, null, 2)}
- Gong: ${JSON.stringify(this.config.gong, null, 2)}

## Date Format Requirements (CRITICAL)
When calling MCP tools that require date parameters (like \`after\`, \`before\`, \`since\`, \`start_date\`, etc.), you MUST:
- Use ISO 8601 date format: \`YYYY-MM-DD\` (e.g., "2025-12-16")
- NEVER use relative date formats like "-7d", "-3d", "last week", etc. in tool parameters
- Calculate actual dates from the current date

Current date reference:
- Today: ${todayISO}
- 7 days ago: ${sevenDaysAgoISO} (use this for "last 7 days" or "past week")
- 3 days ago: ${threeDaysAgoISO} (use this for "last 3 days")

Example: For "last 7 days", use \`after: "${sevenDaysAgoISO}"\` (NOT "-7d")

Use this configuration to query the appropriate data sources via the available MCP tools.`;
  }

  /**
   * Build tools schema for Claude from MCP tools
   */
  buildToolsSchema() {
    const availableTools = this.mcpClient.getAvailableTools();

    return availableTools.map(tool => ({
      name: tool.name,
      description: tool.schema.description || `Tool from ${tool.server} server`,
      input_schema: tool.schema.inputSchema || {
        type: 'object',
        properties: {},
        required: []
      }
    }));
  }
}
