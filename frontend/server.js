import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { extractOneLineSummary, extractInsights } from '../src/utils/summary-extractor.js';
import { FRONTEND, PATHS } from '../src/utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFileIntoProcess(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const cleanedLine = line.startsWith('export ') ? line.slice(7).trim() : line;
    const equalIndex = cleanedLine.indexOf('=');
    if (equalIndex <= 0) {
      continue;
    }

    const key = cleanedLine.slice(0, equalIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = cleanedLine.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

// Ensure environment variables are loaded for local server usage.
loadEnvFileIntoProcess(path.join(__dirname, '..', '.env'));
loadEnvFileIntoProcess(path.join(__dirname, '.env'));

const app = express();
const PORT = FRONTEND.PORT;

// Password protection configuration
const APP_PASSWORD = process.env.APP_PASSWORD || null;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;
const GOOGLE_GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || null;

// LLM Settings - persisted to disk and loaded on startup
const LLM_SETTINGS_PATH = path.join(__dirname, '..', 'llm-settings.json');

// Notifications Settings - persisted to disk
const NOTIFICATIONS_SETTINGS_PATH = path.join(__dirname, '..', 'notifications-settings.json');

function loadNotificationsSettings() {
  if (fs.existsSync(NOTIFICATIONS_SETTINGS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(NOTIFICATIONS_SETTINGS_PATH, 'utf-8'));
    } catch {
      console.warn('[Notifications] Failed to parse notifications-settings.json');
    }
  }
  return null;
}

function saveNotificationsSettings(settings) {
  try {
    fs.writeFileSync(NOTIFICATIONS_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Notifications] Failed to save notifications-settings.json:', err.message);
  }
}

const _persistedNotifications = loadNotificationsSettings();
let notificationsSettings = {
  smsEnabled: _persistedNotifications?.smsEnabled ?? false,
  phoneNumber: _persistedNotifications?.phoneNumber ?? '',
};

async function sendSmsNotification(agentNames, status) {
  if (!notificationsSettings.smsEnabled || !notificationsSettings.phoneNumber) return;
  const agentList = Array.isArray(agentNames) ? agentNames.join(', ') : agentNames;
  const statusEmoji = status === 'completed' ? '✅' : '❌';
  const message = `${statusEmoji} Chief of Staff: ${agentList} report ${status}.`;
  try {
    const response = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: notificationsSettings.phoneNumber, message, key: process.env.TEXTBELT_KEY || 'textbelt' }),
    });
    const result = await response.json();
    if (result.success) {
      console.log(`[SMS] Sent notification to ${notificationsSettings.phoneNumber}`);
    } else {
      console.warn(`[SMS] Failed to send notification: ${result.error}`);
    }
  } catch (err) {
    console.error(`[SMS] Error sending notification: ${err.message}`);
  }
}

function loadPersistedLLMSettings() {
  if (fs.existsSync(LLM_SETTINGS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(LLM_SETTINGS_PATH, 'utf-8'));
    } catch {
      console.warn('[LLM Settings] Failed to parse llm-settings.json, using env defaults');
    }
  }
  return null;
}

function savePersistedLLMSettings(settings) {
  try {
    fs.writeFileSync(LLM_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[LLM Settings] Failed to save llm-settings.json:', err.message);
  }
}

const _persisted = loadPersistedLLMSettings();
let llmSettings = {
  useOllama: _persisted?.useOllama ?? (process.env.USE_OLLAMA === 'true'),
  useGemini: _persisted?.useGemini ?? (process.env.USE_GEMINI === 'true'),
  ollamaModel: _persisted?.ollamaModel ?? (process.env.OLLAMA_MODEL || 'mistral'),
  ollamaBaseUrl: _persisted?.ollamaBaseUrl ?? 'http://localhost:11434',
  ollamaApiKey: _persisted?.ollamaApiKey ?? (process.env.OLLAMA_API_KEY || ''),
  claudeModel: _persisted?.claudeModel ?? (process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929'),
  geminiModel: _persisted?.geminiModel ?? (process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
};

function buildLightReportPrompt(filename, reportContent) {
  const system = [
    'You are an executive communications assistant and podcast script writer.',
    'Create a LIGHT version of the provided report in markdown that sounds natural when read aloud by a text-to-speech engine.',
    'Focus only on the most important information for executives.',
    '',
    'STRICT REQUIREMENTS:',
    '- Remove token usage, environmental impact, cost, execution metadata, and other operational telemetry.',
    '- Start directly with key business content (no preamble).',
    '- Keep it concise, actionable, and easy to scan.',
    '- Make it TTS-friendly: short sentences, natural punctuation, no emojis, no code blocks, no tables, no raw URLs.',
    '- Expand uncommon abbreviations on first use when possible and avoid symbol-heavy text.',
    '- Write in spoken language suitable for a podcast host. Avoid robotic or overly formal phrasing.',
    '- Use brief transition lines between sections (for example: "Next, the key insights." or "Now, the actions.").',
    '- Prefer short narration paragraphs and simple numbered actions over dense bullet lists.',
    '- Keep each section tight: typically 2 to 5 short lines.',
    '- Include these sections in this order:',
    '  1) ## One-Line Executive Summary',
    '  2) ## Most Important Insights',
    '  3) ## Actions to Take',
    '  4) ## Risks / Watchouts (if applicable)',
    '- For "Actions to Take", use numbered items with clear owner-oriented wording.',
    '- Preserve concrete facts/dates/metrics from the original report when present.',
    '- Return markdown only. Do not add any commentary, explanation, or text outside the markdown report.',
  ].join('\n');

  const user = [
    `Original filename: ${filename}`,
    '',
    'Original report markdown:',
    reportContent
  ].join('\n');

  return { system, user };
}

function sanitizeLightReportForTTS(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractAnthropicText(data) {
  if (!data || !Array.isArray(data.content)) {
    return '';
  }
  return data.content
    .filter((item) => item && item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
    .trim();
}

function extractOllamaText(data) {
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}

function buildOllamaChatUrl(baseUrl) {
  const trimmed = String(baseUrl || 'http://localhost:11434').replace(/\/$/, '');
  return trimmed.endsWith('/v1') ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
}

async function generateLightReportWithClaude({ system, user }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Configure Claude API key or switch to Ollama in Settings.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY
    },
    body: JSON.stringify({
      model: llmSettings.claudeModel || 'claude-sonnet-4-5-20250929',
      max_tokens: 3000,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err = data?.error?.message || responseText || `Claude request failed with status ${response.status}`;
    throw new Error(err);
  }

  const markdown = extractAnthropicText(data);
  if (!markdown) {
    throw new Error('Claude returned an empty light report.');
  }

  return markdown;
}

async function generateLightReportWithOllama({ system, user }) {
  const endpoint = buildOllamaChatUrl(llmSettings.ollamaBaseUrl);
  const ollamaHeaders = { 'Content-Type': 'application/json' };
  if (llmSettings.ollamaApiKey) {
    ollamaHeaders['Authorization'] = `Bearer ${llmSettings.ollamaApiKey}`;
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: ollamaHeaders,
    body: JSON.stringify({
      model: llmSettings.ollamaModel || 'mistral',
      max_tokens: 3000,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err = data?.error?.message || data?.error || responseText || `Ollama request failed with status ${response.status}`;
    throw new Error(err);
  }

  const markdown = extractOllamaText(data);
  if (!markdown) {
    throw new Error('Ollama returned an empty light report.');
  }

  return markdown;
}

async function generateLightReportWithGemini({ system, user }) {
  if (!GOOGLE_GEMINI_API_KEY) {
    throw new Error('GOOGLE_GEMINI_API_KEY is not set. Configure Gemini API key in your .env file.');
  }

  const model = llmSettings.geminiModel || 'gemini-2.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GOOGLE_GEMINI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    }
  );

  const responseText = await response.text();
  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err = data?.error?.message || data?.error || responseText || `Gemini request failed with status ${response.status}`;
    throw new Error(err);
  }

  const markdown = data?.choices?.[0]?.message?.content || '';
  if (!markdown) {
    throw new Error('Gemini returned an empty light report.');
  }

  return markdown;
}

async function generateLightReportMarkdown(filename, reportContent) {
  const prompt = buildLightReportPrompt(filename, reportContent);
  if (llmSettings.useOllama) {
    return generateLightReportWithOllama(prompt);
  }

  if (llmSettings.useGemini) {
    return generateLightReportWithGemini(prompt);
  }

  if (ANTHROPIC_API_KEY) {
    return generateLightReportWithClaude(prompt);
  }

  try {
    console.warn('ANTHROPIC_API_KEY not set. Falling back to Ollama for light report generation.');
    return await generateLightReportWithOllama(prompt);
  } catch (ollamaError) {
    throw new Error(`ANTHROPIC_API_KEY is not set and Ollama fallback failed: ${ollamaError.message}`);
  }
}

app.use(cors());
app.use(express.json());

// Track active background executions (podcast jobs, agent runs)
const activeExecutions = new Map();

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

  // Check for password in header first
  let providedPassword = req.headers['x-app-password'];
  
  // Also check query parameter (for SSE which can't send headers)
  if (!providedPassword) {
    providedPassword = req.query.password;
  }

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

// Path to favorites.json
const FAVORITES_PATH = path.join(__dirname, '..', 'favorites.json');

function loadFavorites() {
  if (fs.existsSync(FAVORITES_PATH)) {
    try { return JSON.parse(fs.readFileSync(FAVORITES_PATH, 'utf-8')); } catch { return []; }
  }
  return [];
}

function saveFavorites(ids) {
  fs.writeFileSync(FAVORITES_PATH, JSON.stringify(ids, null, 2), 'utf-8');
}

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

/**
 * Extract LLM info from report content
 * Looks for pattern: **LLM**: Backend (model)
 */
function extractLLM(content) {
  const match = content.match(/\*\*LLM\*\*:\s*(.+)/);
  return match ? match[1].trim() : null;
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
        let llm = null;
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
          llm = extractLLM(content);
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
          executionTime,
          llm
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

// Create a light version of a report using AI and save it to reports folder
app.post('/api/reports/:filename/light', async (req, res) => {
  try {
    const filename = req.params.filename;

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!filename.toLowerCase().endsWith('.md')) {
      return res.status(400).json({ error: 'Only markdown reports can be lightened' });
    }

    const sourcePath = path.join(REPORTS_DIR, filename);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const sourceContent = fs.readFileSync(sourcePath, 'utf-8');
    const lightContentRaw = await generateLightReportMarkdown(filename, sourceContent);
    const lightContent = sanitizeLightReportForTTS(lightContentRaw);

    if (!lightContent) {
      throw new Error('Generated light report is empty after TTS cleanup');
    }

    const sourceBaseName = path.parse(filename).name;
    const targetBaseName = sourceBaseName.endsWith('-light') ? sourceBaseName : `${sourceBaseName}-light`;
    const targetFilename = `${targetBaseName}.md`;
    const targetPath = path.join(REPORTS_DIR, targetFilename);

    fs.writeFileSync(targetPath, lightContent.trim() + '\n', 'utf-8');

    console.log('Light report created:', targetPath);
    res.json({
      success: true,
      message: 'Light report created successfully',
      filename: targetFilename,
      path: targetPath
    });
  } catch (error) {
    console.error('Error creating light report:', error);
    res.status(500).json({ error: 'Failed to create light report', details: error.message });
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

    // Delete the report file
    fs.unlinkSync(filePath);
    console.log('File deleted successfully:', filePath);

    // Also delete the corresponding MP3 file if it exists (same folder as the report)
    const baseName = path.parse(filename).name;
    const normalizedExpectedMp3Name = `${baseName}.mp3`.normalize('NFC').toLowerCase();
    const mp3Candidates = fs.readdirSync(REPORTS_DIR)
      .filter((entry) => {
        if (path.extname(entry).toLowerCase() !== '.mp3') {
          return false;
        }
        return entry.normalize('NFC').toLowerCase() === normalizedExpectedMp3Name;
      })
      .map((entry) => path.join(REPORTS_DIR, entry));

    const deletedMp3Files = [];
    for (const mp3Path of mp3Candidates) {
      try {
        fs.unlinkSync(mp3Path);
        deletedMp3Files.push(mp3Path);
        console.log('MP3 file deleted successfully:', mp3Path);
      } catch (mp3Error) {
        console.warn('Warning: Could not delete MP3 file:', mp3Path, mp3Error.message);
      }
    }

    if (deletedMp3Files.length === 0) {
      const expectedMp3Path = path.join(REPORTS_DIR, `${baseName}.mp3`);
      console.log('No corresponding MP3 file found:', expectedMp3Path);
    }

    res.json({
      success: true,
      message: 'Report deleted successfully',
      deletedAudioFiles: deletedMp3Files.map(file => path.basename(file))
    });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report', details: error.message });
  }
});



// Create a podcast from a markdown report (starts conversion and returns executionId)
app.post('/api/reports/:filename/podcast', async (req, res) => {
  try {
    const filename = req.params.filename;

    // Security check: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(REPORTS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Load config to find md2podcast path (optional)
    const config = loadConfig();
    const md2podcastPath = process.env.MD2PODCAST_PATH || config?.md2podcastPath || null;

    if (!md2podcastPath) {
      return res.status(400).json({ error: 'md2podcast path not configured. Set MD2PODCAST_PATH or md2podcastPath in config.json' });
    }

    // Validate output path
    const baseName = filename.replace(/\.md$/i, '');
    const outFilename = `${baseName}.mp3`;
    const outPath = path.join(REPORTS_DIR, outFilename);

    // Build command args. If md2podcast is a .py file, use python3 to run it.
    const args = [];
    let cmd = md2podcastPath;
    if (md2podcastPath.endsWith('.py')) {
      cmd = 'python3';
      args.push(md2podcastPath);
    }

    // Default args: input file and output file (positional for md2podcast)
    args.push(filePath);
    args.push(outPath);

    // Determine engine/voice/rate: prefer request body, then env vars, then config, then sensible defaults
    const engine = req.body?.engine || process.env.MD2PODCAST_ENGINE || config?.md2podcastEngine || 'edge';
    if (engine) {
      args.push('--engine', engine);
    }

    const voice = req.body?.voice || process.env.MD2PODCAST_VOICE || config?.md2podcastVoice || '';
    if (voice) {
      args.push('--voice', voice);
    }

    // Normalize rate for different engines. `edge` expects a signed percentage string like +10% or -10%.
    const rawRate = req.body?.rate ?? process.env.MD2PODCAST_RATE ?? config?.md2podcastRate ?? null;
    if (rawRate !== null && rawRate !== undefined && rawRate !== '') {
      let rateArg = null;
      // If engine is 'edge', convert numeric rates (1.0 = +0%) to signed percentage strings
      if (String(engine).toLowerCase() === 'edge') {
        const maybeNumber = Number(rawRate);
        if (!Number.isNaN(maybeNumber)) {
          const percent = Math.round((maybeNumber - 1.0) * 100);
          const sign = percent >= 0 ? '+' : '';
          rateArg = `${sign}${percent}%`;
        } else if (/^[+-]?\d+%$/.test(String(rawRate))) {
          // Already a percentage string
          rateArg = String(rawRate).startsWith('+') || String(rawRate).startsWith('-') ? String(rawRate) : `+${String(rawRate)}`;
        }
      } else {
        // For other engines, pass the raw value as-is (string)
        rateArg = String(rawRate);
      }

      if (rateArg) {
        args.push('--rate', rateArg);
      }
    }

    // Spawn the process and track execution in activeExecutions
    const { spawn } = await import('child_process');
    const child = spawn(cmd, args, {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    if (!child.pid) {
      throw new Error('Failed to spawn md2podcast process');
    }

    const executionId = `podcast-${Date.now()}`;
    activeExecutions.set(executionId, {
      pid: child.pid,
      filename,
      outPath,
      logs: [],
      status: 'running',
      startTime: new Date()
    });

    // Record the full command string for debugging in the UI
    try {
      const quotedArgs = args.map(a => (String(a).includes(' ') ? `"${String(a)}"` : String(a))).join(' ');
      const cmdLine = `${cmd} ${quotedArgs}`.trim();
      const execution = activeExecutions.get(executionId);
      if (execution) {
        execution.command = cmdLine;
        execution.logs.push({ type: 'info', message: `Command: ${cmdLine}`, timestamp: new Date() });
      }
    } catch (err) {
      console.error('Error recording command for execution:', err);
    }

    child.stdout.on('data', (data) => {
      const log = data.toString();
      console.log(`[md2podcast stdout] ${log}`);
      const execution = activeExecutions.get(executionId);
      if (execution) execution.logs.push({ type: 'stdout', message: log, timestamp: new Date() });
    });

    child.stderr.on('data', (data) => {
      const log = data.toString();
      console.error(`[md2podcast stderr] ${log}`);
      const execution = activeExecutions.get(executionId);
      if (execution) execution.logs.push({ type: 'stderr', message: log, timestamp: new Date() });
    });

    child.on('exit', (code) => {
      const execution = activeExecutions.get(executionId);
      if (execution) {
        execution.status = code === 0 ? 'completed' : 'failed';
        execution.exitCode = code;
        execution.endTime = new Date();
      }
      console.log(`md2podcast process exited with code ${code}`);
    });

    child.on('error', (err) => {
      const execution = activeExecutions.get(executionId);
      if (execution) {
        execution.status = 'error';
        execution.error = err.message;
        execution.logs.push({ type: 'error', message: err.message, timestamp: new Date() });
      }
      console.error('md2podcast spawn error:', err);
    });

    res.json({ success: true, executionId, outFilename });
  } catch (error) {
    console.error('Error creating podcast:', error);
    res.status(500).json({ error: 'Failed to create podcast', details: error.message });
  }
});

// Download generated podcast file
app.get('/api/reports/:filename/podcast', (req, res) => {
  try {
    const filename = req.params.filename;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const baseName = filename.replace(/\.md$/i, '');
    const outFilename = `${baseName}.mp3`;
    const outPath = path.join(REPORTS_DIR, outFilename);

    if (!fs.existsSync(outPath)) {
      return res.status(404).json({ error: 'Podcast file not found' });
    }

    res.download(outPath, outFilename);
  } catch (error) {
    console.error('Error downloading podcast:', error);
    res.status(500).json({ error: 'Failed to download podcast', details: error.message });
  }
});

// Compare two reports using the current LLM
app.post('/api/reports/compare', async (req, res) => {
  const { report1, report2 } = req.body;
  if (!report1 || !report2) {
    return res.status(400).json({ error: 'report1 and report2 filenames are required' });
  }

  const path1 = path.join(REPORTS_DIR, path.basename(report1));
  const path2 = path.join(REPORTS_DIR, path.basename(report2));

  if (!fs.existsSync(path1)) return res.status(404).json({ error: `Report not found: ${report1}` });
  if (!fs.existsSync(path2)) return res.status(404).json({ error: `Report not found: ${report2}` });

  const content1 = fs.readFileSync(path1, 'utf8');
  const content2 = fs.readFileSync(path2, 'utf8');

  const prompt = {
    system: [
      'You are an expert analyst comparing two AI-generated reports to evaluate LLM output quality differences.',
      'Compare the two reports below and return a JSON object with exactly this structure:',
      '{',
      '  "summary": "2-3 sentence overall comparison",',
      '  "contentDifferences": [',
      '    { "aspect": "string", "report1": "string", "report2": "string", "verdict": "report1_better | report2_better | comparable" }',
      '  ],',
      '  "formattingDifferences": [',
      '    { "aspect": "string", "report1": "string", "report2": "string", "verdict": "report1_better | report2_better | comparable" }',
      '  ],',
      '  "overallVerdict": "report1_better | report2_better | comparable",',
      '  "overallReason": "string"',
      '}',
      '',
      'For contentDifferences, evaluate aspects like: accuracy, completeness, depth of analysis, actionability, key insights quality.',
      'For formattingDifferences, evaluate aspects like: structure, use of headings, use of lists/tables, readability, length appropriateness.',
      'Return ONLY the JSON object, no markdown code fences, no extra text.',
    ].join('\n'),
    user: [
      `=== REPORT 1: ${report1} ===`,
      content1,
      '',
      `=== REPORT 2: ${report2} ===`,
      content2
    ].join('\n'),
  };

  try {
    let text;
    if (llmSettings.useOllama) {
      text = await generateLightReportWithOllama(prompt);
    } else if (llmSettings.useGemini) {
      text = await generateLightReportWithGemini(prompt);
    } else {
      text = await generateLightReportWithClaude(prompt);
    }

    // Strip markdown fences if the LLM wrapped the JSON anyway
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let comparison;
    try {
      comparison = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'LLM returned invalid JSON', raw: text });
    }

    const activeModel = llmSettings.useOllama
      ? `Local Ollama (${llmSettings.ollamaModel})`
      : llmSettings.useGemini
        ? `Gemini (${llmSettings.geminiModel})`
        : `Claude (${llmSettings.claudeModel})`;

    res.json({ comparison, model: activeModel });
  } catch (err) {
    console.error('[compare] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Favorites API ---

app.get('/api/favorites', (req, res) => {
  res.json(loadFavorites());
});

app.post('/api/favorites/:reportId', (req, res) => {
  const { reportId } = req.params;
  const favorites = loadFavorites();
  if (!favorites.includes(reportId)) {
    favorites.push(reportId);
    saveFavorites(favorites);
  }
  res.json(favorites);
});

app.delete('/api/favorites/:reportId', (req, res) => {
  const { reportId } = req.params;
  const favorites = loadFavorites().filter(id => id !== reportId);
  saveFavorites(favorites);
  res.json(favorites);
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

// ─── Skills ────────────────────────────────────────────────────────────────

const SKILLS_DIR = process.env.VERCEL === '1'
  ? path.join(__dirname, 'skills')
  : path.join(__dirname, '..', 'skills');

/**
 * Minimal YAML parser for skill files.
 * Handles: scalar strings, block scalars (|), and simple sequences (- key: value).
 */
function parseSkillYaml(content) {
  const lines = content.split('\n');
  const result = {};
  let i = 0;

  function readBlockScalar(baseIndent) {
    const chunks = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '' || (line.match(/^(\s+)/) && line.match(/^(\s+)/)[1].length > baseIndent)) {
        chunks.push(line.trimEnd());
        i++;
      } else if (line.trim() === '') {
        chunks.push('');
        i++;
      } else {
        break;
      }
    }
    // Trim leading indent from each line
    const minIndent = chunks.filter(l => l.trim()).reduce((min, l) => {
      const m = l.match(/^(\s*)/);
      return Math.min(min, m ? m[1].length : min);
    }, Infinity);
    return chunks.map(l => l.slice(minIndent === Infinity ? 0 : minIndent)).join('\n').trim();
  }

  function readSequence(baseIndent) {
    const items = [];
    while (i < lines.length) {
      const line = lines[i];
      const indentMatch = line.match(/^(\s*)-\s+/);
      if (!indentMatch || indentMatch[1].length < baseIndent) break;
      // Collect all key:value pairs under this list item
      const item = {};
      // First line may be "- key: value"
      const firstKv = line.replace(/^\s*-\s+/, '').trim();
      const kvMatch = firstKv.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) item[kvMatch[1]] = kvMatch[2].replace(/^["']|["']$/g, '');
      i++;
      // Continuation lines (deeper indent, no dash)
      while (i < lines.length) {
        const next = lines[i];
        const nextIndent = next.match(/^(\s*)/)[1].length;
        if (next.trim() === '' || nextIndent <= indentMatch[1].length) break;
        // Sub-key: value pairs under list item
        const subKv = next.trim().match(/^(\w+):\s*(.*)$/);
        if (subKv) {
          let val = subKv[2].replace(/^["']|["']$/g, '');
          // Check for nested sequence (options)
          if (val === '') {
            i++;
            const subItems = [];
            while (i < lines.length) {
              const optLine = lines[i];
              const optIndent = optLine.match(/^(\s*)/)[1].length;
              if (!optLine.trim().startsWith('-') || optIndent <= nextIndent) break;
              const optItem = {};
              const optFirst = optLine.replace(/^\s*-\s+/, '').trim();
              const optKv = optFirst.match(/^(\w+):\s*(.*)$/);
              if (optKv) optItem[optKv[1]] = optKv[2].replace(/^["']|["']$/g, '');
              i++;
              while (i < lines.length) {
                const optNext = lines[i];
                const optNextIndent = optNext.match(/^(\s*)/)[1].length;
                if (optNext.trim() === '' || optNextIndent <= optIndent + 1) break;
                const optSubKv = optNext.trim().match(/^(\w+):\s*(.*)$/);
                if (optSubKv) optItem[optSubKv[1]] = optSubKv[2].replace(/^["']|["']$/g, '');
                i++;
              }
              subItems.push(optItem);
            }
            item[subKv[1]] = subItems;
            continue;
          }
          item[subKv[1]] = val;
        }
        i++;
      }
      items.push(item);
    }
    return items;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }

    const topKv = line.match(/^(\w+):\s*(.*)$/);
    if (!topKv) { i++; continue; }

    const key = topKv[1];
    const rawVal = topKv[2].trim();
    i++;

    if (rawVal === '|') {
      // Block scalar
      result[key] = readBlockScalar(0);
    } else if (rawVal === '') {
      // Could be a sequence
      const saved = i;
      const seq = readSequence(0);
      if (seq.length > 0) {
        result[key] = seq;
      } else {
        i = saved;
        result[key] = '';
      }
    } else {
      result[key] = rawVal.replace(/^["']|["']$/g, '');
    }
  }
  return result;
}

// List all available skills
app.get('/api/skills', (req, res) => {
  try {
    if (!fs.existsSync(SKILLS_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md'));
    const skills = files.map(file => {
      try {
        const raw = fs.readFileSync(path.join(SKILLS_DIR, file), 'utf-8');
        const content = raw.replace(/^---\n/, '').replace(/\n---\s*$/, '');
        const parsed = parseSkillYaml(content);
        return {
          id: file.replace(/\.md$/, ''),
          name: parsed.name || file.replace(/\.md$/, ''),
          description: parsed.description || '',
          category: parsed.category || 'General',
          parameters: parsed.parameters || [],
          hasPrompt: !!parsed.prompt,
        };
      } catch (err) {
        console.error(`[Skills] Failed to parse ${file}:`, err.message);
        return null;
      }
    }).filter(Boolean);

    res.json(skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
  } catch (error) {
    console.error('[Skills] Error listing skills:', error);
    res.status(500).json({ error: 'Failed to list skills', details: error.message });
  }
});

// Run a skill — build prompt from template + parameters and call the active LLM
app.post('/api/run-skill', async (req, res) => {
  const { skillId, parameters = {} } = req.body;

  if (!skillId) {
    return res.status(400).json({ error: 'skillId is required' });
  }

  // Find the skill file
  const skillPath = fs.existsSync(path.join(SKILLS_DIR, `${skillId}.md`))
    ? path.join(SKILLS_DIR, `${skillId}.md`)
    : null;

  if (!skillPath) {
    return res.status(404).json({ error: `Skill "${skillId}" not found` });
  }

  let skill;
  try {
    const raw = fs.readFileSync(skillPath, 'utf-8');
    const content = raw.replace(/^---\n/, '').replace(/\n---\s*$/, '');
    skill = parseSkillYaml(content);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to parse skill file', details: err.message });
  }

  if (!skill.prompt) {
    return res.status(400).json({ error: 'Skill has no prompt defined' });
  }

  // Validate required parameters
  const missing = (skill.parameters || [])
    .filter(p => p.required === true || p.required === 'true')
    .filter(p => !parameters[p.name] || parameters[p.name].toString().trim() === '')
    .map(p => p.label || p.name);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required parameters: ${missing.join(', ')}` });
  }

  // Inject parameters into prompt
  let prompt = skill.prompt;
  for (const [key, value] of Object.entries(parameters)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value);
  }

  const system = `You are Mari, an AI Chief of Staff assistant. Execute the following skill: ${skill.name}.`;

  try {
    console.log(`[Skills] Running skill "${skillId}" with LLM backend: ${llmSettings.useOllama ? 'Ollama' : llmSettings.useGemini ? 'Gemini' : 'Claude'}`);
    let result;
    if (llmSettings.useOllama) {
      result = await generateLightReportWithOllama({ system, user: prompt });
    } else if (llmSettings.useGemini) {
      result = await generateLightReportWithGemini({ system, user: prompt });
    } else {
      result = await generateLightReportWithClaude({ system, user: prompt });
    }
    res.json({ result, skillName: skill.name });
  } catch (err) {
    console.error(`[Skills] Execution error for "${skillId}":`, err.message);
    res.status(500).json({ error: 'Skill execution failed', details: err.message });
  }
});

// ─── End Skills ─────────────────────────────────────────────────────────────

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

    // Build command arguments (for direct node invocation, not npm)
    const args = [];

    // Split thoughtleadership-updates into two focused sub-agents to stay under token limits:
    //   thoughtleadership-rss  → RSS feeds, AI Critics, Reddit, NYTimes (API tools only)
    //   thoughtleadership-web  → Web sources, Industry News (web browsing only)
    const expandedAgents = agents.flatMap(a =>
      a === 'thoughtleadership-updates'
        ? ['thoughtleadership-rss', 'thoughtleadership-web']
        : [a]
    );

    // Add agent names
    expandedAgents.forEach(agent => args.push(agent));

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
    if (parameters?.slackWorkspace) {
      args.push('--workspace', parameters.slackWorkspace);
      console.log('[Server] Adding workspace parameter:', parameters.slackWorkspace);
    }
    if (parameters?.prompt) {
      args.push('--prompt', parameters.prompt);
      console.log('[Server] Adding prompt parameter:', parameters.prompt);
    }
    if (parameters?.mcps) {
      args.push('--mcps', parameters.mcps);
      console.log('[Server] Adding mcps parameter:', parameters.mcps);
    }

    const commandStr = `node src/index.js ${args.join(' ')}`;
    console.log('Executing command:', commandStr);
    console.log('[Server] Args array:', JSON.stringify(args));

    // Log active LLM backend at run time so it's always visible in the logs
    const runBackend = llmSettings.useOllama ? 'Ollama' : llmSettings.useGemini ? 'Gemini' : 'Claude';
    const runModel = llmSettings.useOllama ? llmSettings.ollamaModel : llmSettings.useGemini ? llmSettings.geminiModel : llmSettings.claudeModel;
    const runIcon = llmSettings.useOllama ? '🦙' : llmSettings.useGemini ? '💎' : '🔑';
    console.log(`${runIcon}  LLM backend for this run: ${runBackend} / ${runModel}`);

    // Execute the command with LLM settings as environment variables
    const { spawn } = await import('child_process');
    const env = {
      ...process.env,
      USE_OLLAMA: llmSettings.useOllama.toString(),
      USE_GEMINI: llmSettings.useGemini.toString(),
      OLLAMA_MODEL: llmSettings.ollamaModel,
      OLLAMA_BASE_URL: llmSettings.ollamaBaseUrl,
      OLLAMA_API_KEY: llmSettings.ollamaApiKey || '',
      CLAUDE_MODEL: llmSettings.claudeModel,
      GEMINI_MODEL: llmSettings.geminiModel,
      // Unbuffer output to ensure real-time logs
      PYTHONUNBUFFERED: '1',
      NODE_NO_READLINE: '1'
    };

    // Run node directly instead of through npm to avoid buffering issues
    const child = spawn('node', ['src/index.js', ...args], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env
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

    // Open a persistent log file for this execution
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const agentSlug = expandedAgents.join('+').replace(/[^a-zA-Z0-9+\-_]/g, '_');
    const logFilePath = path.join(logsDir, `agent-run-${executionId}-${agentSlug}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    logStream.write(`=== Agent Run ===\nAgents: ${expandedAgents.join(', ')}\nStarted: ${new Date().toISOString()}\nPID: ${child.pid}\nCommand: ${commandStr}\n\n`);

    // Capture stdout — echo to CLI, store for frontend, and persist to disk
    child.stdout.on('data', (data) => {
      const log = data.toString();
      process.stdout.write(log);
      logStream.write(log);
      const execution = activeExecutions.get(executionId);
      if (execution) {
        execution.logs.push({ type: 'stdout', message: log, timestamp: new Date() });
      }
    });

    // Capture stderr — echo to CLI, store for frontend, and persist to disk
    child.stderr.on('data', (data) => {
      const log = data.toString();
      process.stderr.write(log);
      logStream.write(`[stderr] ${log}`);
      const execution = activeExecutions.get(executionId);
      if (execution) {
        execution.logs.push({ type: 'stderr', message: log, timestamp: new Date() });
      }
    });

    // Handle process completion
    child.on('exit', (code) => {
      console.log(`Agent execution completed with code ${code}`);
      const execution = activeExecutions.get(executionId);
      const finalStatus = code === 0 ? 'completed' : 'failed';
      if (execution) {
        execution.status = finalStatus;
        execution.exitCode = code;
        execution.endTime = new Date();
      }
      logStream.write(`\n=== Finished: ${new Date().toISOString()} | exit code ${code} ===\n`);
      logStream.end();
      sendSmsNotification(agents, finalStatus);
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
      logStream.write(`\n=== Error: ${error.message} | ${new Date().toISOString()} ===\n`);
      logStream.end();
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

// Get LLM settings
app.get('/api/settings/llm', (req, res) => {
  try {
    res.json(llmSettings);
  } catch (error) {
    console.error('Error reading LLM settings:', error);
    res.status(500).json({ error: 'Failed to read settings', details: error.message });
  }
});

// Update LLM settings
app.put('/api/settings/llm', (req, res) => {
  try {
    const { useOllama, useGemini, ollamaModel, ollamaApiKey, claudeModel, geminiModel } = req.body;

    // Validate input
    if (useOllama !== undefined && typeof useOllama !== 'boolean') {
      return res.status(400).json({ error: 'Invalid useOllama value' });
    }
    if (useGemini !== undefined && typeof useGemini !== 'boolean') {
      return res.status(400).json({ error: 'Invalid useGemini value' });
    }

    // Update settings
    if (useOllama !== undefined) llmSettings.useOllama = useOllama;
    if (useGemini !== undefined) llmSettings.useGemini = useGemini;
    if (ollamaModel) llmSettings.ollamaModel = ollamaModel;
    if (ollamaApiKey !== undefined) llmSettings.ollamaApiKey = ollamaApiKey;
    if (claudeModel) llmSettings.claudeModel = claudeModel;
    if (geminiModel) llmSettings.geminiModel = geminiModel;

    savePersistedLLMSettings(llmSettings);

    const activeBackend = llmSettings.useOllama ? 'Ollama' : llmSettings.useGemini ? 'Gemini' : 'Claude';
    const activeModel = llmSettings.useOllama ? llmSettings.ollamaModel : llmSettings.useGemini ? llmSettings.geminiModel : llmSettings.claudeModel;
    const icon = llmSettings.useOllama ? '🦙' : llmSettings.useGemini ? '💎' : '🔑';
    const ts = new Date().toISOString();
    console.log('');
    console.log('═'.repeat(60));
    console.log(`${icon}  LLM BACKEND CHANGED  [${ts}]`);
    console.log(`   Backend : ${activeBackend}`);
    console.log(`   Model   : ${activeModel}`);
    if (llmSettings.useOllama) console.log(`   URL     : ${llmSettings.ollamaBaseUrl}`);
    if (llmSettings.useOllama && llmSettings.ollamaApiKey) console.log(`   API Key : ${llmSettings.ollamaApiKey.substring(0, 8)}...`);
    console.log('═'.repeat(60));
    console.log('');

    res.json({ success: true, settings: llmSettings });
  } catch (error) {
    console.error('Error updating LLM settings:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
});

// Get notifications settings
app.get('/api/settings/notifications', (req, res) => {
  res.json(notificationsSettings);
});

// Update notifications settings
app.put('/api/settings/notifications', (req, res) => {
  try {
    const { smsEnabled, phoneNumber } = req.body;
    if (smsEnabled !== undefined) notificationsSettings.smsEnabled = smsEnabled;
    if (phoneNumber !== undefined) notificationsSettings.phoneNumber = phoneNumber;
    saveNotificationsSettings(notificationsSettings);
    res.json({ success: true, settings: notificationsSettings });
  } catch (error) {
    console.error('Error updating notifications settings:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
});

// Server-Sent Events endpoint for real-time progress
app.get('/api/execution/:executionId/stream', (req, res) => {
  const { executionId } = req.params;
  const { password } = req.query;
  
  // Check password if APP_PASSWORD is set
  if (APP_PASSWORD && (!password || password !== APP_PASSWORD)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid password' });
  }
  
  const execution = activeExecutions.get(executionId);

  if (!execution) {
    return res.status(404).json({ error: 'Execution not found' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send existing logs immediately
  execution.logs.forEach(log => {
    const logData = `data: ${JSON.stringify(log)}\n\n`;
    res.write(logData);
  });
  res.flush?.();

  // Track if response is still open
  let isOpen = true;
  
  // Set up interval to check for new logs
  let lastLogIndex = execution.logs.length;

  const interval = setInterval(() => {
    if (!isOpen) {
      clearInterval(interval);
      return;
    }
    
    const currentExecution = activeExecutions.get(executionId);
    if (!currentExecution) {
      clearInterval(interval);
      try { res.end(); } catch (e) {}
      isOpen = false;
      return;
    }

    // Send new logs
    if (currentExecution.logs.length > lastLogIndex) {
      for (let i = lastLogIndex; i < currentExecution.logs.length; i++) {
        const log = currentExecution.logs[i];
        const logData = `data: ${JSON.stringify(log)}\n\n`;
        res.write(logData);
      }
      if (res.flush) res.flush();
      lastLogIndex = currentExecution.logs.length;
    }

    // Send status update when complete
    if (currentExecution.status !== 'running') {
      const statusData = `data: ${JSON.stringify({ type: 'status', status: currentExecution.status, exitCode: currentExecution.exitCode })}\n\n`;
      res.write(statusData);
      res.flush?.();
      clearInterval(interval);
      try { res.end(); } catch (e) {}
      isOpen = false;
    }
  }, 500);

  // Clean up on client disconnect
  req.on('close', () => {
    isOpen = false;
    clearInterval(interval);
  });

  req.on('error', () => {
    isOpen = false;
    clearInterval(interval);
  });
});

// Return list of configured MCP server names (filtered to those listed in config.json)
app.get('/api/mcp-servers', (req, res) => {
  try {
    // Load the Claude Desktop config to get all configured MCP servers
    const homeDir = os.homedir();
    const candidates = [
      process.env.MCP_CONFIG_PATH,
      path.join(homeDir, '.config', 'claude', 'claude_desktop_config.json'),
      path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json'),
      path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    ].filter(Boolean);

    let desktopServers = {};
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        desktopServers = JSON.parse(fs.readFileSync(candidate, 'utf8')).mcpServers || {};
        console.log(`[mcp-servers] Loaded ${Object.keys(desktopServers).length} servers from ${candidate}`);
        break;
      }
    }

    // Return all servers from the desktop config
    const servers = Object.entries(desktopServers).map(([name, cfg]) => ({
      name,
      command: cfg.command,
      args: cfg.args || []
    }));

    res.json({ servers });
  } catch (error) {
    console.error('Error loading MCP servers:', error);
    res.status(500).json({ error: 'Failed to load MCP servers', details: error.message });
  }
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
        authenticated: null,
        toolCount: 0,
        authError: null,
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

        // Additional auth health check for OneNote (transport can be connected while token is invalid)
        if (serverName.toLowerCase() === 'onenote' && tools.some(tool => tool.name === 'listNotebooks')) {
          try {
            await mcpClient.callTool('listNotebooks', {});
            status.authenticated = true;
          } catch (authError) {
            status.authenticated = false;
            status.authError = authError.message;
            const authErrorLower = String(authError.message || '').toLowerCase();
            const isAuthRequired = authErrorLower.includes('authenticationrequirederror') ||
                                  authErrorLower.includes('authentication required') ||
                                  authErrorLower.includes('interaction required') ||
                                  authErrorLower.includes('consent_required') ||
                                  authErrorLower.includes('login required') ||
                                  authErrorLower.includes('no account') ||
                                  authErrorLower.includes('gettoken');
            if (isAuthRequired) {
              status.authHint = 'OneNote authentication required. Run authenticate, complete https://microsoft.com/devicelogin, then run saveAccessToken.';
              status.authAction = 'authenticate_then_saveAccessToken';
            }
          }
        }

        console.log(`✓ ${serverName}: Connected (${tools.length} tools)`);
      } catch (error) {
        status.error = error.message;
        if (serverName.toLowerCase() === 'onenote') {
          const errorLower = String(error.message || '').toLowerCase();
          const isAuthRequired = errorLower.includes('authenticationrequirederror') ||
                                 errorLower.includes('authentication required') ||
                                 errorLower.includes('interaction required') ||
                                 errorLower.includes('consent_required') ||
                                 errorLower.includes('login required') ||
                                 errorLower.includes('no account') ||
                                 errorLower.includes('gettoken');
          if (isAuthRequired) {
            status.authenticated = false;
            status.authError = error.message;
            status.authHint = 'OneNote authentication required. Run authenticate, complete https://microsoft.com/devicelogin, then run saveAccessToken.';
            status.authAction = 'authenticate_then_saveAccessToken';
          }
        }
        console.log(`✗ ${serverName}: ${error.message}`);
      }

      serverStatuses.push(status);
    }

    // Clean up connections
    await mcpClient.close();

    const connectedCount = serverStatuses.filter(s => s.connected).length;
    const totalCount = serverStatuses.length;
    const unauthenticatedCount = serverStatuses.filter(s => s.authenticated === false).length;

    res.json({
      totalServers: totalCount,
      connectedServers: connectedCount,
      failedServers: totalCount - connectedCount,
      unauthenticatedServers: unauthenticatedCount,
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

// ─── MCP Config Editor ────────────────────────────────────────────────────────

const MCP_CONFIG_PATH = path.join(os.homedir(), '.config', 'claude', 'claude_desktop_config.json');

// Get the claude_desktop_config.json contents
app.get('/api/mcp-config', (req, res) => {
  try {
    if (!fs.existsSync(MCP_CONFIG_PATH)) {
      return res.status(404).json({ error: 'Config file not found', path: MCP_CONFIG_PATH });
    }
    const raw = fs.readFileSync(MCP_CONFIG_PATH, 'utf8');
    res.json({ content: raw, path: MCP_CONFIG_PATH });
  } catch (error) {
    console.error('Error reading MCP config:', error);
    res.status(500).json({ error: 'Failed to read config file', details: error.message });
  }
});

// Save the claude_desktop_config.json contents
app.put('/api/mcp-config', (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' });
    }
    // Validate JSON before saving
    JSON.parse(content);
    // Write a backup first
    const backupPath = MCP_CONFIG_PATH + '.bak';
    if (fs.existsSync(MCP_CONFIG_PATH)) {
      fs.copyFileSync(MCP_CONFIG_PATH, backupPath);
    }
    fs.writeFileSync(MCP_CONFIG_PATH, content, 'utf8');
    res.json({ success: true, message: 'Config saved successfully', path: MCP_CONFIG_PATH });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'Invalid JSON', details: error.message });
    }
    console.error('Error saving MCP config:', error);
    res.status(500).json({ error: 'Failed to save config file', details: error.message });
  }
});

// ─── Manual Sources Upload ────────────────────────────────────────────────────

const MANUAL_SOURCES_DIR = path.join(__dirname, '..', 'manual_sources');

// Week folder validation: only "week" followed by 1–3 digits (case-insensitive)
function isValidWeekFolder(name) {
  return /^week\d{1,3}$/i.test(name);
}

// Allowed upload extensions
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.md']);

// Multer storage — destination and filename resolved at request time
const uploadStorage = multer.diskStorage({
  destination(req, file, cb) {
    const week = (req.params.week || '').trim().toLowerCase();
    if (!isValidWeekFolder(week)) {
      return cb(new Error('Invalid week folder name'));
    }
    const dest = path.join(MANUAL_SOURCES_DIR, week);
    // Ensure it stays inside manual_sources
    const resolved = path.resolve(dest);
    const base = path.resolve(MANUAL_SOURCES_DIR);
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      return cb(new Error('Path traversal detected'));
    }
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename(req, file, cb) {
    // Strip any path components, keep only the base filename
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.\-_ ()[\]]/g, '_');
    const ext = path.extname(safeName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error(`File type not allowed: ${ext}`));
    }
    cb(null, safeName);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per file
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error(`File type not allowed: ${ext}`));
    }
    cb(null, true);
  }
});

// POST /api/upload/:week — upload one or more files into manual_sources/<week>/
app.post('/api/upload/:week', (req, res) => {
  const week = (req.params.week || '').trim().toLowerCase();
  if (!isValidWeekFolder(week)) {
    return res.status(400).json({ error: 'Invalid week folder. Use format: week1, week9, week10, etc.' });
  }

  upload.array('files', 20)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 25 MB.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files received.' });
    }
    const uploaded = req.files.map(f => ({ name: f.filename, size: f.size }));
    res.json({ success: true, week, files: uploaded });
  });
});

// GET /api/upload/:week — list files in manual_sources/<week>/
app.get('/api/upload/:week', (req, res) => {
  const week = (req.params.week || '').trim().toLowerCase();
  if (!isValidWeekFolder(week)) {
    return res.status(400).json({ error: 'Invalid week folder name.' });
  }
  const dir = path.join(MANUAL_SOURCES_DIR, week);
  if (!fs.existsSync(dir)) {
    return res.json({ week, files: [] });
  }
  const files = fs.readdirSync(dir)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ALLOWED_EXTENSIONS.has(ext);
    })
    .map(f => {
      const stat = fs.statSync(path.join(dir, f));
      return { name: f, size: stat.size, modified: stat.mtime };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ week, files });
});

// DELETE /api/upload/:week/:filename — remove a single file
app.delete('/api/upload/:week/:filename', (req, res) => {
  const week = (req.params.week || '').trim().toLowerCase();
  const filename = path.basename(req.params.filename || '');
  if (!isValidWeekFolder(week)) {
    return res.status(400).json({ error: 'Invalid week folder name.' });
  }
  if (!filename) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return res.status(400).json({ error: 'File type not allowed.' });
  }
  const filePath = path.join(MANUAL_SOURCES_DIR, week, filename);
  // Prevent traversal: resolved path must stay inside manual_sources/<week>
  const resolved = path.resolve(filePath);
  const base = path.resolve(path.join(MANUAL_SOURCES_DIR, week));
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return res.status(400).json({ error: 'Path traversal detected.' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }
  fs.unlinkSync(filePath);
  res.json({ success: true, deleted: filename });
});

// GET /api/upload-weeks — list all existing week folders in manual_sources
app.get('/api/upload-weeks', (req, res) => {
  if (!fs.existsSync(MANUAL_SOURCES_DIR)) {
    return res.json({ weeks: [] });
  }
  const weeks = fs.readdirSync(MANUAL_SOURCES_DIR)
    .filter(entry => {
      if (!isValidWeekFolder(entry)) return false;
      return fs.statSync(path.join(MANUAL_SOURCES_DIR, entry)).isDirectory();
    })
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10);
      const nb = parseInt(b.replace(/\D/g, ''), 10);
      return nb - na; // newest first
    });
  res.json({ weeks });
});

// ─── End Manual Sources Upload ────────────────────────────────────────────────

// ─── LLM Evaluator ────────────────────────────────────────────────────────────

// Return MCP servers from claude_desktop_config.json
app.get('/api/llm-eval/mcp-servers', async (req, res) => {
  try {
    const { MCPClientManager } = await import('../src/mcp-client.js');
    const mcpClient = new MCPClientManager();
    const mcpServers = mcpClient.loadMCPConfig();
    res.json(mcpServers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run a prompt against a specific LLM and return the response + latency
app.post('/api/llm-eval/run', async (req, res) => {
  const { backend, model, prompt, systemPrompt } = req.body;
  if (!backend || !model || !prompt) {
    return res.status(400).json({ error: 'backend, model, and prompt are required' });
  }

  const start = Date.now();

  try {
    let response = '';

    if (backend === 'claude') {
      const apiKey = ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

      const body = {
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      };
      if (systemPrompt) body.system = systemPrompt;

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey
        },
        body: JSON.stringify(body)
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || `Claude API error ${r.status}`);
      response = extractAnthropicText(data);

    } else if (backend === 'gemini') {
      const apiKey = GOOGLE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('GOOGLE_GEMINI_API_KEY is not configured');

      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, messages, max_tokens: 2048 })
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || `Gemini API error ${r.status}`);
      response = data?.choices?.[0]?.message?.content || '';
      if (!response) {
        const fr = data?.choices?.[0]?.finish_reason;
        throw new Error(`Gemini returned no content (finish_reason: ${fr ?? 'null'}). The model may have blocked the request — try a different model or simplify the prompt.`);
      }

    } else if (backend === 'ollama') {
      const endpoint = buildOllamaChatUrl(llmSettings.ollamaBaseUrl);
      const headers = { 'Content-Type': 'application/json' };
      if (llmSettings.ollamaApiKey) headers['Authorization'] = `Bearer ${llmSettings.ollamaApiKey}`;

      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const r = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages, max_tokens: 2048 })
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || data?.error || `Ollama error ${r.status}`);
      response = extractOllamaText(data);

    } else {
      throw new Error(`Unknown backend: ${backend}`);
    }

    res.json({ response, latencyMs: Date.now() - start, model, backend });
  } catch (err) {
    res.json({ error: err.message, latencyMs: Date.now() - start, model, backend });
  }
});

const EVAL_NOTES_FILE = path.join(__dirname, '..', 'llm-eval-notes.json');
const REPORT_NOTES_FILE = path.join(__dirname, '..', 'report-notes.json');

function loadReportNotes() {
  try {
    return fs.existsSync(REPORT_NOTES_FILE) ? JSON.parse(fs.readFileSync(REPORT_NOTES_FILE, 'utf8')) : {};
  } catch { return {}; }
}

// Returns set of filenames that have non-empty notes
app.get('/api/reports-notes-index', (req, res) => {
  const all = loadReportNotes();
  const withNotes = Object.keys(all).filter(k => all[k] && all[k].trim().length > 0);
  res.json({ filenames: withNotes });
});

app.get('/api/reports/:filename/notes', (req, res) => {
  const all = loadReportNotes();
  res.json({ notes: all[req.params.filename] || '' });
});

app.post('/api/reports/:filename/notes', (req, res) => {
  try {
    const all = loadReportNotes();
    all[req.params.filename] = req.body.notes ?? '';
    fs.writeFileSync(REPORT_NOTES_FILE, JSON.stringify(all, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/llm-eval/notes', (req, res) => {
  try {
    const data = fs.existsSync(EVAL_NOTES_FILE) ? JSON.parse(fs.readFileSync(EVAL_NOTES_FILE, 'utf8')) : { notes: '' };
    res.json(data);
  } catch {
    res.json({ notes: '' });
  }
});

app.post('/api/llm-eval/notes', (req, res) => {
  try {
    const { notes } = req.body;
    fs.writeFileSync(EVAL_NOTES_FILE, JSON.stringify({ notes: notes ?? '' }, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── End LLM Evaluator ────────────────────────────────────────────────────────

// Handle client-side routing - serve index.html for .md URLs
app.get('/*.md', (req, res) => {
  if (fs.existsSync(DIST_DIR)) {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  } else {
    res.status(404).send('Frontend not built. Run: cd frontend && npm run build');
  }
});

// SPA catch-all: serve index.html for any non-API route (enables client-side routing)
app.get('*', (req, res) => {
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
    console.log(`Access from network at http://10.88.111.48:${PORT}`);
  });
}

