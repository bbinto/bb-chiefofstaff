import fs from 'fs';
import path from 'path';
import { PATHS, PRICING, REPORT, ENVIRONMENTAL_IMPACT } from './utils/constants.js';
import { formatDateLocalISO, formatTimeLocal } from './utils/date-utils.js';

/**
 * Report Generator
 * Generates formatted reports from agent outputs
 */
export class ReportGenerator {
  constructor() {
    this.reportDir = path.join(process.cwd(), PATHS.REPORTS_DIR);
    this.ensureReportDir();
  }

  /**
   * Ensure reports directory exists
   */
  ensureReportDir() {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
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
    const reportName = agentResults.length === 1
      ? agentResults[0].agentName
      : REPORT.DEFAULT_NAME;

    // Save report as markdown
    console.log('[ReportGenerator] Generating Markdown...');
    return this.saveAsMarkdown(report, dateStr, timeStr, reportName);
  }

  /**
   * Save report as Markdown
   */
  saveAsMarkdown(report, dateStr, timeStr, reportName = 'weekly-report') {
    const filename = `${reportName}-${dateStr}-${timeStr}.md`;
    const filepath = path.join(this.reportDir, filename);
    fs.writeFileSync(filepath, report, 'utf8');
    console.log(`\nReport saved to: ${filepath}`);
    return filepath;
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
    if (result.manualSourcesFolder) {
      metadata += `**Manual Sources Folder**: ${result.manualSourcesFolder}\n`;
    }
    if (result.usage) {
      const inputTokens = result.usage.input_tokens || 0;
      const outputTokens = result.usage.output_tokens || 0;
      const inputCost = (inputTokens / 1000000) * PRICING.INPUT_TOKENS_PER_MILLION;
      const outputCost = (outputTokens / 1000000) * PRICING.OUTPUT_TOKENS_PER_MILLION;
      const totalCost = inputCost + outputCost;

      metadata += `**Token Usage**: ${inputTokens.toLocaleString()} input, ${outputTokens.toLocaleString()} output\n`;
      metadata += `**Cost**: $${totalCost.toFixed(4)} ($${inputCost.toFixed(4)} input + $${outputCost.toFixed(4)} output)\n`;
      
      // Calculate and add environmental impact
      const carbonFootprint = this.calculateCarbonFootprint(inputTokens, outputTokens);
      metadata += `**Environmental Impact**: ${this.formatEnvironmentalImpact(carbonFootprint.totalCO2Kg)}`;
      
      // Add context for better understanding (for > 1g CO2e)
      if (carbonFootprint.totalCO2Kg > 0.001) {
        const treeDays = (carbonFootprint.totalCO2Kg * ENVIRONMENTAL_IMPACT.TREE_DAYS_PER_KG_CO2).toFixed(1);
        metadata += ` (equivalent to ~${treeDays} days of a tree's CO₂ absorption)`;
      }
      metadata += `\n`;
    }
    if (result.executionTimeMin) {
      metadata += `**Execution Time**: ${result.executionTimeMin} min\n`;
    }
    
    const metadataSection = metadata ? `${metadata}\n` : '';

 /*   return `## ${title}
    

${metadataSection}${result.output}

---

`;*/

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
