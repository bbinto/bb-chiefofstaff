import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PATHS, PRICING, REPORT, ENVIRONMENTAL_IMPACT } from './utils/constants.js';
import { formatDateLocalISO, formatTimeLocal } from './utils/date-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

/**
 * Report Generator
 * Generates formatted reports from agent outputs
 */
export class ReportGenerator {
  constructor() {
    // Use absolute path from module location, not process.cwd()
    // This ensures reports directory is found regardless of where the script is called from
    this.reportDir = path.join(projectRoot, PATHS.REPORTS_DIR);
    console.log(`[ReportGenerator] Reports directory: ${this.reportDir}`);
    console.log(`[ReportGenerator] Module location: ${__dirname}`);
    console.log(`[ReportGenerator] Current working directory: ${process.cwd()}`);
    this.ensureReportDir();
  }

  /**
   * Ensure reports directory exists
   */
  ensureReportDir() {
    try {
      if (!fs.existsSync(this.reportDir)) {
        console.log(`[ReportGenerator] Creating reports directory: ${this.reportDir}`);
        fs.mkdirSync(this.reportDir, { recursive: true });
        console.log(`[ReportGenerator] Reports directory created successfully`);
      } else {
        console.log(`[ReportGenerator] Reports directory exists: ${this.reportDir}`);
      }
    } catch (error) {
      console.error(`[ReportGenerator] Error creating reports directory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a comprehensive report from all agent outputs
   */
  async generateReport(agentResults) {
    const timestamp = new Date();
    const dateStr = formatDateLocalISO(timestamp);
    const timeStr = formatTimeLocal(timestamp);

    let report = this.buildReportHeader(timestamp, agentResults);

    // Add each agent's output
    for (const result of agentResults) {
      report += this.buildAgentSection(result);
    }

    report += this.buildReportFooter();

    // Determine report name based on number of agents
    // For split agents (e.g. thoughtleadership-rss + thoughtleadership-web), use the
    // shared prefix as the report name so it shows up correctly in the report list.
    let reportName;
    if (agentResults.length === 1) {
      reportName = agentResults[0].agentName;
    } else {
      // Check if all agent names share a common prefix separated by '-'
      const names = agentResults.map(r => r.agentName);
      const parts0 = names[0].split('-');
      let sharedParts = [];
      for (let i = 1; i <= parts0.length; i++) {
        const prefix = parts0.slice(0, i).join('-');
        if (names.every(n => n.startsWith(prefix + '-') || n === prefix)) {
          sharedParts = parts0.slice(0, i);
        } else {
          break;
        }
      }
      reportName = sharedParts.length > 0 ? sharedParts.join('-') + '-updates' : REPORT.DEFAULT_NAME;
    }

    // Save report as markdown
    console.log('[ReportGenerator] Generating Markdown...');
    return this.saveAsMarkdown(report, dateStr, timeStr, reportName);
  }

  /**
   * Save report as Markdown
   */
  saveAsMarkdown(report, dateStr, timeStr, reportName = 'weekly-report') {
    try {
      const filename = `${reportName}-${dateStr}-${timeStr}.md`;
      const filepath = path.join(this.reportDir, filename);
      
      console.log(`[ReportGenerator] Writing report to: ${filepath}`);
      console.log(`[ReportGenerator] Report directory: ${this.reportDir}`);
      console.log(`[ReportGenerator] Report size: ${report.length} bytes`);
      
      // Check if directory exists before writing
      if (!fs.existsSync(this.reportDir)) {
        console.error(`[ReportGenerator] Reports directory does not exist: ${this.reportDir}`);
        throw new Error(`Reports directory not found: ${this.reportDir}`);
      }
      
      fs.writeFileSync(filepath, report, 'utf8');
      console.log(`\n✓ Report saved to: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error(`[ReportGenerator] Error saving report: ${error.message}`);
      console.error(`[ReportGenerator] Stack trace:`, error.stack);
      throw error;
    }
  }

  /**
   * Build report header
   */
  buildReportHeader(timestamp, agentResults) {
    const title = agentResults.length === 1
      ? `Chief of Staff - ${this.formatAgentName(agentResults[0].agentName)}`
      : 'Chief of Staff Weekly Report';

    return `# ${title}
**Generated**: ${timestamp.toLocaleString()}

---

`;
  }

  /**
   * Calculate carbon footprint from token usage
   */
  calculateCarbonFootprint(inputTokens, outputTokens) {
    const inputCO2 = (inputTokens / 1000) * ENVIRONMENTAL_IMPACT.INPUT_TOKENS_CO2_PER_1K;
    const outputCO2 = (outputTokens / 1000) * ENVIRONMENTAL_IMPACT.OUTPUT_TOKENS_CO2_PER_1K;
    const totalCO2 = inputCO2 + outputCO2;
    return {
      inputCO2,
      outputCO2,
      totalCO2,
      totalCO2Kg: totalCO2 / 1000, // Convert grams to kg
    };
  }

  /**
   * Get environmental impact icon based on CO2 emissions
   */
  getEnvironmentalImpactIcon(totalCO2Grams) {
    if (totalCO2Grams < ENVIRONMENTAL_IMPACT.THRESHOLD_GREEN_MAX) {
      return '🟢'; // Green: Low impact
    } else if (totalCO2Grams < ENVIRONMENTAL_IMPACT.THRESHOLD_YELLOW_MAX) {
      return '🟡'; // Yellow: Moderate impact
    } else {
      return '🟠'; // Orange: High impact
    }
  }

  /**
   * Format environmental impact with context and icon
   */
  formatEnvironmentalImpact(totalCO2Kg) {
    const totalCO2Grams = totalCO2Kg * 1000; // Convert to grams for icon logic
    const icon = this.getEnvironmentalImpactIcon(totalCO2Grams);
    
    let formattedValue;
    if (totalCO2Kg < 0.001) {
      formattedValue = `${totalCO2Grams.toFixed(2)} g CO₂e`;
    } else {
      formattedValue = `${totalCO2Kg.toFixed(4)} kg CO₂e`;
    }
    
    return `${icon} ${formattedValue}`;
  }

  /**
   * Build section for an agent's output
   */
  buildAgentSection(result) {
    const title = this.formatAgentName(result.agentName);

    if (!result.success) {
     return `
    


**Status**: Failed
**Error**: ${result.error}

---

`;
    }

    // Build metadata section
    let metadata = '';
    if (result.hallucinationWarning) {
      metadata += `> ⚠️ **HALLUCINATION WARNING**: This agent made **0 tool calls** despite having tools available. The content below may be entirely fabricated by the LLM. Do not act on this report — re-run with Claude instead of ${result.llmBackend}.\n\n`;
    }
    if (result.manualSourcesFolder) {
      metadata += `**Manual Sources Folder**: ${result.manualSourcesFolder}\n`;
    }
    const isLocal = result.llmBackend === 'Ollama';
    if (result.usage) {
      const inputTokens = result.usage.input_tokens || 0;
      const outputTokens = result.usage.output_tokens || 0;

      metadata += `**Token Usage**: ${inputTokens.toLocaleString()} input, ${outputTokens.toLocaleString()} output\n`;

      if (isLocal) {
        metadata += `**Cost**: $0.00 (local model)\n`;
        metadata += `**Environmental Impact**: 🟢 Local compute (no cloud inference)\n`;
      } else {
        const inputCost = (inputTokens / 1000000) * PRICING.INPUT_TOKENS_PER_MILLION;
        const outputCost = (outputTokens / 1000000) * PRICING.OUTPUT_TOKENS_PER_MILLION;
        const totalCost = inputCost + outputCost;
        metadata += `**Cost**: $${totalCost.toFixed(4)} ($${inputCost.toFixed(4)} input + $${outputCost.toFixed(4)} output)\n`;

        const carbonFootprint = this.calculateCarbonFootprint(inputTokens, outputTokens);
        metadata += `**Environmental Impact**: ${this.formatEnvironmentalImpact(carbonFootprint.totalCO2Kg)}`;
        if (carbonFootprint.totalCO2Kg > 0.001) {
          const treeDays = (carbonFootprint.totalCO2Kg * ENVIRONMENTAL_IMPACT.TREE_DAYS_PER_KG_CO2).toFixed(1);
          metadata += ` (equivalent to ~${treeDays} days of a tree's CO₂ absorption)`;
        }
        metadata += `\n`;
      }
    }
    if (result.executionTimeMin) {
      metadata += `**Execution Time**: ${result.executionTimeMin} min\n`;
    }
    if (result.llmBackend) {
      const llmLabel = isLocal ? `Local Ollama` : result.llmBackend;
      metadata += `**LLM**: ${llmLabel} (${result.llmModel})\n`;
    }
    
    const metadataSection = metadata ? `${metadata}\n` : '';

  return `

  ${metadataSection}${result.output}

---

`;

  }

  /**
   * Build report footer
   */
  buildReportFooter() {
    return `
---

${REPORT.FOOTER_TEXT}
`;
  }

  /**
   * Format agent name for display
   */
  formatAgentName(agentName) {
    return agentName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generate summary report (text only, no file)
   */
  generateSummary(agentResults) {
    let summary = `\n${'='.repeat(80)}\n`;
    summary += `EXECUTION SUMMARY\n`;
    summary += `${'='.repeat(80)}\n\n`;

    const successful = agentResults.filter(r => r.success).length;
    const failed = agentResults.filter(r => !r.success).length;

    summary += `Total Agents Run: ${agentResults.length}\n`;
    summary += `Successful: ${successful}\n`;
    summary += `Failed: ${failed}\n\n`;

    if (failed > 0) {
      summary += `Failed Agents:\n`;
      agentResults
        .filter(r => !r.success)
        .forEach(r => {
          summary += `  - ${r.agentName}: ${r.error}\n`;
        });
    }

    return summary;
  }
}
