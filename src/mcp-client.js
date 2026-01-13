import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MCP_DEFAULTS } from './utils/constants.js';

/**
 * MCP Client Manager
 * Loads and connects to MCP servers configured in Claude Desktop
 */
export class MCPClientManager {
  constructor() {
    this.clients = new Map();
    this.tools = new Map();
    // Configurable timeout settings (in milliseconds)
    this.connectionTimeout = parseInt(process.env.MCP_CONNECTION_TIMEOUT || MCP_DEFAULTS.CONNECTION_TIMEOUT, 10);
    this.maxRetries = parseInt(process.env.MCP_MAX_RETRIES || MCP_DEFAULTS.MAX_RETRIES, 10);
    this.retryDelay = parseInt(process.env.MCP_RETRY_DELAY || MCP_DEFAULTS.RETRY_DELAY, 10);
  }

  /**
   * Load MCP configuration from Claude Desktop config
   */
  loadMCPConfig() {
    const configPath = process.env.MCP_CONFIG_PATH ||
      path.join(os.homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');

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

    const transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env, ...env }
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
      throw new Error(`MCP error -32001: Request timed out - Failed to list tools: ${error.message}`);
    }

    toolsList.tools.forEach(tool => {
      this.tools.set(tool.name, { serverName, client, schema: tool });
    });

    console.log(`  ✓ Connected to ${serverName}: ${toolsList.tools.length} tools available`);
  }

  /**
   * Call an MCP tool
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

    const { client } = toolInfo;
    const result = await client.callTool({ name: toolName, arguments: args });

    // Log results for Jira tools
    if (this.isJiraTool(toolName, toolInfo.serverName)) {
      this.logJiraResults(toolName, result);
    }

    return result;
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
