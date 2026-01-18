#!/usr/bin/env node

/**
 * Agent Registration Script
 * Automatically registers a new agent in all required places:
 * 1. src/index.js - agents array
 * 2. src/agent-runner.js - parameter handling (if needed)
 * 3. frontend/src/components/AgentRunner.jsx - frontend agent list
 * 4. src/utils/cli-parser.js - validation (if needed)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Agent Registration Script

Usage:
  node scripts/register-agent.js <agent-name> [options]

Options:
  --display-name "Display Name"    Human-readable name (default: auto-generated from agent-name)
  --description "Description"       Agent description (required)
  --requires-param <param>         Parameter required (e.g., email, slackUserId, folder, week, reportFile)
  --agent-runner-param             Add parameter handling in agent-runner.js (use if agent needs special parameter logic)

Examples:
  node scripts/register-agent.js my-new-agent --description "Does something cool"
  node scripts/register-agent.js user-analysis --description "Analyzes users" --requires-param email
  node scripts/register-agent.js custom-agent --description "Custom agent" --requires-param folder --agent-runner-param

Note: The agent markdown file (agents/<agent-name>.md) must already exist.
`);
  process.exit(0);
}

const agentName = args[0];
const displayNameIndex = args.indexOf('--display-name');
const descriptionIndex = args.indexOf('--description');
const requiresParamIndex = args.indexOf('--requires-param');
const needsAgentRunnerParam = args.includes('--agent-runner-param');

// Validate agent name
if (!agentName || agentName.startsWith('--')) {
  console.error('❌ Error: Agent name is required and cannot start with --');
  process.exit(1);
}

// Validate agent file exists
const agentFile = path.join(rootDir, 'agents', `${agentName}.md`);
if (!fs.existsSync(agentFile)) {
  console.error(`❌ Error: Agent file not found: ${agentFile}`);
  console.error('   Please create the agent markdown file first.');
  process.exit(1);
}

// Get description
let description = '';
if (descriptionIndex !== -1 && args[descriptionIndex + 1]) {
  description = args[descriptionIndex + 1];
} else {
  console.error('❌ Error: --description is required');
  process.exit(1);
}

// Get display name
let displayName = '';
if (displayNameIndex !== -1 && args[displayNameIndex + 1]) {
  displayName = args[displayNameIndex + 1];
} else {
  // Auto-generate from agent name
  displayName = agentName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Get requires param
let requiresParam = null;
if (requiresParamIndex !== -1 && args[requiresParamIndex + 1]) {
  requiresParam = args[requiresParamIndex + 1];
  const validParams = ['email', 'slackUserId', 'folder', 'week', 'reportFile', 'manualSourcesFolder'];
  if (!validParams.includes(requiresParam)) {
    console.warn(`⚠️  Warning: ${requiresParam} is not a standard parameter. Valid params: ${validParams.join(', ')}`);
  }
}

console.log(`\n📝 Registering agent: ${agentName}`);
console.log(`   Display Name: ${displayName}`);
console.log(`   Description: ${description}`);
if (requiresParam) {
  console.log(`   Requires Param: ${requiresParam}`);
}
console.log('');

// 1. Register in src/index.js
console.log('1️⃣  Registering in src/index.js...');
const indexFile = path.join(rootDir, 'src', 'index.js');
let indexContent = fs.readFileSync(indexFile, 'utf8');

// Check if already registered
if (indexContent.includes(`'${agentName}'`)) {
  console.log('   ⚠️  Already registered in src/index.js, skipping...');
} else {
  // Find the agents array and add the agent
  const agentsArrayRegex = /this\.agents\s*=\s*\[([\s\S]*?)\];/;
  const match = indexContent.match(agentsArrayRegex);
  
  if (match) {
    const agentsList = match[1];
    // Find the last agent entry
    const lastAgentMatch = agentsList.match(/(\s+)'([^']+)',?\s*$/m);
    if (lastAgentMatch) {
      const indent = lastAgentMatch[1];
      const lastAgent = lastAgentMatch[2];
      // Add new agent after the last one
      const newAgentEntry = `${indent}'${agentName}',`;
      const insertPos = match.index + match[0].indexOf(`'${lastAgent}'`) + `'${lastAgent}'`.length;
      indexContent = indexContent.slice(0, insertPos) + 
                     (lastAgent === 'tts' ? '\n' : '') + 
                     newAgentEntry + 
                     indexContent.slice(insertPos);
      fs.writeFileSync(indexFile, indexContent, 'utf8');
      console.log('   ✅ Added to src/index.js');
    } else {
      console.error('   ❌ Could not find insertion point in agents array');
      process.exit(1);
    }
  } else {
    console.error('   ❌ Could not find agents array in src/index.js');
    process.exit(1);
  }
}

// 2. Register in frontend/src/components/AgentRunner.jsx
console.log('2️⃣  Registering in frontend/src/components/AgentRunner.jsx...');
const frontendAgentFile = path.join(rootDir, 'frontend', 'src', 'components', 'AgentRunner.jsx');
let frontendContent = fs.readFileSync(frontendAgentFile, 'utf8');

// Check if already registered
if (frontendContent.includes(`name: '${agentName}'`)) {
  console.log('   ⚠️  Already registered in frontend, skipping...');
} else {
  // Find the agents array
  const frontendAgentsRegex = /const \[agents, setAgents\] = useState\(\[([\s\S]*?)\]\)/;
  const frontendMatch = frontendContent.match(frontendAgentsRegex);
  
  if (frontendMatch) {
    const agentsList = frontendMatch[1];
    // Find the last agent entry
    const lastAgentMatch = agentsList.match(/(\s+)\{ name: '([^']+)',[\s\S]*?\},?\s*$/);
    if (lastAgentMatch) {
      const indent = lastAgentMatch[1];
      const lastAgent = lastAgentMatch[2];
      // Build new agent entry
      let newAgentEntry = `${indent}{ name: '${agentName}', displayName: '${displayName}', description: '${description}'`;
      if (requiresParam) {
        newAgentEntry += `, requiresParam: '${requiresParam}'`;
      }
      newAgentEntry += `, lastRun: null }`;
      
      // Add new agent after the last one
      const insertPos = frontendMatch.index + frontendMatch[0].indexOf(`name: '${lastAgent}'`) + 
                        frontendContent.slice(frontendMatch.index).indexOf('},');
      const beforeInsert = frontendContent.slice(0, insertPos);
      const afterInsert = frontendContent.slice(insertPos);
      // Find the end of the last agent entry
      const lastEntryEnd = beforeInsert.lastIndexOf('},');
      if (lastEntryEnd !== -1) {
        const finalInsertPos = lastEntryEnd + 2; // After '},'
        frontendContent = frontendContent.slice(0, finalInsertPos) + 
                         ',\n' + newAgentEntry + 
                         frontendContent.slice(finalInsertPos);
        fs.writeFileSync(frontendAgentFile, frontendContent, 'utf8');
        console.log('   ✅ Added to frontend/src/components/AgentRunner.jsx');
      } else {
        console.error('   ❌ Could not find insertion point in frontend agents array');
        process.exit(1);
      }
    } else {
      console.error('   ❌ Could not find insertion point in frontend agents array');
      process.exit(1);
    }
  } else {
    console.error('   ❌ Could not find agents array in frontend AgentRunner.jsx');
    process.exit(1);
  }
}

// 3. Add parameter handling in agent-runner.js if needed
if (needsAgentRunnerParam && requiresParam) {
  console.log('3️⃣  Adding parameter handling in src/agent-runner.js...');
  const agentRunnerFile = path.join(rootDir, 'src', 'agent-runner.js');
  let agentRunnerContent = fs.readFileSync(agentRunnerFile, 'utf8');
  
  // Check if already added
  if (agentRunnerContent.includes(`if (agentName === '${agentName}')`)) {
    console.log('   ⚠️  Parameter handling already exists, skipping...');
  } else {
    // Find a good insertion point (after the last agent parameter handling)
    const lastAgentParamMatch = agentRunnerContent.match(/if \(agentName === '([^']+)'\) \{[\s\S]*?\n\s+\}\n\n\s+let messages/);
    if (lastAgentParamMatch) {
      const insertPos = lastAgentParamMatch.index + lastAgentParamMatch[0].indexOf('let messages');
      const paramHandling = `
    if (agentName === '${agentName}') {
      console.log('[AgentRunner] Processing ${agentName} agent. this.agentParams:', this.agentParams);
      console.log('[AgentRunner] this.agentParams.${requiresParam} value:', this.agentParams.${requiresParam});
      if (this.agentParams.${requiresParam}) {
        console.log('[AgentRunner] ✅ ${requiresParam} parameter found! Setting parameter message for ${requiresParam}:', this.agentParams.${requiresParam});
        parameterMessage = \`\\n\\n**IMPORTANT: ${requiresParam.charAt(0).toUpperCase() + requiresParam.slice(1)} Parameter**\\nThe ${requiresParam} for ${displayName} is: \${this.agentParams.${requiresParam}}\\nPlease use this ${requiresParam} to proceed with the analysis.\`;
        console.log('[AgentRunner] Parameter message created for ${agentName}');
      } else {
        console.log('[AgentRunner] ❌ No ${requiresParam} parameter found in this.agentParams');
        parameterMessage = \`\\n\\n**IMPORTANT: ${requiresParam.charAt(0).toUpperCase() + requiresParam.slice(1)} Parameter Required**\\nNo ${requiresParam} was provided. Please ask the user for the ${requiresParam} before proceeding.\`;
      }
    }
`;
      agentRunnerContent = agentRunnerContent.slice(0, insertPos) + paramHandling + agentRunnerContent.slice(insertPos);
      fs.writeFileSync(agentRunnerFile, agentRunnerContent, 'utf8');
      console.log('   ✅ Added parameter handling to src/agent-runner.js');
    } else {
      console.warn('   ⚠️  Could not find insertion point in agent-runner.js, you may need to add it manually');
    }
  }
} else {
  console.log('3️⃣  Skipping agent-runner.js (no --agent-runner-param flag)');
}

// 4. Add validation in cli-parser.js if requiresParam
if (requiresParam) {
  console.log('4️⃣  Adding validation in src/utils/cli-parser.js...');
  const cliParserFile = path.join(rootDir, 'src', 'utils', 'cli-parser.js');
  let cliParserContent = fs.readFileSync(cliParserFile, 'utf8');
  
  // Check if validation already exists
  if (cliParserContent.includes(`specificAgents.includes('${agentName}')`)) {
    console.log('   ⚠️  Validation already exists, skipping...');
  } else {
    // Find the validateAgentRequirements function and add validation
    const validationRegex = /\/\/ Warn if (\w+) is run without (\w+)\s+if \([\s\S]*?\n\s+\}\n\}/g;
    const lastValidationMatch = [...cliParserContent.matchAll(validationRegex)].pop();
    
    if (lastValidationMatch) {
      const insertPos = lastValidationMatch.index + lastValidationMatch[0].length - 1; // Before the closing }
      const validationCode = `
  // Warn if ${agentName} is run without ${requiresParam}
  if (
    specificAgents &&
    specificAgents.includes('${agentName}') &&
    !agentParams.${requiresParam}
  ) {
    console.warn(\`\\n⚠️  Warning: ${agentName} agent requires --${requiresParam} parameter.\`);
    console.warn(\`   Example: npm start -- ${agentName} --${requiresParam} <value>\\n\`);
  }`;
      cliParserContent = cliParserContent.slice(0, insertPos) + validationCode + '\n' + cliParserContent.slice(insertPos);
      fs.writeFileSync(cliParserFile, cliParserContent, 'utf8');
      console.log('   ✅ Added validation to src/utils/cli-parser.js');
    } else {
      console.warn('   ⚠️  Could not find insertion point in cli-parser.js, you may need to add it manually');
    }
  }
} else {
  console.log('4️⃣  Skipping cli-parser.js validation (no required parameter)');
}

console.log('\n✅ Agent registration complete!');
console.log(`\n📋 Summary:`);
console.log(`   - Agent name: ${agentName}`);
console.log(`   - Registered in: src/index.js, frontend/src/components/AgentRunner.jsx`);
if (needsAgentRunnerParam) {
  console.log(`   - Parameter handling added to: src/agent-runner.js`);
}
if (requiresParam) {
  console.log(`   - Validation added to: src/utils/cli-parser.js`);
}
console.log(`\n💡 Next steps:`);
console.log(`   1. Review the changes in the files above`);
console.log(`   2. Test the agent: npm start -- ${agentName}${requiresParam ? ` --${requiresParam} <value>` : ''}`);
console.log(`   3. Run validation: npm run validate-agents`);
console.log('');
