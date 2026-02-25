#!/usr/bin/env node

/**
 * Refresh MCP Server Connection
 * Closes and reinitializes MCP connections to refresh cached data
 */

import 'dotenv/config';
import { MCPClientManager } from './src/mcp-client.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function refreshMCPConnection() {
  console.log('='.repeat(80));
  console.log('REFRESHING MCP SERVER CONNECTIONS');
  console.log('='.repeat(80));
  console.log('');

  const client = new MCPClientManager();

  try {
    console.log('Step 1: Closing existing MCP connections...');
    // Close if any connections exist (in case script is run multiple times)
    await client.close().catch(() => {}); // Ignore errors if not initialized
    
    console.log('✓ Connections closed\n');

    console.log('Step 2: Reinitializing MCP connections...');
    await client.initialize();

    console.log('\n' + '='.repeat(80));
    console.log('✓ MCP CONNECTIONS REFRESHED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log('');
    console.log(`Total MCP servers connected: ${client.clients.size}`);
    
    const tools = client.getAvailableTools();
    console.log(`Available tools: ${tools.length}`);
    
    // Show Slack-specific info
    const slackTools = tools.filter(t => t.server === 'Slack');
    if (slackTools.length > 0) {
      console.log(`\n📦 Slack MCP Server: ${slackTools.length} tools available`);
    }

    await client.close();

  } catch (error) {
    console.error('\n❌ Error refreshing MCP connections:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

/**
 * Clear Slack MCP cache files (channels and users cache)
 * This forces Slack MCP server to refetch channel/user lists on next connection
 */
function clearSlackCache() {
  const cacheDir = path.join(os.homedir(), 'Library/Caches/slack-mcp-server');
  const channelCacheFile = path.join(cacheDir, 'channels_cache_v2.json');
  const usersCacheFile = path.join(cacheDir, 'users_cache.json');

  console.log('='.repeat(80));
  console.log('CLEARING SLACK MCP CACHE FILES');
  console.log('='.repeat(80));
  console.log('');

  let cleared = false;

  if (fs.existsSync(channelCacheFile)) {
    try {
      fs.unlinkSync(channelCacheFile);
      console.log(`✓ Deleted: ${channelCacheFile}`);
      cleared = true;
    } catch (error) {
      console.error(`✗ Failed to delete channel cache: ${error.message}`);
    }
  } else {
    console.log(`ℹ Channel cache not found: ${channelCacheFile}`);
  }

  if (fs.existsSync(usersCacheFile)) {
    try {
      fs.unlinkSync(usersCacheFile);
      console.log(`✓ Deleted: ${usersCacheFile}`);
      cleared = true;
    } catch (error) {
      console.error(`✗ Failed to delete users cache: ${error.message}`);
    }
  } else {
    console.log(`ℹ Users cache not found: ${usersCacheFile}`);
  }

  if (cleared) {
    console.log('\n✓ Slack cache cleared! Channels and users will be refetched on next connection.');
  } else {
    console.log('\nℹ No cache files found to delete.');
  }
}

// Main execution
const command = process.argv[2];

if (command === 'clear-cache' || command === '--clear-cache' || command === '-c') {
  // Clear Slack cache files
  clearSlackCache();
  console.log('\n💡 Tip: Run "node refresh-mcp.js" to reinitialize connections with fresh cache.');
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log('Usage: node refresh-mcp.js [command]');
  console.log('');
  console.log('Commands:');
  console.log('  (no command)     - Refresh MCP connections (close and reinitialize)');
  console.log('  clear-cache      - Clear Slack MCP cache files (forces refetch on next connection)');
  console.log('  help             - Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node refresh-mcp.js              # Refresh connections');
  console.log('  node refresh-mcp.js clear-cache  # Clear Slack cache files');
  console.log('');
  console.log('Note: To fully refresh Slack MCP:');
  console.log('  1. Clear cache: node refresh-mcp.js clear-cache');
  console.log('  2. Refresh connections: node refresh-mcp.js');
  console.log('  OR restart Claude Desktop (refreshes all MCP servers)');
} else {
  // Default: refresh connections
  refreshMCPConnection();
}
