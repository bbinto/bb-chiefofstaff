import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MCP_DEFAULTS, MIXPANEL_RATE_LIMITS } from './utils/constants.js';
import { MixpanelRateLimiter } from './agent/mixpanel-rate-limiter.js';

/**
 * MCP Client Manager
 * Loads and connects to MCP servers configured in Claude Desktop
 */
export class MCPClientManager {
  constructor(config = null) {
    this.clients = new Map();
    this.tools = new Map();
    this.config = config; // Store config to inject credentials
    // Configurable timeout settings (in milliseconds)
    this.connectionTimeout = parseInt(process.env.MCP_CONNECTION_TIMEOUT || MCP_DEFAULTS.CONNECTION_TIMEOUT, 10);
    this.maxRetries = parseInt(process.env.MCP_MAX_RETRIES || MCP_DEFAULTS.MAX_RETRIES, 10);
    this.retryDelay = parseInt(process.env.MCP_RETRY_DELAY || MCP_DEFAULTS.RETRY_DELAY, 10);
    // Mixpanel rate limiter for enforcing Mixpanel API rate limits
    this.mixpanelRateLimiter = new MixpanelRateLimiter();
  }

  /**
   * Get Mixpanel environment variables from config
   * @param {string} serverName - Name of the MCP server
   * @returns {object} Environment variables for Mixpanel
   */
  getMixpanelEnvVars(serverName) {
    // Check if this is a Mixpanel MCP server
    const isMixpanelServer = serverName.toLowerCase().includes('mixpanel');
    
    if (!isMixpanelServer || !this.config?.mixpanel) {
      return {};
    }

    const mixpanelConfig = this.config.mixpanel;
    const envVars = {};

    // Inject Mixpanel credentials as environment variables
    // The Mixpanel MCP server expects these from config.mixpanel in config.json
    // Common environment variable names that Mixpanel MCP servers might use:
    if (mixpanelConfig.projectId) {
      // Primary: Most common naming convention
      envVars.MIXPANEL_PROJECT_ID = mixpanelConfig.projectId;
      // Alternatives: Different MCP servers might use different names
      envVars.MIXPANEL_PROJECTID = mixpanelConfig.projectId;
      envVars.PROJECT_ID = mixpanelConfig.projectId;
      envVars.MIXPANEL_PROJECT = mixpanelConfig.projectId;
      // Handle the placeholder replacement case
      envVars.__CONFIG_projectId__ = mixpanelConfig.projectId;
    }

    if (mixpanelConfig.username) {
      envVars.MIXPANEL_USERNAME = mixpanelConfig.username;
      envVars.MIXPANEL_USER = mixpanelConfig.username;
      envVars.USERNAME = mixpanelConfig.username;
      envVars.__CONFIG_username__ = mixpanelConfig.username;
    }

    if (mixpanelConfig.pwd) {
      envVars.MIXPANEL_PASSWORD = mixpanelConfig.pwd;
      envVars.MIXPANEL_PWD = mixpanelConfig.pwd;
      envVars.MIXPANEL_SECRET = mixpanelConfig.pwd;
      envVars.PASSWORD = mixpanelConfig.pwd;
      envVars.__CONFIG_pwd__ = mixpanelConfig.pwd;
    }

    // Also set config path variables that some MCP servers might use
    if (this.config) {
      const configPath = path.join(process.cwd(), 'config.json');
      envVars.CONFIG_PATH = configPath;
      envVars.MIXPANEL_CONFIG_PATH = configPath;
    }

    if (Object.keys(envVars).length > 0) {
      console.log(`  📝 Injecting Mixpanel credentials for ${serverName}`);
      console.log(`     Project ID: ${mixpanelConfig.projectId || 'Not set'}`);
    }

    return envVars;
  }

  /**
   * Load MCP configuration from Claude Desktop config
   */
  loadMCPConfig() {
    // Determine the correct path based on the platform
    let configPath = process.env.MCP_CONFIG_PATH;
    
    if (!configPath) {
      const platform = process.platform;
      const homeDir = os.homedir();
      
      if (platform === 'darwin') {
        // macOS
        configPath = path.join(homeDir, 'Library/Application Support/Claude/claude_desktop_config.json');
      } else if (platform === 'linux') {
        // Linux - try both .config/Claude and .config/claude
        const linuxPaths = [
          path.join(homeDir, '.config/Claude/claude_desktop_config.json'),
          path.join(homeDir, '.config/claude/claude_desktop_config.json')
        ];
        for (const p of linuxPaths) {
          if (fs.existsSync(p)) {
            configPath = p;
            break;
          }
        }
        // If neither exists, default to the first one
        if (!configPath) {
          configPath = linuxPaths[0];
        }
      } else if (platform === 'win32') {
        // Windows
        const appData = process.env.APPDATA;
        if (appData) {
          configPath = path.join(appData, 'Claude/claude_desktop_config.json');
        } else {
          configPath = path.join(homeDir, 'AppData/Roaming/Claude/claude_desktop_config.json');
        }
      } else {
        // Fallback for other platforms
        configPath = path.join(homeDir, '.config/Claude/claude_desktop_config.json');
      }
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.mcpServers || {};
    } catch (error) {
      console.warn(`Could not load MCP config from ${configPath}:`, error.message);
      return {};
    }
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wrapper to add timeout to a promise
   */
  async withTimeout(promise, timeoutMs, operationName) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Operation "${operationName}" timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Initialize connections to all configured MCP servers
   * Uses parallel connections with timeout and retry logic
   */
  async initialize() {
    const mcpServers = this.loadMCPConfig();

    console.log(`Found ${Object.keys(mcpServers).length} MCP servers in config`);
    console.log(`Connection timeout: ${this.connectionTimeout}ms, Max retries: ${this.maxRetries}`);

    // Connect to all servers in parallel with timeout and retry handling
    const connectionPromises = Object.entries(mcpServers).map(([serverName, serverConfig]) =>
      this.connectToServerWithRetry(serverName, serverConfig)
    );

    // Use allSettled to wait for all connections (successful or failed)
    const results = await Promise.allSettled(connectionPromises);

    // Log results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`\nConnection Summary:`);
    console.log(`  ✓ Successfully connected: ${successful}/${Object.keys(mcpServers).length}`);
    if (failed > 0) {
      console.log(`  ✗ Failed connections: ${failed}/${Object.keys(mcpServers).length}`);
      // Log details of failed connections
      const serverNames = Object.keys(mcpServers);
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const serverName = serverNames[index];
          console.error(`    - ${serverName}: ${result.reason?.message || result.reason || 'Unknown error'}`);
        }
      });
    }
    console.log(`\nTotal MCP servers connected: ${this.clients.size}`);
    console.log(`Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
  }

  /**
   * Connect to a server with retry logic and exponential backoff
   */
  async connectToServerWithRetry(serverName, serverConfig) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          const delay = this.retryDelay * Math.pow(2, attempt - 2); // Exponential backoff
          console.log(`  Retrying ${serverName} (attempt ${attempt}/${this.maxRetries}) after ${delay}ms...`);
          await this.sleep(delay);
        }
        
        await this.connectToServer(serverName, serverConfig);
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          console.warn(`  Attempt ${attempt} failed for ${serverName}: ${error.message}`);
        }
      }
    }
    
    // All retries exhausted
    throw new Error(`Failed to connect to ${serverName} after ${this.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Connect to a single MCP server with timeout handling
   */
  async connectToServer(serverName, serverConfig) {
    const { command, args = [], env = {} } = serverConfig;

    // Inject Mixpanel credentials from config if this is a Mixpanel MCP server
    const mixpanelEnv = this.getMixpanelEnvVars(serverName);
    
    const transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env, NODE_NO_WARNINGS: '1', ...env, ...mixpanelEnv }
    });

    const client = new Client({
      name: `chief-of-staff-${serverName}`,
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    // Connect with timeout
    try {
      await this.withTimeout(
        client.connect(transport),
        this.connectionTimeout,
        `connect to ${serverName}`
      );
    } catch (error) {
      // Clean up transport if connection failed
      try {
        await transport.close();
      } catch (closeError) {
        // Ignore close errors
      }
      throw new Error(`MCP error -32001: Request timed out - ${error.message}`);
    }

    this.clients.set(serverName, client);

    // Load available tools from this server with timeout
    let toolsList;
    try {
      toolsList = await this.withTimeout(
        client.listTools(),
        this.connectionTimeout,
        `list tools from ${serverName}`
      );
    } catch (error) {
      // If listing tools fails, remove the client but don't throw
      // (connection succeeded but tool listing failed)
      this.clients.delete(serverName);
      
      // Provide more detailed error information for debugging
      const errorDetails = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      };
      
      // Check if this is a remote server error (mcp-remote package)
      const isRemoteError = (error.message && (
        error.message.includes('mcp-remote') || 
        error.message.includes('remote server') ||
        error.message.includes('Error from remote server')
      )) || (error.stack && error.stack.includes('mcp-remote'));
      
      if (isRemoteError) {
        console.error(`\n⚠️  Remote MCP server error for ${serverName}:`);
        console.error(`   This appears to be a remote server connection issue.`);
        console.error(`   Error: ${error.message}`);
        console.error(`   Check your remote server configuration and network connectivity.`);
        console.error(`   The remote server may be returning an invalid response format.`);
      }
      
      throw new Error(`MCP error -32001: Request timed out - Failed to list tools: ${error.message}`);
    }

    // Validate toolsList response structure
    if (!toolsList) {
      this.clients.delete(serverName);
      throw new Error(`MCP error: Received undefined response from ${serverName} when listing tools`);
    }

    // Handle different response formats
    const tools = toolsList.tools || toolsList || [];
    if (!Array.isArray(tools)) {
      this.clients.delete(serverName);
      throw new Error(`MCP error: Invalid tools response format from ${serverName}. Expected array, got ${typeof tools}`);
    }

    // Register tools with error handling for individual tools
    let registeredCount = 0;
    const errors = [];
    tools.forEach(tool => {
      try {
        if (!tool || !tool.name) {
          console.warn(`  ⚠️  Skipping invalid tool from ${serverName}: missing name property`);
          return;
        }
        this.tools.set(tool.name, { serverName, client, schema: tool });
        registeredCount++;
      } catch (error) {
        errors.push(`Tool registration error: ${error.message}`);
        console.warn(`  ⚠️  Failed to register tool from ${serverName}: ${error.message}`);
      }
    });

    if (registeredCount === 0 && tools.length > 0) {
      // All tools failed to register
      this.clients.delete(serverName);
      throw new Error(`MCP error: Failed to register any tools from ${serverName}. Errors: ${errors.join('; ')}`);
    }

    if (errors.length > 0) {
      console.warn(`  ⚠️  ${serverName}: Registered ${registeredCount}/${tools.length} tools (${errors.length} failed)`);
    } else {
      console.log(`  ✓ Connected to ${serverName}: ${registeredCount} tools available`);
    }
  }

  /**
   * Call an MCP tool with rate limiting for Mixpanel tools
   */
  async callTool(toolName, args = {}) {
    // Debug: Log tool name details
    console.log(`\n📞 MCP callTool received: "${toolName}" (length: ${toolName.length}, first char code: ${toolName.charCodeAt(0)})`);

    const toolInfo = this.tools.get(toolName);
    if (!toolInfo) {
      // Debug: Show available tool names that start with similar prefixes
      const similarTools = Array.from(this.tools.keys()).filter(name =>
        name.includes('Slack') || name.includes('conversations_search')
      );
      console.error(`\n❌ Tool "${toolName}" not found!`);
      console.error(`📋 Similar available tools:`, similarTools.slice(0, 5).join(', '));
      console.error(`📋 First 5 registered tools:`, Array.from(this.tools.keys()).slice(0, 5).join(', '));
      throw new Error(`Tool ${toolName} not found. Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
    }

    // Check if this is a Mixpanel tool
    const isMixpanel = this.isMixpanelTool(toolName, toolInfo.serverName);

    // Log JQL queries for Jira tools
    if (this.isJiraTool(toolName, toolInfo.serverName)) {
      const jql = args.jql || args.query || args.jqlQuery;
      if (jql) {
        console.log(`\n[Jira JQL] ${toolName}:`);
        console.log(`  ${jql}\n`);
      } else {
        console.log(`\n[Jira Tool] ${toolName} called with args:`, JSON.stringify(args, null, 2));
      }
    }

    // Log Mixpanel tool calls
    if (isMixpanel) {
      console.log(`\n[Mixpanel Tool] ${toolName} - Applying rate limiting...`);
    }

    const { client } = toolInfo;

    // For Mixpanel tools, use rate limiting with retry logic for 429 errors
    if (isMixpanel) {
      let lastError = null;
      
      for (let attempt = 0; attempt < MIXPANEL_RATE_LIMITS.RETRY_MAX_ATTEMPTS; attempt++) {
        try {
          // Use rate limiter to wrap the tool call
          const result = await this.mixpanelRateLimiter.withRateLimit(
            () => client.callTool({ name: toolName, arguments: args }),
            toolName
          );

          // Log results for Mixpanel tools
          console.log(`[Mixpanel Tool] ${toolName} completed successfully`);

          return result;
        } catch (error) {
          lastError = error;
          
          // Check if it's a 429 error
          if (this.mixpanelRateLimiter.is429Error(error)) {
            if (attempt < MIXPANEL_RATE_LIMITS.RETRY_MAX_ATTEMPTS - 1) {
              // Handle 429 with exponential backoff
              await this.mixpanelRateLimiter.handle429Error(attempt);
              continue; // Retry
            } else {
              // Out of retries
              console.error(`[Mixpanel Tool] ${toolName} failed after ${MIXPANEL_RATE_LIMITS.RETRY_MAX_ATTEMPTS} attempts due to rate limiting`);
              throw new Error(`Mixpanel rate limit exceeded after ${MIXPANEL_RATE_LIMITS.RETRY_MAX_ATTEMPTS} retries: ${error.message}`);
            }
          } else {
            // Not a 429 error, re-throw immediately
            throw error;
          }
        }
      }
      
      // Should not reach here, but handle it just in case
      throw lastError || new Error(`Failed to call ${toolName} after ${MIXPANEL_RATE_LIMITS.RETRY_MAX_ATTEMPTS} attempts`);
    } else {
      // For non-Mixpanel tools, call directly without rate limiting
      const result = await client.callTool({ name: toolName, arguments: args });

      // Log results for Jira tools
      if (this.isJiraTool(toolName, toolInfo.serverName)) {
        this.logJiraResults(toolName, result);
      }

      return result;
    }
  }

  /**
   * Check if a tool is a Jira-related tool
   */
  isJiraTool(toolName, serverName) {
    const jiraIndicators = [
      'jira',
      'atlassian',
      'jql'
    ];
    
    const nameLower = toolName.toLowerCase();
    const serverLower = (serverName || '').toLowerCase();
    
    return jiraIndicators.some(indicator => 
      nameLower.includes(indicator) || serverLower.includes(indicator)
    );
  }

  /**
   * Check if a tool is a Mixpanel-related tool
   * @param {string} toolName - Name of the tool
   * @param {string} serverName - Name of the server
   * @returns {boolean} True if this is a Mixpanel tool
   */
  isMixpanelTool(toolName, serverName) {
    const mixpanelIndicators = [
      'mixpanel',
      'query_mixpanel',
      'mixpanel_query'
    ];
    
    const nameLower = toolName.toLowerCase();
    const serverLower = (serverName || '').toLowerCase();
    
    return mixpanelIndicators.some(indicator => 
      nameLower.includes(indicator) || serverLower.includes(indicator)
    );
  }

  /**
   * Log Jira tool results in a readable format
   */
  logJiraResults(toolName, result) {
    try {
      // Parse result if it's a string
      let parsedResult = result;
      if (typeof result === 'string') {
        try {
          parsedResult = JSON.parse(result);
        } catch (e) {
          // If parsing fails, result might be plain text
          parsedResult = result;
        }
      }

      // Handle different result formats
      let issues = [];
      let totalCount = 0;

      if (Array.isArray(parsedResult)) {
        issues = parsedResult;
        totalCount = parsedResult.length;
      } else if (parsedResult && typeof parsedResult === 'object') {
        // Check for common Jira response structures
        if (parsedResult.issues && Array.isArray(parsedResult.issues)) {
          issues = parsedResult.issues;
          totalCount = parsedResult.total || parsedResult.issues.length;
        } else if (parsedResult.items && Array.isArray(parsedResult.items)) {
          issues = parsedResult.items;
          totalCount = parsedResult.total || parsedResult.items.length;
        } else if (parsedResult.results && Array.isArray(parsedResult.results)) {
          issues = parsedResult.results;
          totalCount = parsedResult.total || parsedResult.results.length;
        } else {
          // Single issue or other structure
          totalCount = 1;
          issues = [parsedResult];
        }
      }

      // Log summary
      if (totalCount > 0) {
        console.log(`[Jira Results] ${toolName}:`);
        console.log(`  ✓ Found ${totalCount} issue(s)`);
        
        // Log first few issue keys/titles for quick reference
        if (issues.length > 0 && issues.length <= 10) {
          const summaries = issues.slice(0, 5).map(issue => {
            const key = issue.key || issue.id || issue.issueKey || 'N/A';
            const title = issue.fields?.summary || issue.summary || issue.title || 'No title';
            return `    - ${key}: ${title.substring(0, 60)}${title.length > 60 ? '...' : ''}`;
          });
          if (summaries.length > 0) {
            console.log(`  Top ${summaries.length} issue(s):`);
            summaries.forEach(summary => console.log(summary));
          }
        } else if (issues.length > 10) {
          const summaries = issues.slice(0, 5).map(issue => {
            const key = issue.key || issue.id || issue.issueKey || 'N/A';
            const title = issue.fields?.summary || issue.summary || issue.title || 'No title';
            return `    - ${key}: ${title.substring(0, 60)}${title.length > 60 ? '...' : ''}`;
          });
          console.log(`  Top 5 issues (showing ${totalCount} total):`);
          summaries.forEach(summary => console.log(summary));
        }
        console.log(''); // Empty line for readability
      } else {
        console.log(`[Jira Results] ${toolName}: No issues found\n`);
      }
    } catch (error) {
      // If logging fails, don't break the tool call
      console.log(`[Jira Results] ${toolName}: (unable to parse results)\n`);
    }
  }

  /**
   * Get all available tools
   */
  getAvailableTools() {
    return Array.from(this.tools.entries()).map(([name, info]) => ({
      name,
      server: info.serverName,
      schema: info.schema
    }));
  }

  /**
   * Close all connections
   */
  async close() {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
    this.tools.clear();
  }
}
