# Quick Start Guide

Get up and running in 5 minutes!

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] Anthropic API key
- [ ] Claude Desktop with MCP servers configured

## Quick Setup

```bash
# 1. Install dependencies
npm install

# 2. Create and configure .env
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Create and configure config.json
cp config.example.json config.json
# Edit config.json with your team details

# 4. Test with one agent
npm start weekly-recap

# 5. Run all agents
npm start
```

## Minimum Configuration Required

### .env
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### config.json - Update These Sections

```json
{
  "team": {
    "ovTeamMembers": [/* Your team members */],
    "jiraTeams": [/* Your Jira team names */]
  },
  "slack": {
    "channels": {
      "teamChannels": [/* Your channel IDs */]
    },
    "myslackuserId": "/* Your Slack user ID */"
  }
}
```

## Find Your IDs Quickly

**Slack Channel ID**: Open channel in browser → Copy from URL
**Slack User ID**: Your profile → More → Copy member ID
**Jira Board ID**: From Ideas board URL

## First Run

```bash
npm start weekly-recap
```

Should see:
- ✓ MCP servers connecting
- ✓ Agent executing
- ✓ Report generated in `reports/`

## Customize

Edit files in `agents/` directory to change what each agent does.

## Need Help?

See SETUP.md for detailed instructions.

## Common Commands

```bash
npm start                      # Run all agents
npm start weekly-recap         # Run one agent
npm start -- --list            # List available agents
npm start -- --help            # Show help
```
