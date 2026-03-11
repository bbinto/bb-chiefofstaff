#!/bin/bash

# Thought Leadership Cron Script
# This script:
# 1. Generates a thought leadership report
# 2. Creates a light version
# 3. Generates a podcast from the light version and uploads it

set -eu

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

# Step 2: Create light version
log "Step 2: Creating light version..."
if npm run light -- "$FILENAME" 2>&1 | tee -a "$LOG_FILE"; then
  log "Light version created successfully: ${FILENAME}-light.md"
else
  log "ERROR: Failed to create light version"
  exit 1
fi

# Step 3: Generate podcast from light version and upload
log "Step 3: Generating podcast from light version and uploading..."
if sh podcast.sh "${FILENAME}-light" 2>&1 | tee -a "$LOG_FILE"; then
  log "Podcast created and uploaded successfully: ${FILENAME}-light.mp3"
else
  log "ERROR: Failed to create or upload podcast"
  exit 1
fi

log "==================================================================="
log "Thought Leadership Workflow Completed Successfully"
log "==================================================================="
log ""
