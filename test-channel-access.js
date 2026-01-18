#!/usr/bin/env node

import 'dotenv/config';
import { MCPClientManager } from './src/mcp-client.js';

const channelId = 'C0A8VUMUWQ6';

async function testAccess() {
  const client = new MCPClientManager();
  try {
    console.log('Initializing MCP client...\n');
    await client.initialize();
    
    console.log(`Testing access to channel ${channelId}...\n`);
    
    // Test 1: Try conversations_history
    console.log('Test 1: conversations_history (direct API call)...');
    try {
      const result = await client.callTool('conversations_history', {
        channel_id: channelId,
        limit: 1
      });
      console.log('✅ SUCCESS - Channel is accessible via conversations_history');
      console.log(`   Result type: ${Array.isArray(result) ? 'array' : typeof result}`);
      if (Array.isArray(result) && result.length > 0) {
        console.log(`   Found ${result.length} message(s)`);
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      if (error.message.includes('channel_not_found')) {
        console.log('   → Channel not found or you don\'t have access');
      } else if (error.message.includes('not_authed')) {
        console.log('   → Authentication issue');
      } else if (error.message.includes('account_inactive')) {
        console.log('   → Account inactive');
      } else if (error.message.includes('missing_scope')) {
        console.log('   → Missing required Slack permissions/scopes');
      }
    }
    
    console.log('\n');
    
    // Test 2: Try channels_list to see if it's in cache
    console.log('Test 2: channels_list (cached channels)...');
    try {
      const channels = await client.callTool('channels_list', {});
      const channelArray = Array.isArray(channels) ? channels : 
                          (channels.channels || channels.items || []);
      
      const found = channelArray.find(ch => 
        ch.id === channelId || 
        ch.channel_id === channelId ||
        ch.channel?.id === channelId
      );
      
      if (found) {
        console.log('✅ Channel found in channels_list cache');
        console.log(`   Channel name: ${found.name || found.channel?.name || 'N/A'}`);
        console.log(`   Is private: ${found.is_private || found.isPrivate || 'N/A'}`);
      } else {
        console.log(`⚠️  Channel NOT in channels_list cache (${channelArray.length} channels cached)`);
        console.log('   → Cache may need to refresh, or channel is private/restricted');
      }
    } catch (error) {
      console.log(`❌ Error checking channels_list: ${error.message}`);
    }
    
    await client.close();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await client.close();
    process.exit(1);
  }
}

testAccess();
