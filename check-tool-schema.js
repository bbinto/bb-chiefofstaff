#!/usr/bin/env node

import 'dotenv/config';
import { MCPClientManager } from './src/mcp-client.js';

async function checkSchema() {
  const client = new MCPClientManager();
  try {
    await client.initialize();
    
    const tools = client.getAvailableTools();
    const slackTools = tools.filter(t => 
      t.name.toLowerCase().includes('conversation')
    );
    
    console.log('Slack conversation tools and their schemas:\n');
    slackTools.forEach(tool => {
      console.log(`\n${tool.name}:`);
      console.log(JSON.stringify(tool.schema, null, 2));
    });
    
    await client.close();
  } catch (error) {
    console.error('Error:', error.message);
    await client.close();
    process.exit(1);
  }
}

checkSchema();
