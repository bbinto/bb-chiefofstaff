#!/usr/bin/env node

/**
 * Agent Validation Script
 * Validates that all agent markdown files are properly registered in:
 * 1. src/index.js - agents array
 * 2. frontend/src/components/AgentRunner.jsx - frontend agent list
 * 3. Checks for parameter handling in agent-runner.js if needed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const agentsDir = path.join(rootDir, 'agents');
const indexFile = path.join(rootDir, 'src', 'index.js');
const frontendFile = path.join(rootDir, 'frontend', 'src', 'components', 'AgentRunner.jsx');
const agentRunnerFile = path.join(rootDir, 'src', 'agent-runner.js');

// Get all agent markdown files
const agentFiles = fs.readdirSync(agentsDir)
  .filter(file => file.endsWith('.md'))
  .map(file => file.replace('.md', ''));

console.log(`\n🔍 Validating ${agentFiles.length} agents...\n`);

// Read source files
const indexContent = fs.readFileSync(indexFile, 'utf8');
const frontendContent = fs.readFileSync(frontendFile, 'utf8');
const agentRunnerContent = fs.readFileSync(agentRunnerFile, 'utf8');

// Extract registered agents from each file
const indexAgents = [];
const indexMatches = indexContent.matchAll(/'([^']+)'/g);
for (const match of indexMatches) {
  const agent = match[1];
  // Check if it's in the agents array (between this.agents = [ and ])
  const agentsArrayStart = indexContent.indexOf('this.agents = [');
  const agentsArrayEnd = indexContent.indexOf('];', agentsArrayStart);
  const agentPos = match.index;
  if (agentPos > agentsArrayStart && agentPos < agentsArrayEnd) {
    indexAgents.push(agent);
  }
}

const frontendAgents = [];
const frontendMatches = frontendContent.matchAll(/name: '([^']+)'/g);
for (const match of frontendMatches) {
  const agent = match[1];
  // Check if it's in the agents array
  const agentsArrayStart = frontendContent.indexOf('const [agents, setAgents] = useState([');
  const agentsArrayEnd = frontendContent.indexOf('])', agentsArrayStart);
  const agentPos = match.index;
  if (agentPos > agentsArrayStart && agentPos < agentsArrayEnd) {
    frontendAgents.push(agent);
  }
}

// Check for parameter handling in agent-runner.js
const agentRunnerAgents = [];
const agentRunnerMatches = agentRunnerContent.matchAll(/if \(agentName === '([^']+)'\)/g);
for (const match of agentRunnerMatches) {
  agentRunnerAgents.push(match[1]);
}

// Validation results
let hasErrors = false;
let hasWarnings = false;

console.log('📋 Validation Results:\n');

// Check each agent file
for (const agent of agentFiles) {
  const inIndex = indexAgents.includes(agent);
  const inFrontend = frontendAgents.includes(agent);
  const inAgentRunner = agentRunnerAgents.includes(agent);
  
  if (!inIndex || !inFrontend) {
    hasErrors = true;
    console.log(`❌ ${agent}`);
    if (!inIndex) {
      console.log(`   Missing in: src/index.js`);
    }
    if (!inFrontend) {
      console.log(`   Missing in: frontend/src/components/AgentRunner.jsx`);
    }
    console.log(`   Fix: npm run register-agent ${agent} --description "Your description"`);
    console.log('');
  } else {
    // Check if agent needs parameter handling
    const frontendAgentMatch = frontendContent.match(new RegExp(`name: '${agent}',[\\s\\S]*?requiresParam: '([^']+)'`));
    if (frontendAgentMatch && !inAgentRunner) {
      hasWarnings = true;
      console.log(`⚠️  ${agent}`);
      console.log(`   Has required parameter but no handling in agent-runner.js`);
      console.log(`   Consider adding: npm run register-agent ${agent} --agent-runner-param`);
      console.log('');
    } else {
      console.log(`✅ ${agent}`);
    }
  }
}

// Check for agents registered but no file exists
const allRegistered = [...new Set([...indexAgents, ...frontendAgents])];
for (const agent of allRegistered) {
  if (!agentFiles.includes(agent)) {
    hasWarnings = true;
    console.log(`⚠️  ${agent}`);
    console.log(`   Registered but agent file (agents/${agent}.md) not found`);
    console.log('');
  }
}

// Summary
console.log('\n' + '='.repeat(60));
if (hasErrors) {
  console.log('❌ Validation FAILED - Some agents are not properly registered');
  console.log('\nTo fix, run:');
  console.log('  npm run register-agent <agent-name> --description "Description"');
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️  Validation PASSED with warnings');
  console.log('   Review the warnings above');
  process.exit(0);
} else {
  console.log('✅ Validation PASSED - All agents are properly registered');
  process.exit(0);
}
