import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractOneLineSummary, extractInsights } from '../src/utils/summary-extractor.js';
import { FRONTEND, PATHS } from '../src/utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = FRONTEND.PORT;

// Password protection configuration
const APP_PASSWORD = process.env.APP_PASSWORD || null;

app.use(cors());
app.use(express.json());

// Password protection middleware
function passwordProtection(req, res, next) {
  // Skip password check if no password is configured
  if (!APP_PASSWORD) {
    return next();
  }

  // Allow unauthenticated access to the root route to show login form
  if (req.path === '/' && req.method === 'GET') {
    return next();
  }

  // Check for password in header
  const providedPassword = req.headers['x-app-password'];

  if (providedPassword === APP_PASSWORD) {
    return next();
  }

  // Return 401 Unauthorized
  res.status(401).json({
    error: 'Unauthorized',
    message: 'Valid password required'
  });
}

// Apply password protection to all routes except static files
app.use(passwordProtection);

// Debug: Log all requests (useful for Vercel debugging)
if (process.env.VERCEL === '1') {
  app.use((req, res, next) => {
    console.log(`[Vercel Debug] ${req.method} ${req.path}`);
    next();
  });
}

// Path to reports folder - use frontend/reports for Vercel, fallback to parent for local
const REPORTS_DIR = process.env.VERCEL === '1' 
  ? path.join(__dirname, 'reports')
  : path.join(__dirname, '..', PATHS.REPORTS_DIR);

// Path to config.json - use frontend/config.json for Vercel, fallback to parent for local
// On Vercel, config can come from APP_CONFIG_JSON environment variable (as JSON string)
const CONFIG_PATH = process.env.VERCEL === '1'
  ? path.join(__dirname, 'config.json')
  : path.join(__dirname, '..', 'config.json');

// Helper function to load config (from file or environment variable)
function loadConfig() {
  // On Vercel, try environment variable first
  if (process.env.VERCEL === '1' && process.env.APP_CONFIG_JSON) {
    try {
      return JSON.parse(process.env.APP_CONFIG_JSON);
    } catch (error) {
      console.error('Error parsing APP_CONFIG_JSON environment variable:', error);
      // Fall back to file if env var is invalid
    }
  }
  
  // Fall back to reading from file
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(configContent);
    } catch (error) {
      console.error('Error reading config file:', error);
      throw error;
    }
  }
  
  return null;
}

// Serve static files from dist folder if it exists (production build)
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

// Root route - show helpful message or serve frontend
app.get('/', (req, res) => {
  // If dist folder exists, serve the built frontend
  if (fs.existsSync(DIST_DIR)) {
    return res.sendFile(path.join(DIST_DIR, 'index.html'));
  }
  
  // Otherwise, show helpful message
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        
        <title>Chief of Staff API Server</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            line-height: 1.6;
          }
          h1 { color: #333; }
          code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
          }
          .endpoint {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #007bff;
            margin: 10px 0;
          }
        </style>
      </head>
      <body>
        <h1>🚀 Chief of Staff API Server</h1>
        <p>Server is running on <code>http://localhost:${PORT}</code></p>
        
        <h2>Available Endpoints:</h2>
        <div class="endpoint">
          <strong>GET</strong> <code>/api/reports</code> - Get all reports
        </div>
        <div class="endpoint">
          <strong>GET</strong> <code>/api/reports/:filename</code> - Get a specific report
        </div>
        <div class="endpoint">
          <strong>DELETE</strong> <code>/api/reports/:filename</code> - Delete a specific report
        </div>
        <div class="endpoint">
          <strong>GET</strong> <code>/api/agents</code> - Get unique agent names
        </div>
        
        <h2>To View the Frontend:</h2>
        <p>Run the Vite dev server in a separate terminal:</p>
        <pre><code>npm run dev</code></pre>
        <p>Then open <code>http://localhost:3000</code> in your browser.</p>
        
        <p><em>Or build the frontend and it will be served automatically from this server.</em></p>
      </body>
    </html>
  `);
});

// Extraction functions now imported from ../src/utils/summary-extractor.js

/**
 * Extract cost from report content
 * Looks for pattern: **Cost**: $X.XXXX
 */
function extractCost(content) {
  const costRegex = /\*\*Cost\*\*:\s*\$(\d+\.\d+)/;
  const match = content.match(costRegex);
  if (match && match[1]) {
    return parseFloat(match[1]);
  }
  return null;
}

/**
 * Extract execution time from report content
 * Looks for pattern: **Execution Time**: X.XX min or X.XXs (for backward compatibility)
 * Returns value in minutes
 */
function extractExecutionTime(content) {
  // Try minutes format first (new format)
  const execTimeMinRegex = /\*\*Execution Time\*\*:\s*(\d+\.?\d*)\s*min/;
  const minMatch = content.match(execTimeMinRegex);
  if (minMatch && minMatch[1]) {
    return parseFloat(minMatch[1]);
  }
  
  // Fall back to seconds format (old format) and convert to minutes
  const execTimeSecRegex = /\*\*Execution Time\*\*:\s*(\d+\.?\d*)s/;
  const secMatch = content.match(execTimeSecRegex);
  if (secMatch && secMatch[1]) {
    return parseFloat(secMatch[1]) / 60;
  }
  
  return null;
}

// Get all reports
app.get('/api/reports', (req, res) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) {
      return res.status(404).json({ error: 'Reports directory not found' });
    }

    const files = fs.readdirSync(REPORTS_DIR);
    const reports = files
      .filter(file => file.endsWith('.md'))
      .map(file => {
        const filePath = path.join(REPORTS_DIR, file);
        const stats = fs.statSync(filePath);
        
        // Extract agent name from filename
        // Format: agent-name-YYYY-MM-DD-HH-MM-SS.md or weekly-report-YYYY-MM-DD-HH-MM-SS.md
        const match = file.match(/^(.+?)-(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.md$/);
        let agentName = 'unknown';
        let timestamp = stats.mtime;
        
        if (match) {
          agentName = match[1];
          const dateParts = match[2].split('-');
          timestamp = new Date(
            parseInt(dateParts[0]),
            parseInt(dateParts[1]) - 1,
            parseInt(dateParts[2]),
            parseInt(dateParts[3]),
            parseInt(dateParts[4]),
            parseInt(dateParts[5])
          );
        } else {
          // Handle files that don't match the pattern (e.g., "# Weekly Recap Agent")
          // Use the filename without extension as agent name
          agentName = file.replace('.md', '').toLowerCase().replace(/\s+/g, '-');
        }
        
        // Read file content to extract one-line summary, insights, cost, and execution time
        let oneLineSummary = null;
        let insights = [];
        let cost = null;
        let executionTime = null;
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          oneLineSummary = extractOneLineSummary(content);
          // Only extract insights as fallback if no one-line summary found
          if (!oneLineSummary) {
            insights = extractInsights(content);
          }
          // Extract cost and execution time from content
          cost = extractCost(content);
          executionTime = extractExecutionTime(content);
        } catch (err) {
          console.error(`Error reading ${file} for summary:`, err.message);
        }

        return {
          id: file,
          filename: file,
          agentName,
          timestamp: timestamp.toISOString(),
          date: timestamp.toLocaleDateString(),
          time: timestamp.toLocaleTimeString(),
          size: stats.size,
          oneLineSummary,
          insights,
          cost,
          executionTime
        };
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(reports);
  } catch (error) {
    console.error('Error reading reports:', error);
    res.status(500).json({ error: 'Failed to read reports', details: error.message });
  }
});

// Get a specific report content
app.get('/api/reports/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(REPORTS_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content });
  } catch (error) {
    console.error('Error reading report:', error);
    res.status(500).json({ error: 'Failed to read report' });
  }
});

// Delete a specific report
app.delete('/api/reports/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    console.log(`DELETE request received for: ${filename}`);
    const filePath = path.join(REPORTS_DIR, filename);
    console.log(`Resolved file path: ${filePath}`);

    // Security check: ensure the filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.error('Invalid filename detected:', filename);
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return res.status(404).json({ error: 'Report not found' });
    }

    // Delete the file
    fs.unlinkSync(filePath);
    console.log('File deleted successfully:', filePath);
    res.json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report', details: error.message });
  }
});

// Get unique agent names
app.get('/api/agents', (req, res) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) {
      return res.status(404).json({ error: 'Reports directory not found' });
    }

    const files = fs.readdirSync(REPORTS_DIR);
    const agents = new Set();

    files
      .filter(file => file.endsWith('.md'))
      .forEach(file => {
        const match = file.match(/^(.+?)-(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.md$/);
        if (match) {
          agents.add(match[1]);
        } else {
          // Handle files that don't match the pattern
          const agentName = file.replace('.md', '').toLowerCase().replace(/\s+/g, '-');
          agents.add(agentName);
        }
      });

    res.json(Array.from(agents).sort());
  } catch (error) {
    console.error('Error reading agents:', error);
    res.status(500).json({ error: 'Failed to read agents', details: error.message });
  }
});

// Store active executions for progress tracking
const activeExecutions = new Map();

// Run agents endpoint with real-time progress
app.post('/api/run-agents', async (req, res) => {
  try {
    const { agents, dateRange, parameters } = req.body;

    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ error: 'No agents specified' });
    }

    // Feature Telemetry Tracking requires a feature (release key from config.releases)
    if (agents.includes('feature-telemetry-tracking')) {
      const feature = parameters?.feature?.trim?.() || parameters?.feature || '';
      if (!feature) {
        return res.status(400).json({
          error: 'Feature required',
          details: 'Please select a feature from the "Feature (release)" dropdown when running Feature Telemetry Tracking.'
        });
      }
    }

    console.log('Received agent execution request:', { agents, dateRange, parameters });

    // Build command arguments
    const args = ['start', '--'];

    // Add agent names
    agents.forEach(agent => args.push(agent));

    // Add date range if provided
    console.log('Date range check - startDate:', dateRange?.startDate, 'endDate:', dateRange?.endDate);
    if (dateRange?.startDate) {
      console.log('Adding --start-date argument:', dateRange.startDate);
      args.push('--start-date', dateRange.startDate);
    }
    if (dateRange?.endDate) {
      console.log('Adding --end-date argument:', dateRange.endDate);
      args.push('--end-date', dateRange.endDate);
    }

    // Add parameters if provided
    if (parameters?.slackUserId) {
      args.push('--slack-user-id', parameters.slackUserId);
    }
    if (parameters?.manualSourcesFolder) {
      args.push('--manual-sources-folder', parameters.manualSourcesFolder);
    }
    if (parameters?.folder) {
      args.push('--folder', parameters.folder);
    }
    if (parameters?.email) {
      args.push('--email', parameters.email);
    }
    if (parameters?.week) {
      args.push('--week', parameters.week);
    }
    if (parameters?.insightIds) {
      // For comma-separated values, ensure they're passed as a single argument
      // The value may contain spaces after commas (e.g., "87660800, 87660767, 87660827")
      // which should be preserved as a single argument
      args.push('--insight-ids', parameters.insightIds.trim());
      console.log('[Server] Adding insightIds parameter:', parameters.insightIds.trim());
    }
    if (parameters?.feature) {
      const featureVal = typeof parameters.feature === 'string' ? parameters.feature.trim() : String(parameters.feature || '').trim();
      if (featureVal) {
        args.push('--feature', featureVal);
        console.log('[Server] Adding feature parameter:', featureVal);
      }
    }

    const commandStr = `npm ${args.join(' ')}`;
    console.log('Executing command:', commandStr);
    console.log('[Server] Args array:', JSON.stringify(args));

    // Execute the command
    const { spawn } = await import('child_process');
    const child = spawn('npm', args, {
      cwd: path.join(__dirname, '..'),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (!child.pid) {
      throw new Error('Failed to spawn process');
    }

    // Store execution info
    const executionId = Date.now().toString();
    activeExecutions.set(executionId, {
      pid: child.pid,
      agents,
      logs: [],
      status: 'running',
      startTime: new Date()
    });

    // Capture stdout
    child.stdout.on('data', (data) => {
      const log = data.toString();
      console.log(log);
      const execution = activeExecutions.get(executionId);
      if (execution) {
        execution.logs.push({ type: 'stdout', message: log, timestamp: new Date() });
      }
    });

    // Capture stderr
    child.stderr.on('data', (data) => {
      const log = data.toString();
      console.error(log);
      const execution = activeExecutions.get(executionId);
      if (execution) {
        execution.logs.push({ type: 'stderr', message: log, timestamp: new Date() });
      }
    });

    // Handle process completion
    child.on('exit', (code) => {
      console.log(`Agent execution completed with code ${code}`);
      const execution = activeExecutions.get(executionId);
      if (execution) {
        execution.status = code === 0 ? 'completed' : 'failed';
        execution.exitCode = code;
        execution.endTime = new Date();
      }
    });

    // Handle process errors
    child.on('error', (error) => {
      console.error('Process error:', error);
      const execution = activeExecutions.get(executionId);
      if (execution) {
        execution.status = 'error';
        execution.error = error.message;
        execution.logs.push({ type: 'error', message: error.message, timestamp: new Date() });
      }
    });

    // Send immediate response that execution has started
    res.json({
      success: true,
      message: 'Agent execution started',
      agents,
      executionId,
      pid: child.pid
    });

  } catch (error) {
    console.error('Error running agents:', error);
    res.status(500).json({
      error: 'Failed to run agents',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get execution status and logs
app.get('/api/execution/:executionId', (req, res) => {
  const { executionId } = req.params;
  const execution = activeExecutions.get(executionId);

  if (!execution) {
    return res.status(404).json({ error: 'Execution not found' });
  }

  res.json(execution);
});

// Anthropic Usage & Billing (Admin API optional)
// Balance and spending limit are only visible in Console; we can fetch period spend via Cost API when Admin key is set.
const ANTHROPIC_ADMIN_API_KEY = process.env.ANTHROPIC_ADMIN_API_KEY || null;
const ANTHROPIC_BILLING_URL = 'https://console.anthropic.com/settings/billing';

app.get('/api/anthropic-usage', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const startingAt = startOfMonth.toISOString();
    const endingAt = endOfMonth.toISOString();

    let periodSpend = null;
    let periodSpendError = null;

    if (ANTHROPIC_ADMIN_API_KEY) {
      try {
        const url = `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(startingAt)}&ending_at=${encodeURIComponent(endingAt)}&bucket_width=1d&limit=31`;
        const apiRes = await fetch(url, {
          headers: {
            'anthropic-version': '2023-06-01',
            'x-api-key': ANTHROPIC_ADMIN_API_KEY
          }
        });
        if (apiRes.ok) {
          const data = await apiRes.json();
          let totalCents = 0;
          for (const bucket of data.data || []) {
            for (const item of bucket.results || []) {
              const amount = parseFloat(item.amount);
              if (!Number.isNaN(amount)) totalCents += amount;
            }
          }
          periodSpend = totalCents / 100; // amount is in cents
        } else {
          periodSpendError = apiRes.status === 401 ? 'Invalid Admin API key' : `API ${apiRes.status}`;
        }
      } catch (err) {
        periodSpendError = err.message || 'Failed to fetch cost report';
      }
    }

    res.json({
      balance: null,
      balanceNote: 'View in Console',
      limit: null,
      limitNote: 'View in Console',
      periodSpend,
      periodSpendError,
      periodLabel: `${startOfMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} spend`,
      linkToBilling: ANTHROPIC_BILLING_URL,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in anthropic-usage:', error);
    res.status(500).json({
      error: 'Failed to get Anthropic usage',
      details: error.message,
      linkToBilling: ANTHROPIC_BILLING_URL
    });
  }
});

// Get config.json
app.get('/api/config', (req, res) => {
  try {
    const config = loadConfig();
    
    if (!config) {
      return res.status(404).json({ error: 'Config not found' });
    }

    res.json(config);
  } catch (error) {
    console.error('Error reading config:', error);
    res.status(500).json({ error: 'Failed to read config', details: error.message });
  }
});

// Update config.json
app.put('/api/config', (req, res) => {
  try {
    const newConfig = req.body;

    // Validate that it's a valid object
    if (!newConfig || typeof newConfig !== 'object') {
      return res.status(400).json({ error: 'Invalid config format' });
    }

    // On Vercel, file system is read-only - config updates must be done via environment variables
    if (process.env.VERCEL === '1') {
      return res.status(403).json({ 
        error: 'Config updates not supported on Vercel',
        message: 'Please update APP_CONFIG_JSON environment variable in Vercel Dashboard and redeploy'
      });
    }

    // Create a backup of the current config (in same directory as config.json)
    const configDir = path.dirname(CONFIG_PATH);
    const backupPath = path.join(configDir, `config.backup.${Date.now()}.json`);
    if (fs.existsSync(CONFIG_PATH)) {
      fs.copyFileSync(CONFIG_PATH, backupPath);
      console.log(`Config backup created at: ${backupPath}`);
    }

    // Write the new config
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
    console.log('Config updated successfully');

    res.json({ success: true, message: 'Config updated successfully', backupPath });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: 'Failed to update config', details: error.message });
  }
});

// Server-Sent Events endpoint for real-time progress
app.get('/api/execution/:executionId/stream', (req, res) => {
  const { executionId } = req.params;
  const execution = activeExecutions.get(executionId);

  if (!execution) {
    return res.status(404).json({ error: 'Execution not found' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send existing logs
  execution.logs.forEach(log => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  });

  // Set up interval to check for new logs
  let lastLogIndex = execution.logs.length;
  const interval = setInterval(() => {
    const currentExecution = activeExecutions.get(executionId);
    if (!currentExecution) {
      clearInterval(interval);
      res.end();
      return;
    }

    // Send new logs
    if (currentExecution.logs.length > lastLogIndex) {
      for (let i = lastLogIndex; i < currentExecution.logs.length; i++) {
        res.write(`data: ${JSON.stringify(currentExecution.logs[i])}\n\n`);
      }
      lastLogIndex = currentExecution.logs.length;
    }

    // Send status update
    if (currentExecution.status !== 'running') {
      res.write(`data: ${JSON.stringify({ type: 'status', status: currentExecution.status, exitCode: currentExecution.exitCode })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
  });
});

// Check MCP connection status
app.get('/api/mcp-status', async (req, res) => {
  try {
    // Import MCPClientManager
    const { MCPClientManager } = await import('../src/mcp-client.js');

    // Create a temporary MCP client instance
    const mcpClient = new MCPClientManager();
    const mcpServers = mcpClient.loadMCPConfig();

    const serverNames = Object.keys(mcpServers);
    const serverStatuses = [];

    console.log(`Checking status for ${serverNames.length} MCP servers...`);

    // Test each server connection
    for (const serverName of serverNames) {
      const serverConfig = mcpServers[serverName];
      const status = {
        name: serverName,
        config: {
          command: serverConfig.command,
          args: serverConfig.args || []
        },
        connected: false,
        toolCount: 0,
        error: null
      };

      try {
        // Try to connect to the server with timeout
        await mcpClient.connectToServer(serverName, serverConfig);

        // If connection succeeded, get tool count and details
        const tools = Array.from(mcpClient.tools.entries())
          .filter(([_, info]) => info.serverName === serverName)
          .map(([toolName, info]) => ({
            name: toolName,
            description: info.schema.description || 'No description available'
          }));

        status.connected = true;
        status.toolCount = tools.length;
        status.tools = tools;

        console.log(`✓ ${serverName}: Connected (${tools.length} tools)`);
      } catch (error) {
        status.error = error.message;
        console.log(`✗ ${serverName}: ${error.message}`);
      }

      serverStatuses.push(status);
    }

    // Clean up connections
    await mcpClient.close();

    const connectedCount = serverStatuses.filter(s => s.connected).length;
    const totalCount = serverStatuses.length;

    res.json({
      totalServers: totalCount,
      connectedServers: connectedCount,
      failedServers: totalCount - connectedCount,
      servers: serverStatuses,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking MCP status:', error);
    res.status(500).json({
      error: 'Failed to check MCP status',
      details: error.message
    });
  }
});

// Refresh MCP connections
app.post('/api/mcp-refresh', async (req, res) => {
  try {
    // Import MCPClientManager
    const { MCPClientManager } = await import('../src/mcp-client.js');

    // Create a temporary MCP client instance
    const mcpClient = new MCPClientManager();

    console.log('Refreshing MCP connections...');

    // Close existing connections
    await mcpClient.close().catch(() => {}); // Ignore errors if not initialized

    // Reinitialize connections
    await mcpClient.initialize();

    // Get connection summary
    const tools = mcpClient.getAvailableTools();
    const connectedCount = mcpClient.clients.size;

    // Clean up
    await mcpClient.close();

    res.json({
      success: true,
      message: 'MCP connections refreshed successfully',
      connectedServers: connectedCount,
      availableTools: tools.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error refreshing MCP connections:', error);
    res.status(500).json({
      error: 'Failed to refresh MCP connections',
      details: error.message
    });
  }
});

// Clear Slack MCP cache
app.post('/api/mcp-clear-cache', async (req, res) => {
  try {
    const os = await import('os');
    const cacheDir = path.join(os.default.homedir(), 'Library/Caches/slack-mcp-server');
    const channelCacheFile = path.join(cacheDir, 'channels_cache_v2.json');
    const usersCacheFile = path.join(cacheDir, 'users_cache.json');

    const clearedFiles = [];
    const errors = [];

    // Try to delete channel cache
    if (fs.existsSync(channelCacheFile)) {
      try {
        fs.unlinkSync(channelCacheFile);
        clearedFiles.push('channels_cache_v2.json');
      } catch (error) {
        errors.push(`Failed to delete channel cache: ${error.message}`);
      }
    }

    // Try to delete users cache
    if (fs.existsSync(usersCacheFile)) {
      try {
        fs.unlinkSync(usersCacheFile);
        clearedFiles.push('users_cache.json');
      } catch (error) {
        errors.push(`Failed to delete users cache: ${error.message}`);
      }
    }

    if (clearedFiles.length > 0) {
      res.json({
        success: true,
        message: `Cleared ${clearedFiles.length} cache file(s)`,
        clearedFiles,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: true,
        message: 'No cache files found to clear',
        clearedFiles: [],
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Error clearing Slack cache:', error);
    res.status(500).json({
      error: 'Failed to clear Slack cache',
      details: error.message
    });
  }
});

// Handle client-side routing - serve index.html for .md URLs
app.get('/*.md', (req, res) => {
  if (fs.existsSync(DIST_DIR)) {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  } else {
    res.status(404).send('Frontend not built. Run: cd frontend && npm run build');
  }
});

// Export app for Vercel serverless function use
export default app;

// Only start server if running directly (not as serverless function)
// Check if this module is being executed directly vs imported
const isVercel = process.env.VERCEL === '1';
const isMainModule = process.argv[1] && 
                     (import.meta.url === `file://${process.argv[1]}` || 
                      process.argv[1].endsWith('server.js') ||
                      import.meta.url.endsWith('server.js'));

if (!isVercel && isMainModule) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Access from network at http://10.88.111.20:${PORT}`);
  });
}

