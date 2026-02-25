#!/bin/bash

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: sh light.sh <filename_or_filename.md>"
  echo "Example: sh light.sh daily-brief-2026-02-18-14-01-08"
  exit 1
fi

INPUT_NAME="$1"
if [[ "$INPUT_NAME" == *.md ]]; then
  FILENAME="$INPUT_NAME"
else
  FILENAME="${INPUT_NAME}.md"
fi

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORTS_DIR="${ROOT_DIR}/reports"
ENV_FILE="${ROOT_DIR}/.env"
API_URL="${LIGHT_API_URL:-http://localhost:3001}"

SOURCE_PATH="${REPORTS_DIR}/${FILENAME}"
if [ ! -f "$SOURCE_PATH" ]; then
  echo "Error: source report not found: $SOURCE_PATH"
  exit 1
fi

APP_PASSWORD=""
if [ -f "$ENV_FILE" ]; then
  APP_PASSWORD=$(grep '^APP_PASSWORD=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | sed 's/^"//;s/"$//;s/^\x27//;s/\x27$//')
fi

ENCODED_FILENAME=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$FILENAME")
ENDPOINT="${API_URL}/api/reports/${ENCODED_FILENAME}/light"

if [ -n "$APP_PASSWORD" ]; then
  RESPONSE_WITH_STATUS=$(curl -sS -X POST -H "x-app-password: ${APP_PASSWORD}" "$ENDPOINT" -w "\n%{http_code}")
else
  RESPONSE_WITH_STATUS=$(curl -sS -X POST "$ENDPOINT" -w "\n%{http_code}")
fi

HTTP_STATUS=$(echo "$RESPONSE_WITH_STATUS" | tail -n1)
BODY=$(echo "$RESPONSE_WITH_STATUS" | sed '$d')

if [[ ! "$HTTP_STATUS" =~ ^2 ]]; then
  echo "Light report generation failed (HTTP $HTTP_STATUS)"
  echo "$BODY"
  exit 1
fi

OUTPUT_FILENAME=$(python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('filename',''))" <<< "$BODY")
if [ -z "$OUTPUT_FILENAME" ]; then
  echo "Light report generation succeeded, but no output filename was returned."
  echo "$BODY"
  exit 1
fi

echo "Light report created successfully"
echo "Source: ${FILENAME}"
echo "Output: ${OUTPUT_FILENAME}"
echo "Path: ${REPORTS_DIR}/${OUTPUT_FILENAME}"
