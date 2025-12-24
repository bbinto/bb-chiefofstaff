# Setup Guide

This guide will walk you through setting up the Chief of Staff Agent system step by step.

## Step 1: Install Node.js

If you don't have Node.js installed:

1. Visit https://nodejs.org/
2. Download and install Node.js 18 or higher
3. Verify installation:
   ```bash
   node --version
   npm --version
   ```

## Step 2: Get Anthropic API Key

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (you'll need it in Step 4)

## Step 3: Install Dependencies

In the project directory:

```bash
npm install
```

## Step 4: Configure Environment Variables

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env`:
   ```bash
   nano .env
   # or use your preferred editor
   ```

3. Add your Anthropic API key:
   ```env
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   CLAUDE_MODEL=claude-sonnet-4-5-20250929
   MCP_CONFIG_PATH=/Users/yourusername/Library/Application Support/Claude/claude_desktop_config.json
   ```

   Note: Replace `/Users/yourusername/` with your actual username

## Step 5: Configure Application Settings

1. Copy the example config:
   ```bash
   cp config.example.json config.json
   ```

2. Edit `config.json` with your information:
   ```bash
   nano config.json
   ```

### Finding Slack Channel IDs

1. Open Slack in browser
2. Navigate to the channel
3. The URL will be: `https://app.slack.com/client/WORKSPACE_ID/CHANNEL_ID`
4. Copy the `CHANNEL_ID` (starts with C)

### Finding Slack User IDs

1. Click on a user's profile in Slack
2. Click "More" → "Copy member ID"
3. Paste the ID into config.json

### Finding Jira Board IDs

1. Go to your Jira board (Ideas view)
2. The URL will be: `https://yoursite.atlassian.net/jira/polaris/projects/PROJECT/ideas/view/BOARD_ID`
3. Copy the `BOARD_ID` number

### Finding Confluence Page IDs

1. Open the Confluence page
2. Look at the URL: `https://yoursite.atlassian.net/wiki/spaces/SPACE/pages/PAGE_ID/Page+Title`
3. Copy the `PAGE_ID` number

## Step 6: Verify MCP Server Setup

1. Open Claude Desktop
2. Go to Settings → Developer → Model Context Protocol
3. Verify you have MCP servers configured for:
   - Slack
   - Google Calendar
   - Hubspot
   - Jira/Atlassian
   - Confluence
   - Mixpanel (optional)
   - Gong (optional)

If you don't have these set up, refer to Claude Desktop's MCP documentation.

## Step 7: Test the Installation

Run a single agent to test:

```bash
npm start weekly-recap
```

If successful, you should see:
- MCP servers connecting
- Agent execution progress
- A report generated in `reports/`

## Step 8: Customize Agents (Optional)

Edit agent instruction files in the `agents/` directory to match your needs:

- `agents/weekly-recap.md`
- `agents/business-health.md`
- `agents/product-engineering.md`
- `agents/okr-progress.md`

## Step 9: Run All Agents

Once everything is configured:

```bash
npm start
```

## Step 10: Set Up Automated Weekly Runs (Optional)

### macOS/Linux

1. Edit crontab:
   ```bash
   crontab -e
   ```

2. Add line to run every Monday at 8 AM:
   ```
   0 8 * * 1 cd /Users/yourusername/Desktop/chiefof && /usr/local/bin/npm start >> /Users/yourusername/Desktop/chiefof/cron.log 2>&1
   ```

3. Verify crontab:
   ```bash
   crontab -l
   ```

### Windows

1. Open Task Scheduler
2. Click "Create Basic Task"
3. Name: "Chief of Staff Agent"
4. Trigger: Weekly, Monday, 8:00 AM
5. Action: Start a program
6. Program: `cmd`
7. Arguments: `/c cd C:\path\to\chiefof && npm start`

## Common Issues

### "ANTHROPIC_API_KEY not found"

- Check `.env` file exists
- Verify API key is correctly formatted (starts with `sk-ant-`)
- No spaces around the `=` sign

### "config.json not found"

- Ensure you copied `config.example.json` to `config.json`
- Verify the file is in the project root directory

### "Could not load MCP config"

- Check `MCP_CONFIG_PATH` in `.env`
- Default macOS path: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Ensure Claude Desktop is installed and MCP servers are configured

### MCP Tools Not Available

- Verify Claude Desktop has MCP servers configured
- Check that MCP servers are running (restart Claude Desktop if needed)
- Ensure the MCP config path is correct

### Agent Execution Fails

- Review the error message
- Check that required MCP servers are available
- Verify configuration IDs (Slack channels, Jira boards, etc.) are correct
- Test MCP tools individually in Claude Desktop first

## Getting Help

1. Check the main README.md
2. Review agent markdown files for instruction clarity
3. Verify all configuration values are correct
4. Test MCP servers in Claude Desktop directly

## Next Steps

Once setup is complete:

1. Review the first generated report
2. Customize agent instructions if needed
3. Adjust configuration based on your team structure
4. Schedule automated runs
5. Add custom agents for specific needs

## Maintenance

- Update team member information when team changes
- Review and update Slack channel IDs periodically
- Keep MCP servers up to date
- Monitor API usage in Anthropic console
- Update agent instructions based on changing needs
