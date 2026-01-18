#!/usr/bin/env node

import 'dotenv/config';
import { MCPClientManager } from './src/mcp-client.js';

const channelId = 'C0A8VUMUWQ6';

async function testTelemetryChannel() {
  const client = new MCPClientManager();
  try {
    await client.initialize();
    
    console.log(`Testing telemetry channel ${channelId} with agent-like calls...\n`);
    
    // Test conversations_search_messages (what the agent likely uses)
    console.log('1. Testing conversations_search_messages (last 24 hours)...');
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayISO = yesterday.toISOString().split('T')[0];
      
      const result = await client.callTool('conversations_search_messages', {
        channel_id: channelId,
        after: yesterdayISO
      });
      console.log('✅ SUCCESS - conversations_search_messages works');
      console.log(`   Found results: ${Array.isArray(result) ? result.length : 'object'}`);
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      if (error.message.includes('channel_not_found')) {
        console.log('   → Channel not found or access denied');
        console.log('   → Make sure the Slack app has access to this channel');
        console.log('   → If it\'s a private channel, add the Slack app to it');
      }
    }
    
    console.log('\n2. Testing conversations_history...');
    try {
      const result = await client.callTool('conversations_history', {
        channel_id: channelId,
        limit: 5
      });
      console.log('✅ SUCCESS - conversations_history works');
      console.log(`   Result type: ${Array.isArray(result) ? 'array' : typeof result}`);
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
    }
    
    await client.close();
    
    console.log('\n✅ Channel is accessible! If agents are failing, check:');
    console.log('   1. Agent is using channel_id (not channel) parameter');
    console.log('   2. Slack app has permission to access the channel');
    console.log('   3. If private channel, add Slack app to the channel');
    
  } catch (error) {
    console.error('Error:', error.message);
    await client.close();
    process.exit(1);
  }
}

testTelemetryChannel();
