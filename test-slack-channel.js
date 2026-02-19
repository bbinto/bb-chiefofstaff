#!/usr/bin/env node

/**
 * Test Slack Channel Access via MCP
 * Tests if a specific Slack channel can be accessed through MCP
 */

import 'dotenv/config';
import { MCPClientManager } from './src/mcp-client.js';

async function testSlackChannel(channelId) {
  console.log('='.repeat(80));
  console.log(`TESTING SLACK CHANNEL ACCESS: ${channelId}`);
  console.log('='.repeat(80));
  console.log('');

  const client = new MCPClientManager();

  try {
    console.log('Initializing MCP client...\n');
    await client.initialize();

    // Get available Slack tools
    const tools = client.getAvailableTools();
    const slackTools = tools.filter(tool => 
      tool.server === 'slack' || tool.name.includes('slack') || tool.name.includes('conversation')
    );

    console.log('\n' + '='.repeat(80));
    console.log('AVAILABLE SLACK TOOLS');
    console.log('='.repeat(80));
    slackTools.forEach(tool => {
      console.log(`  • ${tool.name} (${tool.server})`);
      if (tool.schema.description) {
        console.log(`    ${tool.schema.description}`);
      }
    });

    if (slackTools.length === 0) {
      console.log('⚠ No Slack MCP tools found!');
      console.log('Make sure Slack MCP server is configured in Claude Desktop.');
      await client.close();
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log('TESTING CHANNEL ACCESS');
    console.log('='.repeat(80));
    console.log('');

    // Test 1: Try to list channels (if tool exists)
    const listChannelsTool = slackTools.find(t => 
      t.name.includes('list') && t.name.includes('channel')
    );
    if (listChannelsTool) {
      console.log(`\n1. Testing ${listChannelsTool.name}...`);
      try {
        const result = await client.callTool(listChannelsTool.name, {});
        console.log('   ✓ Tool executed successfully');
        // Check if our channel is in the list
        const resultStr = JSON.stringify(result).toLowerCase();
        if (resultStr.includes(channelId.toLowerCase())) {
          console.log(`   ✓ Channel ${channelId} found in channel list!`);
        } else {
          console.log(`   ⚠ Channel ${channelId} not found in channel list`);
        }
      } catch (error) {
        console.log(`   ✗ Error: ${error.message}`);
      }
    }

    // Test 2: Try conversations_history with channel_id (recommended approach)
    const conversationsHistoryTool = slackTools.find(t => 
      t.name === 'conversations_history' || 
      t.name.includes('history') || 
      t.name.includes('messages')
    );
    if (conversationsHistoryTool) {
      console.log(`\n2. Testing ${conversationsHistoryTool.name} with channel_id=${channelId}...`);
      try {
        // Get yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const afterDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
        
        const result = await client.callTool(conversationsHistoryTool.name, {
          channel_id: channelId,
          limit: 10,
          after: afterDate
        });
        console.log('   ✓ Tool executed successfully!');
        console.log(`   ✓ Channel ${channelId} is accessible via MCP`);
        if (result && typeof result === 'object') {
          const messages = result.messages || result.items || [];
          console.log(`   ℹ Found ${messages.length} message(s) in the last 24 hours`);
          if (messages.length > 0) {
            console.log(`   ℹ Sample message: ${JSON.stringify(messages[0]).substring(0, 100)}...`);
          }
        }
      } catch (error) {
        console.log(`   ✗ Error: ${error.message}`);
        console.log(`   ✗ Channel ${channelId} may not be accessible via MCP`);
        if (error.message.includes('not found')) {
          console.log(`   ℹ This could mean:`);
          console.log(`     - The channel ID is incorrect`);
          console.log(`     - The MCP server doesn't have access to this channel`);
          console.log(`     - The channel needs to be added to the MCP server's workspace`);
        }
      }
    } else {
      console.log('\n2. ⚠ conversations_history tool not found');
    }

    // Test 3: Try slack_search if available
    const searchTool = slackTools.find(t => 
      t.name.includes('search') && t.name.includes('slack')
    );
    if (searchTool) {
      console.log(`\n3. Testing ${searchTool.name} in channel ${channelId}...`);
      try {
        const result = await client.callTool(searchTool.name, {
          channel_id: channelId,
          query: '*',
          limit: 5
        });
        console.log('   ✓ Tool executed successfully!');
        console.log(`   ✓ Channel ${channelId} is accessible via search`);
      } catch (error) {
        console.log(`   ✗ Error: ${error.message}`);
      }
    }

    // Test 4: Try get_channel_info if available
    const channelInfoTool = slackTools.find(t => 
      t.name.includes('channel') && (t.name.includes('info') || t.name.includes('get'))
    );
    if (channelInfoTool) {
      console.log(`\n4. Testing ${channelInfoTool.name} for channel ${channelId}...`);
      try {
        const result = await client.callTool(channelInfoTool.name, {
          channel_id: channelId
        });
        console.log('   ✓ Tool executed successfully!');
        console.log(`   ✓ Channel info retrieved: ${JSON.stringify(result).substring(0, 200)}...`);
      } catch (error) {
        console.log(`   ✗ Error: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('RECOMMENDATIONS');
    console.log('='.repeat(80));
    console.log('');
    console.log('If channel access failed:');
    console.log('1. Verify the channel ID is correct (starts with "C")');
    console.log('2. Check if the Slack MCP server has access to this workspace');
    console.log('3. Ensure the channel exists and you have permission to access it');
    console.log('4. Try refreshing the MCP server connection');
    console.log('5. Check Claude Desktop MCP configuration for Slack server');
    console.log('');

    await client.close();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Get channel ID from command line or use default
const channelId = process.argv[2] || 'C0A951UKWHL';

if (!channelId.startsWith('C')) {
  console.error('❌ Error: Channel ID must start with "C"');
  console.error('Usage: node test-slack-channel.js [CHANNEL_ID]');
  process.exit(1);
}

testSlackChannel(channelId);
