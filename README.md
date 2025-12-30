# Chief of Staff Agent System

A master agent system that provides comprehensive weekly insights for Product Directors, powered by Anthropic's Claude AI and Model Context Protocol (MCP).

## Overview

This system orchestrates multiple specialized agents to analyze different areas of your work:

- **Weekly Recap**: Team communications, activities, and customer interview preparation
- **Business Health**: ARR metrics, deals, churn, and voice of customer insights
- **Product Engineering**: Development progress, launches, usage metrics, and customer calls
- **OKR Progress**: Strategic initiative tracking and progress monitoring

## Architecture

The system is built using the agent architecture pattern with markdown-based instructions:

```
chief-of-staff-agent/
├── agents/                    # Agent instruction files (markdown)
│   ├── weekly-recap.md
│   ├── business-health.md
│   ├── product-engineering.md
│   └── okr-progress.md
├── src/                       # Core system code
│   ├── index.js              # Master orchestrator
│   ├── agent-runner.js       # Agent execution engine
│   ├── mcp-client.js         # MCP connector integration
│   └── report-generator.js   # Report generation
├── reports/                   # Generated reports (auto-created)
├── config.json               # Your configuration
├── .env                      # Environment variables
└── package.json
```

## Prerequisites

1. **Anthropic API Key**: Get one from https://console.anthropic.com/
2. **Node.js**: Version 18 or higher
3. **Claude Desktop with MCP Servers**: The system uses your existing MCP connectors

### Required MCP Servers

You'll need MCP servers configured in Claude Desktop for:
- Slack (for team communications)
- Google Calendar (for calendar access)
- Hubspot (for CRM data)
- Jira/Atlassian (for tickets and ideas boards)
- Confluence (for documentation)
- Mixpanel (for analytics)
- Gong (for call recordings) - optional

## Installation

1. **Clone or download this repository**

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create your configuration files**:

   ```bash
   # Copy and configure environment variables
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY

   # Copy and configure application settings
   cp config.example.json config.json
   # Edit config.json with your team and system details
   ```

4. **Configure your .env file**:
   ```env
   ANTHROPIC_API_KEY=your_api_key_here
   CLAUDE_MODEL=claude-sonnet-4-5-20250929
   MCP_CONFIG_PATH=/Users/yourusername/Library/Application Support/Claude/claude_desktop_config.json
   
   # Optional: MCP connection settings (defaults shown)
   MCP_CONNECTION_TIMEOUT=30000    # Connection timeout in milliseconds (default: 30000 = 30s)
   MCP_MAX_RETRIES=3                # Maximum retry attempts per server (default: 3)
   MCP_RETRY_DELAY=2000             # Initial retry delay in milliseconds (default: 2000 = 2s)
   ```

5. **Configure your config.json**:

   Update `config.json` with your:
   - Team member information (names, Slack IDs, emails)
   - Slack channel IDs
   - Jira team names and board IDs
   - Calendar names
   - Other integration details

## Configuration

### config.json Structure

```json
{
  "team": {
    "ovTeamMembers": [
      {
        "name": "Team Member Name",
        "slackId": "U1",
        "email": "email@w.com",
        "role": "Sr PM"
      }
    ],
    "pmEmailAddresses": ["email@workleap.com"],
    "jiraTeams": ["Team 1", "Team 2"]
  },
  "slack": {
    "channels": {
      "teamChannels": ["C1234567890"],
      "productGeneral": "C1234567890",
      "csmChannels": ["C1234567890"],
      "salesChannels": ["C1234567890"]
    },
    "myslackuserId": "U1234567890"
  },
  "calendar": {
    "name": "Workleap"
  },
  "jira": {
    "ovOkrBoardId": "8570290",
    "aiOkrBoardId": "6898981",
    "projectKey": "WPD"
  },
  "confluence": {
    "vocPageId": "5022581198",
    "spaceKey": "SCE"
  },
  "hubspot": {
    "productFilter": "Officevibe"
  },
  "mixpanel": {
    "projectId": "your_project_id"
  },
  "gong": {
    "enabled": true
  }
}
```

## Usage

### Run All Agents

```bash
npm start
```

This will execute all agents in sequence and generate a comprehensive report.

### Run Specific Agents

```bash
npm start weekly-recap business-health
```

Run only the agents you specify.

### List Available Agents

```bash
npm start -- --list
```

### Get Help

```bash
npm start -- --help
```

## Output

The system generates:

1. **Console output**: Real-time progress and summary
2. **Markdown report**: Saved to `reports/weekly-report-YYYY-MM-DD-HH-MM-SS.md`

## Customizing Agents

Each agent is defined by a markdown file in the `agents/` directory. To customize an agent:

1. Open the corresponding `.md` file (e.g., `agents/weekly-recap.md`)
2. Modify the instructions, data sources, or output format
3. Save the file
4. Run the agent again

### Adding New Agents

1. Create a new markdown file in `agents/` (e.g., `agents/my-custom-agent.md`)
2. Define the agent's:
   - Purpose
   - Data sources
   - Instructions
   - Output format
3. Add the agent name (without `.md`) to the `agents` array in `src/index.js`
4. Run the agent

Example agent structure:

```markdown
# My Custom Agent

## Purpose
[What this agent does]

## Data Sources
- [List of data sources]

## Instructions
[Detailed instructions for Claude]

## Output Format
[Expected output structure]

## Success Criteria
[What defines successful execution]
```

## MCP Integration

The system automatically:
1. Loads your Claude Desktop MCP configuration
2. Connects to all configured MCP servers
3. Makes all MCP tools available to agents
4. Handles tool calls transparently

Agents can use any MCP tool you have configured without code changes.

## Scheduling

To run this weekly automatically, set up a cron job or scheduled task:

### macOS/Linux (crontab)

```bash
# Run every Monday at 8 AM
0 8 * * 1 cd /path/to/chief-of-staff-agent && npm start
```

### Windows (Task Scheduler)

1. Open Task Scheduler
2. Create a new task
3. Set trigger to weekly (e.g., Monday 8 AM)
4. Set action to run: `cmd /c cd /path/to/chief-of-staff-agent && npm start`

## Troubleshooting

### "ANTHROPIC_API_KEY not found"
- Ensure `.env` file exists with your API key
- Verify the key is valid

### "config.json not found"
- Copy `config.example.json` to `config.json`
- Configure with your details

### "Could not load MCP config"
- Verify `MCP_CONFIG_PATH` in `.env` points to your Claude Desktop config
- Default path (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`

### "Tool X not found"
- Ensure the required MCP server is configured in Claude Desktop
- Verify the MCP server is running correctly
- Check MCP server names in Claude Desktop config

### "MCP error -32001: Request timed out"
- This indicates an MCP server connection timeout
- The system now automatically retries failed connections (default: 3 attempts)
- Connections are made in parallel to reduce startup time
- To fix persistent timeouts:
  - Increase `MCP_CONNECTION_TIMEOUT` in `.env` (e.g., `60000` for 60 seconds)
  - Increase `MCP_MAX_RETRIES` in `.env` (e.g., `5` for more retry attempts)
  - Check if the MCP server process is slow to start or has dependencies
  - Verify the MCP server command in Claude Desktop config is correct

### Agent failures
- Check that all required MCP servers are configured
- Verify API credentials for integrated services
- Review agent markdown files for correct tool usage

## Development

### Project Structure

- `src/index.js`: Master orchestrator and CLI
- `src/agent-runner.js`: Executes agents with Claude API
- `src/mcp-client.js`: Manages MCP server connections
- `src/report-generator.js`: Formats and saves reports
- `agents/*.md`: Agent instruction files

### Testing Individual Components

You can test MCP connectivity:

```javascript
import { MCPClientManager } from './src/mcp-client.js';

const client = new MCPClientManager();
await client.initialize();
console.log('Available tools:', client.getAvailableTools());
```

## Best Practices

1. **Keep agents focused**: Each agent should have a specific purpose
2. **Update configurations regularly**: Keep team info and IDs current
3. **Review agent outputs**: Periodically check if agents are providing valuable insights
4. **Customize instructions**: Tailor agent markdown files to your needs
5. **Monitor API usage**: Be mindful of Claude API token consumption

## Contributing

To add features or improve agents:

1. Modify agent markdown files for better instructions
2. Update `config.example.json` for new configuration options
3. Extend `src/agent-runner.js` for new capabilities
4. Add new agents following the existing pattern

## License

MIT

## Support

For issues or questions:
- Review the Troubleshooting section
- Check agent markdown files for instruction clarity
- Verify MCP server configurations
- Ensure all API keys and credentials are valid

## Credits

Architecture inspired by [rachel wolan's agent-chief-of-staff](https://github.com/rachelwolan/agent-chief-of-staff)

Powered by:
- [Anthropic Claude](https://www.anthropic.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
