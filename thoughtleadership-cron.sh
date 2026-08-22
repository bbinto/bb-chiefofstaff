#!/bin/bash

# Thought Leadership Cron Script
# This script:
# 1. Generates a thought leadership report
# 2. Emails the full report to bbinto@gmail.com

set -eu

# Ensure user-installed tools (uvx, uv, etc.) are on the PATH in cron's minimal environment
export PATH="/home/pi/.local/bin:$PATH"

# Set the project directory
PROJECT_DIR="/home/pi/Documents/GitHub/bb-chiefofstaff"
cd "$PROJECT_DIR"

# Log file for cron output
LOG_FILE="$PROJECT_DIR/logs/thoughtleadership-cron.log"
mkdir -p "$PROJECT_DIR/logs"

# Function to log with timestamp
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "==================================================================="
log "Starting Thought Leadership Workflow"
log "==================================================================="

# Log which LLM is selected (env vars take precedence over llm-settings.json)
if [ "${USE_OLLAMA:-}" = "true" ]; then
  log "LLM Selected: Ollama (model: ${OLLAMA_MODEL:-from llm-settings.json})"
elif [ "${USE_GEMINI:-}" = "true" ]; then
  log "LLM Selected: Gemini (model: ${GEMINI_MODEL:-from llm-settings.json})"
else
  LLM_INFO=$(node -e "
const fs = require('fs');
try {
  const s = JSON.parse(fs.readFileSync('llm-settings.json', 'utf-8'));
  if (s.useOllama) process.stdout.write('Ollama (model: ' + s.ollamaModel + ')');
  else if (s.useGemini) process.stdout.write('Gemini (model: ' + s.geminiModel + ')');
  else process.stdout.write('Claude (model: ' + (s.claudeModel || 'default') + ')');
} catch(e) { process.stdout.write('Claude (default)'); }
" 2>/dev/null || echo "Claude (default)")
  log "LLM Selected: $LLM_INFO"
fi

# Step 1: Generate the thought leadership report
log "Step 1: Generating thought leadership report..."
OUTPUT=$(npm start thoughtleadership-updates 2>&1 | tee -a "$LOG_FILE")

# Extract the filename from the output
# Looking for pattern: "Full report saved to: /path/to/reports/filename.md"
REPORT_PATH=$(echo "$OUTPUT" | grep -oP 'Full report saved to: \K.*\.md$' | tail -1)

if [ -z "$REPORT_PATH" ]; then
  log "ERROR: Could not extract report path from output"
  log "Output was: $OUTPUT"
  exit 1
fi

log "Report generated: $REPORT_PATH"

# Extract just the filename without path and extension
FILENAME=$(basename "$REPORT_PATH" .md)
log "Extracted filename: $FILENAME"

# Step 1b: Email the full report
log "Step 1b: Emailing full report to bbinto@gmail.com..."
EMAIL_SUBJECT="Thought Leadership Updates: ${FILENAME}"
if python3 "$PROJECT_DIR/scripts/send-email.py" "bbinto@gmail.com" "$EMAIL_SUBJECT" "$REPORT_PATH" 2>&1 | tee -a "$LOG_FILE"; then
  log "Email sent successfully"
else
  log "WARNING: Failed to send email (continuing workflow)"
fi

log "==================================================================="
log "Thought Leadership Workflow Completed Successfully"
log "==================================================================="
log ""
