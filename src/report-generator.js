import fs from 'fs';
import path from 'path';
import { PATHS, PRICING, REPORT } from './utils/constants.js';
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

    let report = this.buildReportHeader(timestamp);

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
  buildReportHeader(timestamp) {
    return `# Chief of Staff Weekly Report
**Generated**: ${timestamp.toLocaleString()}

---

`;
  }

  /**
   * Build section for an agent's output
   */
  buildAgentSection(result) {
    const title = this.formatAgentName(result.agentName);

    if (!result.success) {
      return `## ${title}

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
    }
    
    const metadataSection = metadata ? `${metadata}\n` : '';

    return `## ${title}

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
