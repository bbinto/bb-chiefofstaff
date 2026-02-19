#!/usr/bin/env node

/**
 * Mixpanel MCP Test Script
 * Tests connectivity to Mixpanel MCP server and lists available tools
 */

import 'dotenv/config';
import { MCPClientManager } from './src/mcp-client.js';
import { ConfigManager } from './src/config/config-manager.js';

async function testMixpanelMCP() {
  console.log('='.repeat(80));
  console.log('MIXPANEL MCP TEST');
  console.log('='.repeat(80));
  console.log('');

  // Load config to inject Mixpanel credentials
  const configManager = new ConfigManager();
  let config = null;
  try {
    config = configManager.loadConfig();
    if (config?.mixpanel) {
      console.log('✓ Mixpanel config found in config.json');
      console.log(`  Project ID: ${config.mixpanel.projectId || 'Not set'}`);
      console.log(`  Username: ${config.mixpanel.username ? 'Set' : 'Not set'}`);
      console.log(`  Password: ${config.mixpanel.pwd ? 'Set' : 'Not set'}\n`);
    } else {
      console.log('⚠ No Mixpanel config found in config.json\n');
    }
  } catch (error) {
    console.log(`⚠ Could not load config.json: ${error.message}\n`);
  }

  const client = new MCPClientManager(config);

  try {
    console.log('Initializing MCP client...\n');
    await client.initialize();

    console.log('\n' + '='.repeat(80));
    console.log('SEARCHING FOR MIXPANEL MCP TOOLS');
    console.log('='.repeat(80));
    console.log('');

    const allTools = client.getAvailableTools();
    
    // Find Mixpanel tools
    const mixpanelTools = allTools.filter(tool => 
      tool.name.toLowerCase().includes('mixpanel') ||
      tool.server.toLowerCase().includes('mixpanel')
    );

    if (mixpanelTools.length === 0) {
      console.log('⚠ No Mixpanel MCP tools found!');
      console.log('\nPossible reasons:');
      console.log('1. Mixpanel MCP server not configured in Claude Desktop');
      console.log('2. Mixpanel MCP server not started or failed to connect');
      console.log('3. Server name doesn\'t contain "mixpanel"');
      console.log('\nAvailable MCP servers:');
      const servers = [...new Set(allTools.map(t => t.server))];
      servers.forEach(server => console.log(`  - ${server}`));
      console.log('\nAll available tools (first 20):');
      allTools.slice(0, 20).forEach(tool => {
        console.log(`  - ${tool.name} (${tool.server})`);
      });
    } else {
      // Group by server
      const toolsByServer = {};
      mixpanelTools.forEach(tool => {
        if (!toolsByServer[tool.server]) {
          toolsByServer[tool.server] = [];
        }
        toolsByServer[tool.server].push(tool);
      });

      Object.entries(toolsByServer).forEach(([server, serverTools]) => {
        console.log(`\n📦 ${server}`);
        console.log('-'.repeat(40));
        serverTools.forEach(tool => {
          console.log(`\n  • ${tool.name}`);
          if (tool.schema.description) {
            console.log(`    Description: ${tool.schema.description}`);
          }
          if (tool.schema.inputSchema) {
            console.log(`    Input Schema:`);
            console.log(JSON.stringify(tool.schema.inputSchema, null, 6));
          }
        });
      });

      console.log('\n' + '='.repeat(80));
      console.log('TESTING MIXPANEL TOOLS');
      console.log('='.repeat(80));
      console.log('');

      // Try to call each tool with minimal/no parameters to see what happens
      for (const tool of mixpanelTools) {
        console.log(`\n🔧 Testing: ${tool.name}`);
        console.log('-'.repeat(40));
        
        try {
          // Get the input schema to understand required parameters
          const inputSchema = tool.schema.inputSchema;
          const requiredParams = inputSchema?.required || [];
          const properties = inputSchema?.properties || {};

          console.log(`  Required parameters: ${requiredParams.length > 0 ? requiredParams.join(', ') : 'None'}`);
          console.log(`  Available parameters: ${Object.keys(properties).join(', ') || 'None'}`);

          // Try calling with empty args if no required params, or show what's needed
          if (requiredParams.length === 0) {
            console.log('  Attempting call with no parameters...');
            const result = await client.callTool(tool.name, {});
            console.log('  ✅ Success!');
            console.log(`  Result type: ${Array.isArray(result) ? 'array' : typeof result}`);
            if (typeof result === 'object' && result !== null) {
              console.log(`  Result keys: ${Object.keys(result).slice(0, 5).join(', ')}${Object.keys(result).length > 5 ? '...' : ''}`);
            }
            if (Array.isArray(result)) {
              console.log(`  Result length: ${result.length}`);
              if (result.length > 0) {
                console.log(`  First item keys: ${Object.keys(result[0]).slice(0, 5).join(', ')}`);
              }
            }
          } else {
            console.log(`  ⚠️  Requires parameters: ${requiredParams.join(', ')}`);
            console.log('  Skipping test call (needs parameters)');
            if (properties[requiredParams[0]]) {
              console.log(`  Example for "${requiredParams[0]}": ${JSON.stringify(properties[requiredParams[0]], null, 4)}`);
            }
          }
        } catch (error) {
          console.log(`  ❌ Error: ${error.message}`);
          if (error.message.includes('required') || error.message.includes('missing')) {
            console.log('  (This is expected if parameters are required)');
          }
        }
      }

      console.log('\n' + '='.repeat(80));
      console.log(`✓ Found ${mixpanelTools.length} Mixpanel tool(s) from ${Object.keys(toolsByServer).length} server(s)`);
      console.log('='.repeat(80));
    }

    await client.close();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack trace:', error.stack);
    await client.close();
    process.exit(1);
  }
}

testMixpanelMCP();
