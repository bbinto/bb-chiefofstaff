# Architecture Documentation

## System Overview

The Chief of Staff Agent is a modular system that orchestrates multiple specialized AI agents to analyze different aspects of product management work. Each agent operates independently but shares a common configuration and toolset.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Master Orchestrator                      │
│                      (src/index.js)                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├──► Loads Configuration (config.json)
                 ├──► Initializes MCP Client
                 └──► Runs Agents Sequentially
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Agent 1    │  │   Agent 2    │  │   Agent N    │
│ (weekly-     │  │ (business-   │  │   (okr-      │
│  recap.md)   │  │  health.md)  │  │  progress.md)│
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │  Agent Runner    │
              │ (agent-runner.js)│
              └────────┬─────────┘
                       │
                       ├──► Loads Agent Instructions
                       ├──► Calls Claude API
                       └──► Executes MCP Tools
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
              ┌─────────┐  ┌─────────┐  ┌─────────┐
              │  Slack  │  │  Jira   │  │ Calendar│
              │  MCP    │  │  MCP    │  │  MCP    │
              └─────────┘  └─────────┘  └─────────┘
                                 │
                                 ▼
                      ┌──────────────────┐
                      │ Report Generator │
                      │ (report-gen.js)  │
                      └────────┬─────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │  Markdown   │
                        │   Report    │
                        └─────────────┘
```

## Components

### 1. Master Orchestrator (`src/index.js`)

**Responsibilities:**
- CLI interface and argument parsing
- Configuration loading
- Component initialization
- Agent execution orchestration
- Error handling and logging

**Key Methods:**
- `initialize()`: Sets up all components
- `runAllAgents()`: Executes all agents sequentially
- `runSpecificAgents()`: Executes selected agents
- `generateReport()`: Creates final report

### 2. MCP Client Manager (`src/mcp-client.js`)

**Responsibilities:**
- Loading Claude Desktop MCP configuration
- Connecting to MCP servers
- Managing tool registry
- Executing tool calls

**Key Methods:**
- `loadMCPConfig()`: Reads Claude Desktop config
- `initialize()`: Connects to all MCP servers
- `callTool()`: Executes an MCP tool
- `getAvailableTools()`: Returns all available tools

**Connection Flow:**
```
1. Read claude_desktop_config.json
2. For each MCP server:
   - Create StdioClientTransport
   - Initialize MCP Client
   - Connect via stdio
   - Register available tools
3. Build unified tool registry
```

### 3. Agent Runner (`src/agent-runner.js`)

**Responsibilities:**
- Loading agent instructions from markdown
- Building context from configuration
- Managing Claude API conversations
- Handling tool use loop
- Processing agent outputs

**Key Methods:**
- `loadAgentInstructions()`: Reads .md files
- `runAgent()`: Executes a single agent
- `buildContextMessage()`: Creates configuration context
- `buildToolsSchema()`: Converts MCP tools to Claude format

**Execution Flow:**
```
1. Load agent markdown instructions
2. Build context with configuration
3. Create initial message to Claude
4. Enter tool use loop:
   a. Send messages to Claude API
   b. If tool_use: Execute via MCP
   c. Add tool result to conversation
   d. Continue until completion
5. Extract and return final output
```

### 4. Report Generator (`src/report-generator.js`)

**Responsibilities:**
- Formatting agent outputs
- Creating markdown reports
- Saving reports to disk
- Generating execution summaries

**Key Methods:**
- `generateReport()`: Creates full markdown report
- `generateSummary()`: Creates execution summary
- `buildAgentSection()`: Formats individual agent output

## Data Flow

### Configuration Flow
```
config.json
    │
    ├──► Team Info ──────┐
    ├──► Slack Config ───┤
    ├──► Jira Config ────┼──► Agent Context
    ├──► Calendar Config ─┤
    └──► Other Config ────┘
```

### Agent Execution Flow
```
1. Load Instructions (agents/*.md)
2. Inject Configuration Context
3. Send to Claude API with MCP Tools
4. Claude analyzes and decides which tools to use
5. Execute tools via MCP (e.g., query Slack, Jira)
6. Claude processes results
7. Repeat 4-6 until analysis complete
8. Return formatted output
```

### MCP Tool Flow
```
Agent Runner
    │
    ├──► Requests tool execution
    │
MCP Client Manager
    │
    ├──► Looks up tool in registry
    ├──► Finds appropriate MCP server
    ├──► Calls server via stdio
    │
MCP Server (e.g., Slack)
    │
    ├──► Executes actual API call
    └──► Returns structured result
    │
MCP Client Manager
    │
    └──► Returns result to Agent Runner
```

## Agent Architecture

Each agent is defined by a markdown file with this structure:

```markdown
# Agent Name

## Purpose
[What the agent does]

## Data Sources
[List of data sources and MCP tools]

## Instructions
[Detailed instructions for Claude AI]

## Output Format
[Expected output structure]

## Success Criteria
[What defines successful execution]
```

**Why Markdown?**
- Easy to read and edit
- No code changes needed to update agents
- Non-technical users can modify behavior
- Version control friendly
- Self-documenting

## Extension Points

### Adding New Agents

1. Create `agents/new-agent.md`
2. Define purpose, data sources, instructions
3. Add to `agents` array in `src/index.js`
4. Run: `npm start new-agent`

### Adding New MCP Servers

1. Configure in Claude Desktop
2. System automatically discovers tools
3. Reference tools in agent markdown
4. No code changes needed

### Customizing Output

1. Modify agent markdown Output Format section
2. Or extend `ReportGenerator` for different formats

## Security Considerations

### API Keys
- Stored in `.env` (gitignored)
- Never committed to version control
- Loaded via dotenv

### Configuration
- `config.json` contains sensitive IDs (gitignored)
- Use `config.example.json` as template

### MCP Security
- MCP servers run with Claude Desktop permissions
- Tools inherit Claude Desktop's access
- Review MCP server configurations

## Performance Considerations

### Token Usage
- Each agent makes multiple API calls
- Tool use increases token consumption
- Monitor usage in Anthropic console
- Consider using Claude Haiku for simple queries

### Execution Time
- Agents run sequentially (not parallel)
- Each agent: 30 seconds to 3 minutes
- Full run: 5-15 minutes typical
- Can run individual agents for faster results

### Rate Limiting
- Respects Anthropic API rate limits
- MCP tools may have their own rate limits
- Consider spacing automated runs

## Error Handling

### MCP Connection Failures
- Logged but non-fatal
- System continues with available tools
- Agent may fail if required tool unavailable

### Agent Execution Failures
- Caught and logged
- Other agents continue executing
- Partial report generated

### API Errors
- Network errors are retried (by SDK)
- Rate limits are handled gracefully
- Errors included in report output

## Testing

### Test MCP Connection
```bash
npm run test-mcp
```

### Test Single Agent
```bash
npm start weekly-recap
```

### Test Configuration
```bash
npm run list
npm run help
```

## Monitoring

### Logs
- Console output during execution
- Reports saved to `reports/`
- Token usage per agent

### Metrics to Watch
- Agent success/failure rates
- Execution time per agent
- Token consumption
- MCP tool availability

## Future Enhancements

### Potential Improvements
1. **Parallel Agent Execution**: Run agents concurrently
2. **Caching**: Cache MCP tool results
3. **Incremental Updates**: Only fetch changed data
4. **Custom Output Formats**: PDF, email, Slack posts
5. **Interactive Mode**: Ask follow-up questions
6. **Agent Dependencies**: Chain agents with shared data
7. **Scheduling UI**: Web interface for configuration
8. **Result Storage**: Database for historical reports
9. **Comparison Views**: Week-over-week changes
10. **Alert System**: Notify on significant changes

## Technology Stack

- **Runtime**: Node.js 18+
- **AI**: Anthropic Claude API (Sonnet 4.5)
- **Integration**: Model Context Protocol (MCP)
- **Configuration**: JSON + Environment Variables
- **Reports**: Markdown
- **Agent Definitions**: Markdown

## Dependencies

- `@anthropic-ai/sdk`: Claude API client
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `dotenv`: Environment variable management

## Maintenance

### Regular Updates
- Update agent instructions based on feedback
- Keep configuration current (team changes, new channels)
- Monitor API usage and costs
- Review and update MCP server configurations

### Troubleshooting Steps
1. Check MCP connection: `npm run test-mcp`
2. Verify configuration: Review config.json
3. Test individual agents: `npm start agent-name`
4. Check API key validity
5. Review Claude Desktop MCP settings

## Best Practices

1. **Agent Design**
   - Keep agents focused on one area
   - Provide clear, specific instructions
   - Define structured output formats

2. **Configuration**
   - Keep team info up to date
   - Use descriptive names
   - Document custom IDs

3. **Execution**
   - Run during off-hours for weekly reports
   - Test configuration changes with single agents
   - Monitor token usage

4. **Customization**
   - Modify agent markdown, not core code
   - Use configuration for environment-specific values
   - Version control agent instructions
