#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MCPClientManager } from './mcp-client.js';
import { AgentRunner } from './agent-runner.js';
import { ReportGenerator } from './report-generator.js';
import { ConfigManager, validateEnvironment } from './config/config-manager.js';
import { parseCliArguments, displayHelp, logParsedArguments, validateAgentRequirements } from './utils/cli-parser.js';
import { AGENT_EXECUTION, PATHS } from './utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Master Chief of Staff Agent
 * Orchestrates multiple specialized agents to provide weekly product director insights
 */
class ChiefOfStaffAgent {
  constructor(dateRange = null, agentParams = {}) {
    console.log('[ChiefOfStaffAgent] Constructor called with agentParams:', agentParams);
    this.mcpClient = null;
    this.configManager = new ConfigManager();
    this.config = null;
    this.agentRunner = null;
    this.reportGenerator = new ReportGenerator();
    this.dateRange = dateRange; // { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
    this.agentParams = agentParams; // { slackUserId: 'U...', folder: 'week1', etc. }

    // Dynamically discover agents from the agents directory
    this.agents = this.discoverAgents();
  }

  /**
   * Discover agents dynamically from the agents directory
   * This ensures any new agent file added to the agents/ directory is automatically available
   */
  discoverAgents() {
    const agentsDir = path.join(__dirname, '..', PATHS.AGENTS_DIR);
    
    try {
      if (!fs.existsSync(agentsDir)) {
        console.warn(`[ChiefOfStaffAgent] Agents directory not found: ${agentsDir}`);
        return [];
      }

      const files = fs.readdirSync(agentsDir);
      const agentFiles = files
        .filter(file => file.endsWith('.md'))
        .map(file => file.replace('.md', ''))
        .sort(); // Sort alphabetically for consistent ordering

      console.log(`[ChiefOfStaffAgent] Discovered ${agentFiles.length} agent(s) from ${agentsDir}`);
      
      if (agentFiles.length > 0) {
        console.log(`[ChiefOfStaffAgent] Available agents: ${agentFiles.join(', ')}`);
      }

      return agentFiles;
    } catch (error) {
      console.error(`[ChiefOfStaffAgent] Error discovering agents from ${agentsDir}:`, error.message);
      // Return empty array if discovery fails - this will prevent execution but won't crash
      return [];
    }
  }

  /**
   * Load configuration using ConfigManager
   */
  loadConfig() {
    try {
      this.config = this.configManager.loadConfig();
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }

  /**
   * Initialize all components
   */
  async initialize() {
    console.log('\n' + '='.repeat(80));
    console.log('CHIEF OF STAFF AGENT - INITIALIZING');
    console.log('='.repeat(80) + '\n');

    validateEnvironment();
    this.loadConfig();

    // Initialize MCP client
    console.log('Initializing MCP client...');
    this.mcpClient = new MCPClientManager(this.config);
    await this.mcpClient.initialize();

    // Initialize agent runner
    console.log('[ChiefOfStaffAgent] Initializing AgentRunner with agentParams:', this.agentParams);
    this.agentRunner = new AgentRunner(this.mcpClient, this.config, this.dateRange, this.agentParams);

    console.log('\nInitialization complete!\n');
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Run all agents
   */
  async runAllAgents() {
    console.log('\n' + '='.repeat(80));
    console.log('STARTING AGENT EXECUTION');
    console.log('='.repeat(80) + '\n');

    const results = [];

    for (let i = 0; i < this.agents.length; i++) {
      const agentName = this.agents[i];
      try {
        const result = await this.agentRunner.runAgent(agentName);
        results.push(result);

        if (result.success) {
          console.log(`✓ ${agentName} completed successfully`);
        } else {
          console.log(`✗ ${agentName} failed: ${result.error}`);
        }
        
        // Add delay between agents (except after the last one) to help with rate limits
        if (i < this.agents.length - 1) {
          const delay = AGENT_EXECUTION.DELAY_BETWEEN_AGENTS;
          console.log(`Waiting ${delay / 1000} seconds before next agent...\n`);
          await this.sleep(delay);
        }
      } catch (error) {
        console.error(`Error executing ${agentName}:`, error.message);
        results.push({
          agentName,
          success: false,
          error: error.message
        });
        
        // Still add delay even on error
        if (i < this.agents.length - 1) {
          const delay = AGENT_EXECUTION.DELAY_BETWEEN_AGENTS_ON_ERROR;
          console.log(`Waiting ${delay / 1000} seconds before next agent...\n`);
          await this.sleep(delay);
        }
      }
    }

    return results;
  }

  /**
   * Run specific agents
   */
  async runSpecificAgents(agentNames) {
    console.log('\n' + '='.repeat(80));
    console.log(`RUNNING SPECIFIC AGENTS: ${agentNames.join(', ')}`);
    console.log('='.repeat(80) + '\n');

    const results = [];
    const validAgents = agentNames.filter(name => this.agents.includes(name));
    
    // Log any invalid agents that were requested but don't exist
    const invalidAgents = agentNames.filter(name => !this.agents.includes(name));
    if (invalidAgents.length > 0) {
      console.warn(`Warning: The following agent(s) were requested but not found: ${invalidAgents.join(', ')}`);
      console.warn(`Available agents: ${this.agents.join(', ')}`);
    }

    for (let i = 0; i < validAgents.length; i++) {
      const agentName = validAgents[i];

      try {
        const result = await this.agentRunner.runAgent(agentName);
        results.push(result);

        if (result.success) {
          console.log(`✓ ${agentName} completed successfully`);
        } else {
          console.log(`✗ ${agentName} failed: ${result.error}`);
        }
        
        // Add delay between agents (except after the last one) to help with rate limits
        if (i < validAgents.length - 1) {
          const delay = AGENT_EXECUTION.DELAY_FOR_SPECIFIC_AGENTS;
          console.log(`Waiting ${delay / 1000} seconds before next agent...\n`);
          await this.sleep(delay);
        }
      } catch (error) {
        console.error(`Error executing ${agentName}:`, error.message);
        results.push({
          agentName,
          success: false,
          error: error.message
        });

        // Still add delay even on error
        if (i < validAgents.length - 1) {
          const delay = AGENT_EXECUTION.DELAY_FOR_SPECIFIC_AGENTS;
          console.log(`Waiting ${delay / 1000} seconds before next agent...\n`);
          await this.sleep(delay);
        }
      }
    }

    return results;
  }

  /**
   * Generate and save report
   */
  async generateReport(results) {
    console.log('\n' + '='.repeat(80));
    console.log('GENERATING REPORT');
    console.log('='.repeat(80) + '\n');

    const reportPath = await this.reportGenerator.generateReport(results);
    const summary = this.reportGenerator.generateSummary(results);

    console.log(summary);
    console.log(`\nFull report saved to: ${reportPath}`);

    return reportPath;
  }

  /**
   * Main execution
   */
  async run(specificAgents = null) {
    try {
      await this.initialize();

      let results;
      if (specificAgents && specificAgents.length > 0) {
        results = await this.runSpecificAgents(specificAgents);
      } else {
        results = await this.runAllAgents();
      }

      await this.generateReport(results);

      console.log('\n' + '='.repeat(80));
      console.log('EXECUTION COMPLETE');
      console.log('='.repeat(80) + '\n');

    } catch (error) {
      console.error('Fatal error:', error);
      throw error;
    } finally {
      if (this.mcpClient) {
        await this.mcpClient.close();
      }
    }
  }

  /**
   * List available agents
   */
  listAgents() {
    console.log('\nAvailable Agents:');
    this.agents.forEach(agent => {
      console.log(`  - ${agent}`);
    });
    console.log('');
  }
}

// CLI handling
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  displayHelp();
  process.exit(0);
}

// Parse CLI arguments using the new parser
let parsed;
try {
  parsed = parseCliArguments(args);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const { dateRange, agentParams, specificAgents } = parsed;

// Log parsed arguments for debugging
logParsedArguments(parsed, args);

console.log('[Main] Creating ChiefOfStaffAgent with dateRange:', dateRange, 'and agentParams:', agentParams);

// Validate agent-specific requirements
validateAgentRequirements(specificAgents, agentParams);

const agent = new ChiefOfStaffAgent(dateRange, agentParams);

if (args.includes('--list') || args.includes('-l')) {
  agent.listAgents();
  process.exit(0);
}

// Run with specific agents if provided
agent.run(specificAgents).catch(error => {
  console.error('Execution failed:', error);
  process.exit(1);
});
