import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * MCP Client Manager
 * Loads and connects to MCP servers configured in Claude Desktop
 */
export class MCPClientManager {
  constructor() {
    this.clients = new Map();
    this.tools = new Map();
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
   * Initialize connections to all configured MCP servers
   */
  async initialize() {
    const mcpServers = this.loadMCPConfig();

    console.log(`Found ${Object.keys(mcpServers).length} MCP servers in config`);

    for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
      try {
        await this.connectToServer(serverName, serverConfig);
      } catch (error) {
        console.error(`Failed to connect to MCP server ${serverName}:`, error.message);
      }
    }

    console.log(`Successfully connected to ${this.clients.size} MCP servers`);
    console.log(`Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
  }

  /**
   * Connect to a single MCP server
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

    await client.connect(transport);
    this.clients.set(serverName, client);

    // Load available tools from this server
    const toolsList = await client.listTools();
    toolsList.tools.forEach(tool => {
      this.tools.set(tool.name, { serverName, client, schema: tool });
    });

    console.log(`Connected to ${serverName}: ${toolsList.tools.length} tools available`);
  }

  /**
   * Call an MCP tool
   */
  async callTool(toolName, args = {}) {
    const toolInfo = this.tools.get(toolName);
    if (!toolInfo) {
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
