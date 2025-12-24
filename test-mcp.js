#!/usr/bin/env node

/**
 * MCP Connection Test Script
 * Tests connectivity to MCP servers and lists available tools
 */

import 'dotenv/config';
import { MCPClientManager } from './src/mcp-client.js';

async function testMCPConnection() {
  console.log('='.repeat(80));
  console.log('MCP CONNECTION TEST');
  console.log('='.repeat(80));
  console.log('');

  const client = new MCPClientManager();

  try {
    console.log('Initializing MCP client...\n');
    await client.initialize();

    console.log('\n' + '='.repeat(80));
    console.log('AVAILABLE TOOLS');
    console.log('='.repeat(80));
    console.log('');

    const tools = client.getAvailableTools();

    if (tools.length === 0) {
      console.log('⚠ No MCP tools found!');
      console.log('\nPossible reasons:');
      console.log('1. Claude Desktop MCP config not found');
      console.log('2. No MCP servers configured in Claude Desktop');
      console.log('3. Incorrect MCP_CONFIG_PATH in .env');
      console.log('\nCheck your MCP_CONFIG_PATH:');
      console.log(`  ${process.env.MCP_CONFIG_PATH || 'Not set (using default)'}`);
    } else {
      // Group tools by server
      const toolsByServer = {};
      tools.forEach(tool => {
        if (!toolsByServer[tool.server]) {
          toolsByServer[tool.server] = [];
        }
        toolsByServer[tool.server].push(tool);
      });

      Object.entries(toolsByServer).forEach(([server, serverTools]) => {
        console.log(`\n📦 ${server}`);
        console.log('-'.repeat(40));
        serverTools.forEach(tool => {
          console.log(`  • ${tool.name}`);
          if (tool.schema.description) {
            console.log(`    ${tool.schema.description}`);
          }
        });
      });

      console.log('\n' + '='.repeat(80));
      console.log(`✓ Total: ${tools.length} tools from ${Object.keys(toolsByServer).length} servers`);
      console.log('='.repeat(80));
    }

    await client.close();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

testMCPConnection();
