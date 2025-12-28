#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { MCPClientManager } from './mcp-client.js';
import { AgentRunner } from './agent-runner.js';
import { ReportGenerator } from './report-generator.js';

/**
 * Master Chief of Staff Agent
 * Orchestrates multiple specialized agents to provide weekly product director insights
 */
class ChiefOfStaffAgent {
  constructor(dateRange = null) {
    this.mcpClient = null;
    this.config = null;
    this.agentRunner = null;
    this.reportGenerator = new ReportGenerator();
    this.dateRange = dateRange; // { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }

    // Define agent execution order
    this.agents = [
      'weekly-recap',
      'business-health',
      'product-engineering',
      'okr-progress',
      'thoughtleadership-updates'
    ];
  }

  /**
   * Load configuration
   */
  loadConfig() {
    const configPath = path.join(process.cwd(), 'config.json');

    if (!fs.existsSync(configPath)) {
      console.error('Error: config.json not found!');
      console.log('Please copy config.example.json to config.json and configure it.');
      process.exit(1);
    }

    try {
      this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('Configuration loaded successfully');
    } catch (error) {
      console.error('Error loading config.json:', error.message);
      process.exit(1);
    }
  }

  /**
   * Validate environment
   */
  validateEnvironment() {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Error: ANTHROPIC_API_KEY not found in environment!');
      console.log('Please create a .env file with your Anthropic API key.');
      process.exit(1);
    }
    console.log('Environment validated');
  }

  /**
   * Initialize all components
   */
  async initialize() {
    console.log('\n' + '='.repeat(80));
    console.log('CHIEF OF STAFF AGENT - INITIALIZING');
    console.log('='.repeat(80) + '\n');

    this.validateEnvironment();
    this.loadConfig();

    // Initialize MCP client
    console.log('Initializing MCP client...');
    this.mcpClient = new MCPClientManager();
    await this.mcpClient.initialize();

    // Initialize agent runner
    this.agentRunner = new AgentRunner(this.mcpClient, this.config, this.dateRange);

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
          console.log('Waiting 3 seconds before next agent...\n');
          await this.sleep(3000);
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
          console.log('Waiting 3 seconds before next agent...\n');
          await this.sleep(3000);
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

    for (let i = 0; i < validAgents.length; i++) {
      const agentName = validAgents[i];
      
      if (!this.agents.includes(agentName)) {
        console.warn(`Warning: Unknown agent "${agentName}", skipping...`);
        continue;
      }

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
          console.log('Waiting 3 seconds before next agent...\n');
          await this.sleep(3000);
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
          console.log('Waiting 3 seconds before next agent...\n');
          await this.sleep(3000);
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

    const reportPath = this.reportGenerator.generateReport(results);
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
  console.log(`
Chief of Staff Agent System

Usage:
  npm start                                          Run all agents
  npm start agent1 agent2                            Run specific agents
  npm start -- --start-date YYYY-MM-DD --end-date YYYY-MM-DD   Run with custom date range
  npm start agent1 agent2 --start-date YYYY-MM-DD --end-date YYYY-MM-DD
  npm start -- --list                                List available agents
  npm start -- --help                                Show this help

Options:
  --start-date YYYY-MM-DD    Start date for data analysis (default: configured days ago, see config.json settings.defaultDays)
  --end-date YYYY-MM-DD      End date for data analysis (default: today)

Available Agents:
  - weekly-recap              Weekly team catch-up and recap
  - business-health           Officevibe business and product health
  - product-engineering       Product development and engineering updates
  - okr-progress             OKR updates and progress tracking
  - thoughtleadership-updates Product thought leadership and new topics

Examples:
  npm start
  npm start weekly-recap business-health
  npm start --start-date 2025-12-20 --end-date 2025-12-27
  npm start weekly-recap --start-date 2025-12-20 --end-date 2025-12-27
  npm start -- --list
`);
  process.exit(0);
}

// Parse date range arguments
function parseDateRange(args) {
  let startDate = null;
  let endDate = null;
  
  const startDateIndex = args.indexOf('--start-date');
  const endDateIndex = args.indexOf('--end-date');
  
  if (startDateIndex !== -1 && args[startDateIndex + 1]) {
    startDate = args[startDateIndex + 1];
    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      console.error('Error: --start-date must be in YYYY-MM-DD format (e.g., 2025-12-20)');
      process.exit(1);
    }
    // Validate it's a valid date
    const startDateObj = new Date(startDate + 'T00:00:00');
    if (isNaN(startDateObj.getTime())) {
      console.error('Error: --start-date must be a valid date');
      process.exit(1);
    }
  }
  
  if (endDateIndex !== -1 && args[endDateIndex + 1]) {
    endDate = args[endDateIndex + 1];
    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      console.error('Error: --end-date must be in YYYY-MM-DD format (e.g., 2025-12-27)');
      process.exit(1);
    }
    // Validate it's a valid date
    const endDateObj = new Date(endDate + 'T00:00:00');
    if (isNaN(endDateObj.getTime())) {
      console.error('Error: --end-date must be a valid date');
      process.exit(1);
    }
  }
  
  // Validate that start date is before end date if both are provided
  if (startDate && endDate) {
    const startDateObj = new Date(startDate + 'T00:00:00');
    const endDateObj = new Date(endDate + 'T00:00:00');
    if (startDateObj > endDateObj) {
      console.error('Error: --start-date must be before or equal to --end-date');
      process.exit(1);
    }
  }
  
  if (startDate || endDate) {
    return { startDate, endDate };
  }
  
  return null;
}

// Remove date arguments from args array to get agent names
function extractAgentNames(args) {
  const agentNames = [];
  let skipNext = false;
  
  for (let i = 0; i < args.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    
    if (args[i] === '--start-date' || args[i] === '--end-date') {
      skipNext = true;
      continue;
    }
    
    // Skip other flags but keep agent names
    if (!args[i].startsWith('--')) {
      agentNames.push(args[i]);
    }
  }
  
  return agentNames.length > 0 ? agentNames : null;
}

const dateRange = parseDateRange(args);
const specificAgents = extractAgentNames(args);

const agent = new ChiefOfStaffAgent(dateRange);

if (args.includes('--list') || args.includes('-l')) {
  agent.listAgents();
  process.exit(0);
}

// Run with specific agents if provided
agent.run(specificAgents).catch(error => {
  console.error('Execution failed:', error);
  process.exit(1);
});
