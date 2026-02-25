#!/usr/bin/env node
/**
 * Test the get_current_time tool
 */
import { ToolHandler } from './src/agent/tool-handler.js';

async function runTests() {
  console.log('Testing get_current_time tool...\n');

  const toolHandler = new ToolHandler({});

  // Test 1: Verify tool is in schema
  const schema = toolHandler.buildCustomToolsSchema();
  const getCurrentTimeTool = schema.find(t => t.name === 'get_current_time');

  if (getCurrentTimeTool) {
    console.log('✅ get_current_time tool found in schema');
    console.log(`   Description: ${getCurrentTimeTool.description}`);
    console.log(`   Input schema: ${JSON.stringify(getCurrentTimeTool.input_schema)}\n`);
  } else {
    console.log('❌ get_current_time tool NOT found in schema');
    console.log(`   Available tools: ${schema.map(t => t.name).join(', ')}\n`);
    process.exit(1);
  }

  // Test 2: Call the tool
  try {
    const result = await toolHandler.handleCustomTool('get_current_time', {});
    console.log('✅ Tool executed successfully');
    console.log('   Result:');
    console.log(`   - timestamp: ${result.timestamp}`);
    console.log(`   - date: ${result.date}`);
    console.log(`   - time: ${result.time}`);
    console.log(`   - isoFormat: ${result.isoFormat}`);
    console.log(`   - unixTimestamp: ${result.unixTimestamp}`);
    console.log(`   - timezone: ${result.timezone}`);
    console.log(`   - message: ${result.message}\n`);
  } catch (error) {
    console.log(`❌ Tool execution failed: ${error.message}\n`);
    process.exit(1);
  }

  console.log('✅ All tests passed!');
}

runTests();

