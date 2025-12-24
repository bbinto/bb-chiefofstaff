# Project Structure

## Directory Layout

```
chief-of-staff-agent/
│
├── agents/                           # Agent instruction files (edit these!)
│   ├── weekly-recap.md              # Team communications & customer prep
│   ├── business-health.md           # ARR, deals, churn, VoC
│   ├── product-engineering.md       # Development progress & launches
│   └── okr-progress.md              # OKR tracking and progress
│
├── src/                              # Core system code (don't edit unless extending)
│   ├── index.js                     # Master orchestrator & CLI
│   ├── agent-runner.js              # Agent execution engine
│   ├── mcp-client.js                # MCP server connection manager
│   └── report-generator.js          # Report formatting & saving
│
├── reports/                          # Generated reports (auto-created)
│   └── weekly-report-YYYY-MM-DD-HH-MM-SS.md
│
├── .env                              # Your environment variables (create from .env.example)
├── .env.example                      # Environment template
├── config.json                       # Your configuration (create from config.example.json)
├── config.example.json               # Configuration template
│
├── package.json                      # Node.js dependencies
├── .gitignore                        # Git ignore rules
│
├── test-mcp.js                       # MCP connection testing utility
│
└── Documentation/
    ├── README.md                     # Main documentation
    ├── QUICKSTART.md                 # 5-minute setup guide
    ├── SETUP.md                      # Detailed setup instructions
    ├── ARCHITECTURE.md               # System architecture deep-dive
    └── PROJECT-STRUCTURE.md          # This file
```

## File Purposes

### Configuration Files (Edit These)

| File | Purpose | Required |
|------|---------|----------|
| `.env` | API keys and environment settings | Yes |
| `config.json` | Team info, Slack channels, Jira boards, etc. | Yes |

### Agent Files (Customize These)

| File | Purpose | What It Analyzes |
|------|---------|------------------|
| `agents/weekly-recap.md` | Weekly catch-up | Slack messages, team activities, customer interviews |
| `agents/business-health.md` | Business metrics | ARR, deals, churn, voice of customer |
| `agents/product-engineering.md` | Development updates | Tickets, launches, usage, Gong calls |
| `agents/okr-progress.md` | Strategic progress | OKR updates, AI initiatives |

### Core System Files (Usually Don't Edit)

| File | Purpose | Modify? |
|------|---------|---------|
| `src/index.js` | Master orchestrator | Only to add new agents |
| `src/agent-runner.js` | Agent execution | Only for advanced features |
| `src/mcp-client.js` | MCP connectivity | Rarely |
| `src/report-generator.js` | Report formatting | Only for custom output |

### Documentation Files

| File | When to Read |
|------|--------------|
| `README.md` | Overview and main reference |
| `QUICKSTART.md` | First time setup (5 min) |
| `SETUP.md` | Detailed setup guide |
| `ARCHITECTURE.md` | Understanding how it works |
| `PROJECT-STRUCTURE.md` | Understanding file organization |

### Utility Files

| File | Purpose | Usage |
|------|---------|-------|
| `test-mcp.js` | Test MCP connections | `npm run test-mcp` |
| `package.json` | Dependencies and scripts | `npm install` |
| `.gitignore` | Git ignore rules | Automatic |

## What Gets Created Automatically

### On First Run
- `reports/` directory
- First report file

### On Git Init
- `.git/` directory (if you initialize a repo)

## What You Need to Create

1. **Copy and configure**:
   ```bash
   cp .env.example .env
   cp config.example.json config.json
   ```

2. **Edit**:
   - `.env` → Add your `ANTHROPIC_API_KEY`
   - `config.json` → Add your team details, IDs, etc.

3. **Optionally customize**:
   - `agents/*.md` files → Change what each agent does

## What NOT to Commit to Git

These files contain sensitive information:
- `.env` (API keys)
- `config.json` (internal IDs and team info)
- `reports/` (generated reports may contain sensitive data)
- `node_modules/` (dependencies)

These are already in `.gitignore`.

## Typical Workflow

### Initial Setup
1. Clone/download project
2. `npm install`
3. Copy `.env.example` → `.env`
4. Copy `config.example.json` → `config.json`
5. Edit both with your details
6. `npm run test-mcp` to verify MCP
7. `npm start weekly-recap` to test one agent
8. `npm start` to run all agents

### Regular Use
1. `npm start` (weekly)
2. Review report in `reports/`
3. Optionally customize agents
4. Repeat

### Maintenance
1. Update `config.json` when team changes
2. Edit `agents/*.md` to refine analysis
3. Check `npm run test-mcp` if issues arise

## File Sizes (Approximate)

| File Type | Size |
|-----------|------|
| Agent .md files | 2-4 KB each |
| Core .js files | 3-8 KB each |
| Config files | 1-2 KB |
| Generated reports | 10-50 KB |

## Where to Make Changes

### To Change What Agents Analyze
→ Edit `agents/*.md` files

### To Add a New Agent
1. Create `agents/new-agent.md`
2. Add to `agents` array in `src/index.js`

### To Change Team Info
→ Edit `config.json`

### To Change API Settings
→ Edit `.env`

### To Change Report Format
→ Edit `src/report-generator.js`

### To Add New MCP Tools
→ Configure in Claude Desktop (no code changes needed)

## Common Tasks

### Add a team member
```
Edit config.json → team.ovTeamMembers
```

### Add a Slack channel to monitor
```
Edit config.json → slack.channels.teamChannels
```

### Change how business health is analyzed
```
Edit agents/business-health.md
```

### Run only specific agents
```bash
npm start weekly-recap business-health
```

### Test MCP connectivity
```bash
npm run test-mcp
```

### See available agents
```bash
npm run list
```

## Dependencies

### Runtime Dependencies
- `@anthropic-ai/sdk` - Claude API client
- `@modelcontextprotocol/sdk` - MCP protocol
- `dotenv` - Environment variables

### External Dependencies
- Node.js 18+
- Claude Desktop with MCP servers
- Anthropic API key

## Version Control

### Should Be Committed
- All `.md` documentation
- `agents/*.md` files
- `src/*.js` files
- `.env.example`, `config.example.json`
- `package.json`
- `.gitignore`

### Should NOT Be Committed
- `.env`, `config.json`
- `reports/`
- `node_modules/`
- Any generated files

## Backup Recommendations

Back up regularly:
1. Your `config.json` (privately)
2. Your `.env` (privately)
3. Custom `agents/*.md` files
4. Important reports from `reports/`

## Navigation Guide

**Want to...**
- Understand the system → `README.md`
- Set it up quickly → `QUICKSTART.md`
- Detailed setup help → `SETUP.md`
- Understand architecture → `ARCHITECTURE.md`
- Find a specific file → This file
- Change what agents do → `agents/*.md`
- Configure team/IDs → `config.json`
- Add API key → `.env`
- Test MCP → `npm run test-mcp`
- Run the system → `npm start`
