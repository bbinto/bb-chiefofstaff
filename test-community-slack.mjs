/**
 * Pre-warm community Slack MCP server caches.
 * Run this once to build user caches for all three community workspaces.
 * Subsequent agent runs will be fast once caches are populated.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TIMEOUT_MS = 120000; // 2 minutes — large workspaces need time to cache users

const configPath = path.join(os.homedir(), '.config/claude/claude_desktop_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const communityServers = ['Slack-LannysNewsletter', 'Slack-WomenInProduct', 'Slack-Rand'];

async function testServer(serverName) {
  const serverConfig = config.mcpServers[serverName];
  if (!serverConfig) {
    console.error(`  ✗ ${serverName}: not found in config`);
    return false;
  }

  const { command, args = [], env = {} } = serverConfig;
  const transport = new StdioClientTransport({
    command,
    args,
    env: { ...process.env, NODE_NO_WARNINGS: '1', ...env }
  });

  const client = new Client({ name: 'test', version: '1.0' }, { capabilities: {} });

  try {
    console.log(`  Connecting to ${serverName} (may take up to 2 min for user cache)...`);
    await Promise.race([
      client.connect(transport),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout after ${TIMEOUT_MS/1000}s`)), TIMEOUT_MS))
    ]);

    const toolsList = await client.listTools();
    const toolNames = toolsList.tools.map(t => t.name);
    console.log(`  ✓ ${serverName}: connected, ${toolNames.length} tools (${toolNames.slice(0, 3).join(', ')}...)`);
    await client.close();
    return true;
  } catch (e) {
    console.error(`  ✗ ${serverName}: ${e.message}`);
    try { await transport.close(); } catch {}
    return false;
  }
}

console.log('='.repeat(60));
console.log('Community Slack MCP Pre-warm Test');
console.log('='.repeat(60));

for (const server of communityServers) {
  console.log(`\n[${server}]`);
  await testServer(server);
}

console.log('\nDone. User caches are now populated — subsequent agent runs will connect faster.');
