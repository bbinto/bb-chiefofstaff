import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RateLimiter } from './agent/rate-limiter.js';
import { MessageTruncator } from './agent/message-truncator.js';
import { ToolHandler } from './agent/tool-handler.js';
import { calculateDateRange, formatDateRangeDisplay, parseCalendarWeek, getCalendarWeekDateRange, getISOWeekNumber } from './utils/date-utils.js';
import {
  API_DEFAULTS,
  PATHS,
  TOKEN_LIMITS,
  MESSAGE_TRUNCATION,
  RATE_LIMITING,
  RETRY_CONFIG,
  HTTP_STATUS,
  ERROR_TYPES
} from './utils/constants.js';
import { sleep } from './utils/helpers.js';

const __agentRunnerFilename = fileURLToPath(import.meta.url);
const __agentRunnerDirname = path.dirname(__agentRunnerFilename);

function loadPersistedLLMSettings() {
  const settingsPath = path.join(__agentRunnerDirname, '..', 'llm-settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Agent Runner
 * Executes individual agents based on their markdown instructions
 */
export class AgentRunner {
  constructor(mcpClient, config, dateRange = null, agentParams = {}) {
    console.log('[AgentRunner] Constructor called with dateRange:', dateRange, 'agentParams:', agentParams);
    this.mcpClient = mcpClient;
    this.config = config;
    this.dateRange = dateRange; // { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
    this.agentParams = agentParams; // { slackUserId: 'U...', folder: 'week1', etc. }
    
    // Detect which LLM backend to use.
    // If the caller (e.g. cron job) didn't explicitly set USE_GEMINI/USE_OLLAMA,
    // fall back to persisted settings saved via the frontend UI.
    const envHasLLMConfig = process.env.USE_GEMINI !== undefined || process.env.USE_OLLAMA !== undefined;
    const persisted = envHasLLMConfig ? null : loadPersistedLLMSettings();

    this.useOllama = process.env.USE_OLLAMA === 'true' || (persisted?.useOllama ?? false);
    this.useGemini = process.env.USE_GEMINI === 'true' || (persisted?.useGemini ?? false);

    if (this.useOllama) {
      console.log('🦙 Using local Ollama LLM');
      const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || persisted?.ollamaBaseUrl || 'http://localhost:11434';
      this.anthropic = new OpenAI({
        apiKey: process.env.OLLAMA_API_KEY || persisted?.ollamaApiKey || 'dummy-key',
        baseURL: `${ollamaBaseUrl}/v1`
      });
      this.model = process.env.OLLAMA_MODEL || persisted?.ollamaModel || 'mistral';
      console.log(`  Model: ${this.model}`);
      console.log(`  Base URL: ${ollamaBaseUrl}/v1`);
    } else if (this.useGemini) {
      console.log('💎 Using Google Gemini API (direct fetch)');
      this.geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
      this.model = process.env.GEMINI_MODEL || persisted?.geminiModel || 'gemini-2.5-flash';
      console.log(`  Model: ${this.model}`);
    } else {
      console.log('🔑 Using Anthropic Claude API');
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      this.model = process.env.CLAUDE_MODEL || persisted?.claudeModel || API_DEFAULTS.MODEL;
      console.log(`  Model: ${this.model}`);
    }

    // Initialize helper classes
    this.rateLimiter = new RateLimiter();
    this.messageTruncator = new MessageTruncator();
    this.toolHandler = new ToolHandler(agentParams);
  }

  /**
   * Load agent instructions from markdown file
   */
  loadAgentInstructions(agentName) {
    const agentPath = path.join(process.cwd(), PATHS.AGENTS_DIR, `${agentName}.md`);
    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent file not found: ${agentPath}`);
    }
    return fs.readFileSync(agentPath, 'utf8');
  }

  /**
   * Parse the ## MCPs section from an agent markdown file.
   * Returns:
   *   - string[]       if MCPs are listed (e.g. ["Slack", "Jira"])
   *   - []             if section exists but says "none"
   *   - 'user-selected' if section says "user-selected" (research-ask style)
   *   - null           if no ## MCPs section found (legacy fallback)
   */
  loadAgentMCPs(agentName) {
    const agentPath = path.join(process.cwd(), PATHS.AGENTS_DIR, `${agentName}.md`);
    if (!fs.existsSync(agentPath)) return null;

    const content = fs.readFileSync(agentPath, 'utf8');
    const lines = content.split('\n');

    // Find the "## MCPs" heading (allow optional leading whitespace)
    const mcpIdx = lines.findIndex(l => /^[ \t]*## MCPs[ \t]*$/.test(l));
    if (mcpIdx === -1) return null;

    // Collect body lines until the next heading
    const bodyLines = [];
    for (let i = mcpIdx + 1; i < lines.length; i++) {
      if (/^[ \t]*#{1,6} /.test(lines[i])) break;
      bodyLines.push(lines[i]);
    }

    const body = bodyLines.join('\n').trim();
    if (!body || body.toLowerCase() === 'none') return [];
    if (body.toLowerCase().startsWith('user-selected')) return 'user-selected';

    return bodyLines
      .map(line => line.replace(/^[ \t]*[-*]\s*/, '').trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
  }


  /**
   * Convert Anthropic format to OpenAI format for Ollama.
   * Ollama (OpenAI-compatible) supports the same format as Gemini.
   */
  convertParamsForOllama(params) {
    const converted = this.convertParamsForGemini(params);

    // Force tool use on the first turn so Ollama models don't skip straight to a text answer.
    // Once tool results exist in the conversation (role === 'tool'), switch to 'auto' so the
    // model can produce a final text response when it has gathered enough data.
    if (converted.tools && converted.tools.length > 0) {
      const hasToolResults = converted.messages.some(m => m.role === 'tool');
      converted.tool_choice = hasToolResults ? 'auto' : 'required';
    }

    return converted;
  }

  /**
   * Convert OpenAI response to Anthropic format for Ollama.
   * Handles both text responses and tool_calls (function calling).
   */
  convertResponseFromOllama(openaiResponse) {
    return this.convertResponseFromGemini(openaiResponse);
  }

  /**
   * Convert Anthropic format to OpenAI format for Gemini.
   * Handles:
   *   - params.system (Anthropic array) → { role: 'system' } message
   *   - assistant messages with tool_use blocks → tool_calls
   *   - user messages with tool_result blocks → { role: 'tool' } messages
   */
  convertParamsForGemini(params) {
    const messages = [];

    // 1. Convert Anthropic system param → OpenAI system message
    if (params.system) {
      const systemText = Array.isArray(params.system)
        ? params.system.map(b => b.text || '').join('\n')
        : (typeof params.system === 'string' ? params.system : '');
      if (systemText) {
        messages.push({ role: 'system', content: systemText });
      }
    }

    // 2. Convert each message from Anthropic format to OpenAI format
    for (const msg of (params.messages || [])) {
      if (msg.role === 'assistant') {
        if (Array.isArray(msg.content)) {
          const textBlocks  = msg.content.filter(b => b.type === 'text');
          const toolUseBlocks = msg.content.filter(b => b.type === 'tool_use');
          const converted = { role: 'assistant', content: null };
          if (textBlocks.length > 0) {
            converted.content = textBlocks.map(b => b.text).join('\n');
          }
          if (toolUseBlocks.length > 0) {
            converted.tool_calls = toolUseBlocks.map(b => ({
              id: b.id,
              type: 'function',
              function: { name: b.name, arguments: JSON.stringify(b.input) }
            }));
          }
          messages.push(converted);
        } else {
          messages.push({ role: 'assistant', content: msg.content });
        }
      } else if (msg.role === 'user') {
        if (Array.isArray(msg.content)) {
          const toolResults = msg.content.filter(b => b.type === 'tool_result');
          const textBlocks  = msg.content.filter(b => b.type === 'text');
          // tool_result → { role: 'tool' } (one message per result)
          for (const tr of toolResults) {
            let content;
            if (typeof tr.content === 'string') {
              content = tr.content;
            } else if (Array.isArray(tr.content)) {
              content = tr.content.map(b => b.text || JSON.stringify(b)).join('\n');
            } else {
              content = JSON.stringify(tr.content);
            }
            messages.push({ role: 'tool', tool_call_id: tr.tool_use_id, content });
          }
          // Plain text blocks stay as a user message
          if (textBlocks.length > 0) {
            messages.push({ role: 'user', content: textBlocks.map(b => b.text).join('\n') });
          }
        } else {
          messages.push({ role: 'user', content: msg.content });
        }
      } else {
        messages.push(msg);
      }
    }

    const converted = {
      model: this.model,
      messages,
      max_tokens: params.max_tokens || 8000,
      temperature: params.temperature,
    };

    // 3. Convert Anthropic tool schemas → OpenAI function schemas
    // Strip fields Gemini doesn't support (additionalProperties, $schema, etc.)
    if (params.tools && params.tools.length > 0) {
      converted.tools = params.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: this.stripGeminiUnsupportedSchemaFields(
            tool.input_schema || { type: 'object', properties: {}, required: [] }
          )
        }
      }));
    }

    return converted;
  }

  /**
   * Recursively strip JSON Schema fields that the Gemini API doesn't support.
   * Gemini rejects: additionalProperties, $schema, exclusiveMinimum/Maximum (as booleans), examples.
   */
  stripGeminiUnsupportedSchemaFields(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) return schema.map(s => this.stripGeminiUnsupportedSchemaFields(s));
    const unsupported = ['additionalProperties', '$schema', 'examples', 'default'];
    const result = {};
    for (const [key, value] of Object.entries(schema)) {
      if (unsupported.includes(key)) continue;
      if (typeof value === 'object' && value !== null) {
        result[key] = this.stripGeminiUnsupportedSchemaFields(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Convert OpenAI/Gemini response to Anthropic format.
   * Handles both text responses and tool_calls (function calling).
   */
  convertResponseFromGemini(openaiResponse) {
    const content = [];
    let stopReason = 'end_turn';

    // If Gemini returns no choices at all (empty array or missing), it rejected the prompt outright
    if (!openaiResponse.choices || openaiResponse.choices.length === 0) {
      const promptFeedback = openaiResponse.promptFeedback || openaiResponse.prompt_feedback;
      const blockReason = promptFeedback?.blockReason || promptFeedback?.block_reason || 'unknown';
      throw new Error(`Gemini returned no choices (prompt rejected before generation). Block reason: ${blockReason}. This often happens when the system prompt or tool list triggers Gemini's safety filters. Consider using Claude for tool-heavy agents.`);
    }

    if (openaiResponse.choices[0]) {
      const choice = openaiResponse.choices[0];
      const message = choice.message;
      const finishReason = choice.finish_reason;

      // Detect Gemini safety/recitation blocks — these return null content and a blocked finish_reason
      const blockedReasons = ['recitation', 'content_filter', 'safety'];
      if (blockedReasons.includes(finishReason)) {
        const readable = finishReason === 'recitation'
          ? 'RECITATION (Gemini refused to reproduce web/RSS article content — use Claude for agents that fetch external content)'
          : `${finishReason.toUpperCase()} (Gemini safety filter blocked the response)`;
        throw new Error(`Gemini blocked the response: ${readable}`);
      }

      // Plain text content
      if (message?.content) {
        content.push({ type: 'text', text: message.content });
      }

      // Tool calls → Anthropic tool_use blocks
      // Check message.tool_calls directly — many Ollama models return finish_reason 'stop'
      // even when tool calls are present, so we cannot rely on finish_reason alone.
      if (message?.tool_calls?.length > 0) {
        for (const tc of message.tool_calls) {
          let input = {};
          try { input = JSON.parse(tc.function.arguments); } catch { input = { _raw: tc.function.arguments }; }
          content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
        stopReason = 'tool_use';
      } else {
        stopReason = finishReason === 'stop' ? 'end_turn' : (finishReason || 'end_turn');
      }

      // If Gemini returned stop but no content and no tool calls, surface it rather than silently saving a blank report
      if (content.length === 0 && stopReason === 'end_turn') {
        throw new Error('Gemini returned an empty response with no content and no tool calls. The model may have hit its output limit or been blocked by a filter.');
      }
    }

    return {
      id: openaiResponse.id,
      type: 'message',
      role: 'assistant',
      content,
      model: openaiResponse.model,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: openaiResponse.usage?.prompt_tokens || 0,
        output_tokens: openaiResponse.usage?.completion_tokens || 0
      }
    };
  }

  /**
   * Call the Gemini OpenAI-compatible endpoint directly via fetch.
   * Avoids OpenAI SDK overhead/headers that can cause 404s on the Gemini API.
   */
  async callGeminiDirect(geminiParams) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.geminiApiKey}`
      },
      body: JSON.stringify(geminiParams)
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Gemini API returned non-JSON response (status ${response.status}): ${responseText.slice(0, 200)}`);
    }

    if (!response.ok) {
      const errMsg = data?.error?.message || data?.error || responseText.slice(0, 300);
      throw new Error(`Gemini API error (${response.status}): ${errMsg}`);
    }

    // Log response summary for debugging empty/blocked responses
    const choice0 = data?.choices?.[0];
    const finishReason = choice0?.finish_reason;
    const outputTokens = data?.usage?.completion_tokens ?? 0;
    if (outputTokens === 0 || !choice0?.message?.content) {
      console.warn(`⚠️  Gemini suspicious response: finish_reason=${JSON.stringify(finishReason)}, outputTokens=${outputTokens}, content=${JSON.stringify(choice0?.message?.content)?.slice(0, 100)}, choices.length=${data?.choices?.length ?? 0}`);
      if (data?.promptFeedback || data?.prompt_feedback) {
        console.warn(`⚠️  Gemini promptFeedback:`, JSON.stringify(data.promptFeedback || data.prompt_feedback));
      }
    }

    return data;
  }

  /**
   * Make API call with rate limiting and retry logic
   */
  async makeApiCall(params, retries = RETRY_CONFIG.MAX_RETRIES) {
    // Validate messages array is not empty
    if (!params.messages || params.messages.length === 0) {
      throw new Error('Invalid API call: messages array is empty or undefined. At least one message is required.');
    }

    // Estimate tokens before making the call
    const estimatedTokens = this.messageTruncator.estimateTokenCount(params.messages || [], params.tools || []);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await this.rateLimiter.waitForRateLimit(estimatedTokens);

        let response;
        if (this.useOllama) {
          const ollamaParams = this.convertParamsForOllama(params);
          const ollamaResponse = await this.anthropic.chat.completions.create(ollamaParams);
          response = this.convertResponseFromOllama(ollamaResponse);
        } else if (this.useGemini) {
          const geminiParams = this.convertParamsForGemini(params);
          const geminiResponse = await this.callGeminiDirect(geminiParams);
          response = this.convertResponseFromGemini(geminiResponse);
        } else {
          response = await this.anthropic.messages.create(params);
        }

        // Track token usage (input + output — Anthropic rate limits count both)
        if (response.usage) {
          const inputTokens = response.usage.input_tokens || 0;
          const outputTokens = response.usage.output_tokens || 0;
          this.rateLimiter.trackTokenUsage(inputTokens + outputTokens);
          this.rateLimiter.resetConsecutiveErrors();
        }

        return response;
      } catch (error) {
        // Check if it's a rate limit error (handle various error formats)
        const errorMessage = (error.message || error.error?.message || JSON.stringify(error) || '').toLowerCase();
        const errorType = error.error?.type || error.type;
        const isRateLimitError = error.status === HTTP_STATUS.RATE_LIMIT ||
                                 error.statusCode === HTTP_STATUS.RATE_LIMIT ||
                                 errorType === ERROR_TYPES.RATE_LIMIT_ERROR ||
                                 errorMessage.includes('rate_limit') ||
                                 errorMessage.includes('rate limit') ||
                                 errorMessage.includes('would exceed the rate limit');

        // Check if it's a "prompt too long" error
        // NOTE: do NOT match on errorType === INVALID_REQUEST_ERROR alone — that is too broad
        // and would incorrectly catch unrelated 400 errors (e.g. "messages: at least one message
        // is required"), triggering the truncation retry and the reference-clearing bug.
        const isPromptTooLong = error.status === HTTP_STATUS.BAD_REQUEST &&
                                (errorMessage.includes('prompt is too long') ||
                                 errorMessage.includes('too long') ||
                                 errorMessage.includes('maximum') ||
                                 errorMessage.includes('token'));

        if (isPromptTooLong) {
          console.error(`❌ Prompt too long error: ${error.error?.message || errorMessage}`);
          console.error('This indicates the conversation history has exceeded the token limit.');
          console.error('The system will attempt to truncate messages and retry...');

          if (attempt < retries - 1) {
            // Truncate messages more aggressively
            if (params.messages && params.messages.length > 0) {
              const truncated = this.messageTruncator.truncateMessages(
                params.messages,
                MESSAGE_TRUNCATION.AGGRESSIVE_TRUNCATION_LIMIT,
                params.tools
              );

              // Validate truncated messages is not empty
              if (truncated && truncated.length > 0) {
                // Replace the messages array contents (preserve reference for caller)
                params.messages.length = 0;
                params.messages.push(...truncated);
                console.log(`Retrying with truncated messages (${params.messages.length} messages)...`);
                continue;
              } else {
                console.error('❌ Truncation resulted in empty messages array. Cannot retry.');
              }
            }
          }

          // If we can't truncate or out of retries, throw with helpful message
          const currentTokens = this.messageTruncator.estimateTokenCount(params.messages || [], params.tools || []);
          throw new Error(`Prompt too long (exceeds ${TOKEN_LIMITS.MAX_TOTAL_TOKENS / 1000}k token limit). Current estimate: ${Math.round(currentTokens / 1000)}k tokens. The system attempted aggressive truncation but the conversation history is still too large. Try running the agent with fewer data sources, reduce the date range, or split the work into smaller tasks.`);
        }

        if (isRateLimitError) {
          await this.rateLimiter.handleRateLimitError(attempt, retries);
          if (attempt < retries - 1) {
            continue;
          }
        }

        // If not a rate limit error or out of retries, throw
        throw error;
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  /**
   * Build the parameter injection message for a given agent.
   * Returns an empty string if the agent needs no parameters.
   */
  buildParameterMessage(agentName) {
    const p = this.agentParams;

    const builders = {
      'slack-user-analysis': () => p.slackUserId
        ? `\n\n**IMPORTANT: Slack User ID Parameter**\nThe Slack user ID to analyze is: ${p.slackUserId}\nPlease use this user ID to search for their messages and analyze their contributions.`
        : `\n\n**IMPORTANT: Slack User ID Parameter Required**\nNo Slack user ID was provided. Please ask the user for the Slack user ID before proceeding with the analysis. The Slack user ID format is typically "U" followed by alphanumeric characters (e.g., "U01234567AB").`,

      'research-ask': () => {
        if (!p.prompt) return '\n\n**IMPORTANT: Query Required**\nNo query was provided. Please specify a research query using the --prompt parameter.';
        const mcpList = p.mcps ? `\n\nSelected MCP sources: ${p.mcps.split(',').map(s => s.trim()).join(', ')}\nUse ONLY these MCP servers for this research task.` : '';
        return `\n\n**IMPORTANT: Research Query**\nThe user's query is:\n\n> ${p.prompt}\n\nFocus all your research and output on answering this query.${mcpList}`;
      },

      'business-health': () => p.manualSourcesFolder
        ? `\n\n**IMPORTANT: Manual Sources Folder Parameter**\nThe folder to use for manual sources is: "${p.manualSourcesFolder}"\nPlease use files from the "${p.manualSourcesFolder}" subfolder within manual_sources. When using the read_file_from_manual_sources tool, specify filenames relative to this folder (e.g., if folder is "Week 1" and file is "ARR OV.xlsx", use filename "ARR OV.xlsx" or "Week 1/ARR OV.xlsx").`
        : '',

      'telemetry-deepdive': () => {
        console.log('[AgentRunner] Processing telemetry-deepdive agent. this.agentParams:', p);
        console.log('[AgentRunner] this.agentParams.folder value:', p.folder);
        if (p.folder) {
          console.log('[AgentRunner] ✅ Folder parameter found! Setting parameter message for folder:', p.folder);
          const msg = `\n\n**IMPORTANT: Folder Parameter**\nThe folder parameter has been set to: "${p.folder}"\nYou MUST only analyze files from the "${p.folder}" subfolder within manual_sources. Do NOT explore other subfolders or use list_manual_sources_files to browse. Only read files from "${p.folder}/" when using the read_file_from_manual_sources tool.`;
          console.log('[AgentRunner] Parameter message created:', msg);
          return msg;
        }
        console.log('[AgentRunner] ❌ No folder parameter found in this.agentParams');
        return '';
      },

      'weekly-recap': () => {
        const businessFolder = p.manualSourcesFolder || p.folder;
        return businessFolder
          ? `\n\n**IMPORTANT: Business Metrics Folder**\nUse the "${businessFolder}" subfolder within manual_sources for the Business Metrics section. Use list_manual_sources_files to discover files, then read_file_from_manual_sources to read closed lost deals, won deals, or other business data.${p.manualSourcesFolder ? ` (The manual_sources tools are scoped to "${businessFolder}".)` : ''}`
          : '';
      },

      '1-1': () => p.email
        ? `\n\n**IMPORTANT: Email Parameter**\nThe email address for the 1-1 person is: ${p.email}\nPlease use this email to find the person in config.team["1-1s"] and gather their information (name, role, relationship type, Slack ID, Slack DM channel ID) to prepare for the 1-1 meeting.`
        : `\n\n**IMPORTANT: Email Parameter Required**\nNo email address was provided. Please ask the user for the email address of the 1-1 person before proceeding. The email must match someone in config.team["1-1s"].`,

      'epp': () => p.email
        ? `\n\n**IMPORTANT: Email Parameter**\nThe email address for the Employee Personality Profile is: ${p.email}\nPlease use this email to:\n1. Find the person's information from config.team.ovTeamMembers, config.team.OVEntireTeam, or config.team["1-1s"]\n2. Get their Slack ID (slackId) from the config\n3. If not found in config, use Slack MCP tools to search for the user by email\n4. Analyze all their Slack messages, contributions, comments, actions, and responses in the specified date range\n5. Generate a comprehensive personality profile using Myers-Briggs and Insights Discovery frameworks.`
        : `\n\n**IMPORTANT: Email Parameter Required**\nNo email address was provided. Please ask the user for the email address of the person to analyze before proceeding. The email can match someone in the team configuration (config.team.ovTeamMembers, config.team.OVEntireTeam, or config.team["1-1s"]), or you can search for them using Slack MCP tools.`,

      'weekly-executive-summary': () => {
        console.log('[AgentRunner] Processing weekly-executive-summary agent. this.agentParams:', p);
        console.log('[AgentRunner] this.agentParams.week value:', p.week);
        if (p.week) {
          console.log('[AgentRunner] ✅ Week parameter found! Setting parameter message for week:', p.week);
          const weekInfo = parseCalendarWeek(p.week);
          if (weekInfo) {
            const dateRange = getCalendarWeekDateRange(weekInfo.week, weekInfo.year);
            const msg = `\n\n**IMPORTANT: Calendar Week Parameter**\nThe calendar week parameter has been set to: "${p.week}" (Week ${weekInfo.week}, ${weekInfo.year})\nThe date range for this week is: ${dateRange.startDate} (Monday) to ${dateRange.endDate} (Sunday).\nYou MUST find all report files created during this week (where the date portion YYYY-MM-DD in the filename falls within ${dateRange.startDate} to ${dateRange.endDate}). Use the list_reports_in_week tool to find reports for this week, then use read_report_file to extract "One-Line Executive Summary" and "tl;dr" sections from each report.`;
            console.log('[AgentRunner] Parameter message created with date range:', dateRange);
            return msg;
          }
          console.log('[AgentRunner] ❌ Invalid week parameter format');
          return `\n\n**IMPORTANT: Invalid Week Parameter**\nThe week parameter "${p.week}" is invalid. Expected format: "week 1" or "week 1 2025". Please inform the user to provide a valid week parameter.`;
        }
        console.log('[AgentRunner] ❌ No week parameter found in this.agentParams');
        return `\n\n**IMPORTANT: Week Parameter Required**\nNo calendar week was provided. Please ask the user for the calendar week (e.g., "week 1" or "week 1 2025") before proceeding. The week format should be "week N" or "week N YYYY" where N is the week number (1-53) and YYYY is the year (if not provided, current year is assumed).`;
      },

      'tts': () => {
        console.log('[AgentRunner] Processing tts agent. this.agentParams:', p);
        console.log('[AgentRunner] this.agentParams.reportFile value:', p.reportFile);
        if (p.reportFile) {
          console.log('[AgentRunner] ✅ Report file parameter found! Setting parameter message for report file:', p.reportFile);
          const msg = `\n\n**IMPORTANT: Report File Parameter**\nThe report file parameter has been set to: "${p.reportFile}"\nYou MUST read this specific report file and convert it to speech. The file path is: ${p.reportFile}\nUse the Read tool to read the report file, then summarize it for narration, and use the Hume AI TTS tool (mcp__hume__tts) to convert it to speech.`;
          console.log('[AgentRunner] Parameter message created for report file');
          return msg;
        }
        console.log('[AgentRunner] ❌ No report file parameter found in this.agentParams');
        return `\n\n**IMPORTANT: Report File Parameter Required**\nNo report file path was provided. Please ask the user for the report file path before proceeding. The file path should be a markdown file (e.g., "reports/business-health-2025-01-12-10-30-00.md").`;
      },

      'mixpanel-query': () => {
        console.log('[AgentRunner] Processing mixpanel-query agent. this.agentParams:', p);
        console.log('[AgentRunner] this.agentParams.insightIds value (raw):', p.insightIds);
        console.log('[AgentRunner] this.agentParams.insightIds type:', typeof p.insightIds);
        if (p.insightIds) {
          console.log('[AgentRunner] ✅ Insight IDs parameter found! Overriding default config values:', p.insightIds);
          const insightIdsArray = String(p.insightIds).split(',').map(id => id.trim()).filter(id => id.length > 0);
          console.log('[AgentRunner] Parsed insightIds array:', insightIdsArray);
          console.log('[AgentRunner] Number of insight IDs:', insightIdsArray.length);
          const msg = `\n\n**IMPORTANT: Insight IDs Parameter**\nThe insight IDs parameter has been set to: "${p.insightIds}"\nYou MUST query ONLY these specific insight reports (bookmark IDs): ${insightIdsArray.join(', ')}\nDO NOT use the default config values - use only the insight IDs provided in this parameter.\nFor each insight report, include a link to the Mixpanel chart: https://mixpanel.com/project/{projectId}/view/{workspaceId}/app/insights/?discover=1#report/{bookmarkId}`;
          console.log('[AgentRunner] Parameter message created for insight IDs');
          return msg;
        }
        console.log('[AgentRunner] No insight IDs parameter found - will use default config values from config["mixpanel-insights"]');
        return '';
      },

      'performance-review-q3': () => {
        console.log('[AgentRunner] Processing performance-review-q3 agent. this.agentParams:', p);
        console.log('[AgentRunner] this.agentParams.email value:', p.email);
        if (p.email) {
          console.log('[AgentRunner] ✅ Email parameter found! Setting parameter message for email:', p.email);
          const msg = `\n\n**IMPORTANT: Email Parameter**\nThe email address for the performance review is: ${p.email}\nPlease use this email to:\n1. Find the person's Slack ID from config.team.ovTeamMembers or config.team.OVEntireTeam\n2. Locate their specific folder in manual_sources/wpm/${p.email}/\n3. Search for their activity in Slack, Jira, and Confluence during Q3 2025 (October 1 - December 31, 2025)\n4. Generate a comprehensive performance review following the Workleap Performance Cycle questionnaire format.`;
          console.log('[AgentRunner] Parameter message created for performance review');
          return msg;
        }
        console.log('[AgentRunner] ❌ No email parameter found in this.agentParams');
        return `\n\n**IMPORTANT: Email Parameter Required**\nNo email address was provided. Please ask the user for the email address of the person to review before proceeding. The email should match someone in the team configuration (config.team.ovTeamMembers or config.team.OVEntireTeam).`;
      },

      'performance-review-q4': () => {
        console.log('[AgentRunner] Processing performance-review-q4 agent. this.agentParams:', p);
        console.log('[AgentRunner] this.agentParams.email value:', p.email);
        if (p.email) {
          const member = (this.config.team?.ovTeamMembers || []).find(m => m.email === p.email)
            || (this.config.team?.['1-1s'] || []).find(m => m.email === p.email);
          const slackId = member?.slackId || 'unknown';
          const name = member?.name || p.email;
          const role = member?.role || 'unknown';
          console.log('[AgentRunner] ✅ Email parameter found! Resolved:', { name, role, slackId });
          return `\n\n**IMPORTANT: Q4 Performance Review Parameters**\nThe team member selected for Q4 performance review:\n- **Email**: ${p.email}\n- **Name**: ${name}\n- **Role**: ${role}\n- **Slack User ID**: ${slackId}\n\nDo NOT ask for an email address — it has already been provided above. Proceed immediately with Step 1 (confirm the person from config) and then Step 4 (scan Slack channel-by-channel using Slack User ID \`${slackId}\`).\n\nQ4 date range: 2026-01-01 to 2026-03-31.`;
        }
        console.log('[AgentRunner] ❌ No email parameter found in this.agentParams');
        return `\n\n**IMPORTANT: Email Parameter Required**\nNo email address was provided. Please ask the user for the email address of the person to review before proceeding. The email should match someone in config.team.ovTeamMembers.`;
      },

      'feature-telemetry-tracking': () => {
        const rawFeature = p.feature;
        const featureKeyTrimmed = typeof rawFeature === 'string' ? rawFeature.trim() : (rawFeature ? String(rawFeature).trim() : '');
        const releases = this.config.releases || {};
        let release = featureKeyTrimmed ? releases[featureKeyTrimmed] : null;
        let featureKey = featureKeyTrimmed;
        // If no release by key, try matching by display name (e.g. "Help me reply" -> help_me_reply)
        if (!release && featureKeyTrimmed) {
          const entry = Object.entries(releases).find(
            ([k, r]) => (r.name || k).toLowerCase() === featureKeyTrimmed.toLowerCase()
          );
          if (entry) { featureKey = entry[0]; release = entry[1]; }
        }
        console.log('[AgentRunner] feature-telemetry-tracking param:', rawFeature, 'trimmed:', featureKeyTrimmed, 'resolved key:', featureKey, 'release found:', !!release);
        if (featureKey && release) {
          const featureName = release.name || featureKey;
          const telemetry = release.telemetry;
          const telemetryStr = Array.isArray(telemetry) ? telemetry.join(', ') : (typeof telemetry === 'string' ? telemetry : 'None');
          return `\n\n**IMPORTANT: Feature Parameter**\nThe selected feature is: "${featureName}" (key: ${featureKey}).\nUse ONLY this feature's telemetry for the report.\n**Telemetry (report IDs or URL) for this feature**: ${telemetryStr || 'None (no report IDs configured)'}\nIf telemetry is a comma-separated list of numeric IDs, query each as a Mixpanel insight bookmark. If it is a single URL, include that link in the report and use it as the feature report reference.\nCompare feature usage to overall MAU (from config["mixpanel-insights"].mau) and compute feature adoption % where possible.`;
        }
        const availableKeys = Object.keys(releases).slice(0, 10).join(', ');
        return `\n\n**IMPORTANT: Feature Parameter Required**\nNo valid feature was provided (received: "${featureKeyTrimmed || 'missing'}"). The feature must be one of the release keys from config.releases. Available keys include: ${availableKeys}${Object.keys(releases).length > 10 ? '...' : ''}. Please ask the user to select a feature from the releases list.`;
      },
    };

    return builders[agentName]?.() ?? '';
  }

  /**
   * Execute an agent
   */
  async runAgent(agentName) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Running Agent: ${agentName.toUpperCase()}`);
    console.log(`${'='.repeat(80)}\n`);

    const startTime = Date.now(); // Track execution start time
    const instructions = this.loadAgentInstructions(agentName);

    // Note: Preflight checks removed - Claude will handle MCP tool availability directly
    // (just like onenote-todos does)

    // Prepare context with configuration (will be cached). Pass agentName for agent-specific slim context.
    this.contextMessage = this.buildContextMessage(agentName);

    // Build parameter message for agents that need it
    const parameterMessage = this.buildParameterMessage(agentName);

    let messages = [
      {
        role: 'user',
        content: `${instructions}${parameterMessage}\n\nPlease execute the agent's instructions now. Use the available MCP tools to gather the required data and provide a comprehensive report following the output format specified in the instructions.`
      }
    ];

    // Lazily connect only the MCPs this agent needs, then build its tool schema
    const agentMCPs = this.loadAgentMCPs(agentName);
    let mcpsToConnect;
    if (agentMCPs === 'user-selected') {
      mcpsToConnect = this.agentParams?.mcps
        ? this.agentParams.mcps.split(',').map(s => s.trim())
        : null; // no param → connect all (legacy behaviour)
    } else {
      mcpsToConnect = agentMCPs; // null (all), [] (none), or string[]
    }
    await this.mcpClient.initializeForServers(mcpsToConnect);

    // Get available tools from MCP (filtered by agent type)
    let tools = this.buildToolsSchema(agentName);

    // Gemini and Ollama silently ignore tools or fail to call them when given too many.
    // Cap using config limit and honour priorityServers ordering.
    if (this.useGemini || this.useOllama) {
      const providerKey = this.useGemini ? 'gemini' : 'ollama';
      const providerConfig = this.config?.[providerKey] || {};
      const maxTools = providerConfig.maxTools ?? 20;
      const priorityServers = (providerConfig.priorityServers || []).map(s => s.toLowerCase());

      if (tools.length > maxTools) {
        // Sort: priority-server tools first, then the rest (preserve relative order within each group)
        if (priorityServers.length > 0) {
          const isPriority = t => priorityServers.some(p => (t._server || t.name || '').toLowerCase().includes(p));
          const priority = tools.filter(t => isPriority(t));
          const rest = tools.filter(t => !isPriority(t));
          tools = [...priority, ...rest];
        }
        console.warn(`⚠️  ${providerKey} tool limit: capping ${tools.length} tools to ${maxTools}. Priority servers: [${priorityServers.join(', ')}]. Keeping: ${tools.slice(0, maxTools).map(t => t.name).join(', ')}`);
        tools = tools.slice(0, maxTools);
      }
      // Strip internal _server field before sending to API
      tools = tools.map(({ _server, ...t }) => t);
    } else {
      // Strip _server for non-Gemini/Ollama paths too
      tools = tools.map(({ _server, ...t }) => t);
    }

    // Debug: Log tool names being sent to Claude
    console.log(`\n🔧 Tools available to ${agentName}:`, tools.map(t => t.name).slice(0, 10).join(', '), tools.length > 10 ? `... and ${tools.length - 10} more` : '');

    // Build system message with caching for context
    // Check if initial prompt is too large and truncate both system message and user message if needed
    let systemText = this.contextMessage;
    let userContent = messages[0].content;
    
    const estimatedSystemTokens = Math.ceil(systemText.length / TOKEN_LIMITS.CHARS_PER_TOKEN);
    const estimatedUserTokens = Math.ceil(userContent.length / TOKEN_LIMITS.CHARS_PER_TOKEN);
    const estimatedToolTokens = tools.length * TOKEN_LIMITS.TOOL_OVERHEAD_PER_TOOL;
    const estimatedTotalTokens = estimatedSystemTokens + estimatedUserTokens + estimatedToolTokens;
    
    console.log(`📊 Token estimation: System=${Math.round(estimatedSystemTokens/1000)}k, User=${Math.round(estimatedUserTokens/1000)}k, Tools=${Math.round(estimatedToolTokens/1000)}k, Total=${Math.round(estimatedTotalTokens/1000)}k (limit=${TOKEN_LIMITS.MAX_PROMPT_TOKENS/1000}k)`);
    
    // If estimated tokens exceed limit, truncate both system and user messages
    if (estimatedTotalTokens > TOKEN_LIMITS.MAX_PROMPT_TOKENS) {
      const buffer = 15000; // Leave 15k buffer for safety
      const availableTokens = TOKEN_LIMITS.MAX_PROMPT_TOKENS - estimatedToolTokens - buffer;
      
      // Allocate 40% to system, 60% to user (user message is more critical for agent execution)
      const maxSystemTokens = Math.floor(availableTokens * 0.4);
      const maxUserTokens = Math.floor(availableTokens * 0.6);
      const maxSystemChars = maxSystemTokens * TOKEN_LIMITS.CHARS_PER_TOKEN;
      const maxUserChars = maxUserTokens * TOKEN_LIMITS.CHARS_PER_TOKEN;
      
      // Truncate system message if needed
      if (systemText.length > maxSystemChars) {
        console.warn(`⚠️  System message too large (${Math.round(estimatedSystemTokens/1000)}k tokens). Truncating to ${Math.round(maxSystemTokens/1000)}k tokens...`);
        // Keep the most important parts: Dates section and agent-specific config
        const lines = systemText.split('\n');
        const importantSections = ['## Dates', '## Dates (CRITICAL)', '## Team', '## Slack', '## Jira', '## Confluence', '## Mixpanel'];
        const keptLines = [];
        let inImportantSection = false;
        
        // Always keep the first section (title)
        keptLines.push(lines[0]);
        
        // Keep important sections
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const isSectionHeader = importantSections.some(section => line.startsWith(section));
          
          if (isSectionHeader) {
            inImportantSection = true;
            keptLines.push(line);
          } else if (inImportantSection && line.trim() && !line.startsWith('##')) {
            keptLines.push(line);
          } else if (line.startsWith('##')) {
            inImportantSection = false;
            // Only keep section if we have space
            if (keptLines.join('\n').length < maxSystemChars * 0.8) {
              keptLines.push(line);
            }
          } else if (keptLines.join('\n').length < maxSystemChars * 0.8) {
            keptLines.push(line);
          }
        }
        
        systemText = keptLines.join('\n');
        // If still too long, truncate by character count
        if (systemText.length > maxSystemChars) {
          systemText = systemText.substring(0, maxSystemChars) + '\n\n[System message truncated due to size limits. Some configuration details may be missing.]';
        }
        
        console.log(`   Truncated system message: ${Math.round(systemText.length / TOKEN_LIMITS.CHARS_PER_TOKEN / 1000)}k tokens`);
      }
      
      // Truncate user message (agent instructions) if needed
      if (userContent.length > maxUserChars) {
        console.warn(`⚠️  Agent instructions too large (${Math.round(estimatedUserTokens/1000)}k tokens). Truncating to ${Math.round(maxUserTokens/1000)}k tokens...`);
        
        // Keep the most important sections: Purpose, Data Sources, Instructions (key parts), Output Format
        const lines = userContent.split('\n');
        const importantSections = ['## Purpose', '## Data Sources', '## Instructions', '## Output Format', '## Success Criteria'];
        const keptLines = [];
        let inImportantSection = false;
        let currentSection = '';
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const isSectionHeader = importantSections.some(section => line.startsWith(section));
          
          if (isSectionHeader) {
            currentSection = line;
            inImportantSection = true;
            keptLines.push(line);
          } else if (inImportantSection) {
            // For Instructions section, keep only key parts (first 200 lines or until we hit limit)
            if (currentSection.includes('## Instructions')) {
              if (keptLines.join('\n').length < maxUserChars * 0.7) {
                keptLines.push(line);
              } else {
                // Add truncation notice
                keptLines.push('\n[Instructions truncated - key sections preserved. Agent should use tools to gather data as specified in Data Sources section.]');
                break;
              }
            } else {
              // For other sections, keep all content
              if (keptLines.join('\n').length < maxUserChars * 0.9) {
                keptLines.push(line);
              } else {
                break;
              }
            }
          } else if (line.startsWith('#')) {
            // New section not in important list - skip unless we have space
            if (keptLines.join('\n').length < maxUserChars * 0.8) {
              keptLines.push(line);
              inImportantSection = true;
              currentSection = line;
            }
          }
        }
        
        userContent = keptLines.join('\n');
        // If still too long, truncate by character count
        if (userContent.length > maxUserChars) {
          userContent = userContent.substring(0, maxUserChars) + '\n\n[Agent instructions truncated due to size limits. Please refer to the Data Sources and Output Format sections for guidance.]';
        }
        
        console.log(`   Truncated user message: ${Math.round(userContent.length / TOKEN_LIMITS.CHARS_PER_TOKEN / 1000)}k tokens`);
      }
      
      // Update the messages array with truncated content
      messages[0].content = userContent;
    }

    // Prompt caching (cache_control) requires models that support it.
    // claude-3-haiku-20240307 does not support the array system message format.
    const modelSupportsCaching = !this.model.startsWith('claude-3-haiku');
    const systemMessage = modelSupportsCaching
      ? [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }]
      : systemText;

    // Final validation - check if we're still over limit after truncation
    const finalSystemTokens = Math.ceil(systemText.length / TOKEN_LIMITS.CHARS_PER_TOKEN);
    const finalUserTokens = Math.ceil(messages[0].content.length / TOKEN_LIMITS.CHARS_PER_TOKEN);
    const finalTotalTokens = finalSystemTokens + finalUserTokens + estimatedToolTokens;
    
    if (finalTotalTokens > TOKEN_LIMITS.MAX_PROMPT_TOKENS) {
      console.error(`❌ Still over token limit after truncation: ${Math.round(finalTotalTokens/1000)}k tokens (limit: ${TOKEN_LIMITS.MAX_PROMPT_TOKENS/1000}k)`);
      console.error(`   System: ${Math.round(finalSystemTokens/1000)}k, User: ${Math.round(finalUserTokens/1000)}k, Tools: ${Math.round(estimatedToolTokens/1000)}k`);
      
      // More aggressive truncation - cut user message more
      const maxAllowed = TOKEN_LIMITS.MAX_PROMPT_TOKENS - estimatedToolTokens - 20000; // 20k buffer
      const maxUserChars = Math.floor(maxAllowed * 0.6) * TOKEN_LIMITS.CHARS_PER_TOKEN;
      
      if (messages[0].content.length > maxUserChars) {
        console.warn(`⚠️  Applying aggressive truncation to user message...`);
        // Keep only Purpose, Data Sources, and Output Format sections
        const lines = messages[0].content.split('\n');
        const essentialSections = ['## Purpose', '## Data Sources', '## Output Format'];
        const keptLines = [];
        let inEssentialSection = false;
        
        for (const line of lines) {
          const isEssential = essentialSections.some(section => line.startsWith(section));
          if (isEssential) {
            inEssentialSection = true;
            keptLines.push(line);
          } else if (inEssentialSection && !line.startsWith('##')) {
            if (keptLines.join('\n').length < maxUserChars * 0.9) {
              keptLines.push(line);
            }
          } else if (line.startsWith('##')) {
            inEssentialSection = false;
          }
        }
        
        messages[0].content = keptLines.join('\n') + '\n\n[Instructions heavily truncated. Use Data Sources section to identify required tools and Output Format for report structure.]';
        console.log(`   Aggressively truncated user message: ${Math.round(messages[0].content.length / TOKEN_LIMITS.CHARS_PER_TOKEN / 1000)}k tokens`);
      }
    }

    try {
      let response = await this.makeApiCall({
        model: this.model,
        max_tokens: API_DEFAULTS.MAX_TOKENS,
        system: systemMessage,
        tools,
        messages
      });

      let totalToolCallsMade = 0;

      // Handle tool use loop
      while (response.stop_reason === 'tool_use') {
        // Find ALL tool_use blocks in the response (Claude can make multiple parallel tool calls)
        const toolUses = response.content.filter(block => block.type === 'tool_use');

        if (toolUses.length === 0) break;

        totalToolCallsMade += toolUses.length;
        console.log(`Agent is using ${toolUses.length} tool(s): ${toolUses.map(t => t.name).join(', ')}`);

        // Execute all tools in parallel
        let toolResults = await Promise.all(
          toolUses.map(async (toolUse) => {
            try {
              let toolResult;

              // Debug: Log exact tool name being called
              console.log(`\n🔧 Calling tool: "${toolUse.name}" (length: ${toolUse.name.length} chars)`);

              // Check if it's a custom filesystem tool
              if (toolUse.name === 'read_file_from_manual_sources' ||
                  toolUse.name === 'list_manual_sources_files' ||
                  toolUse.name === 'list_reports_in_week' ||
                  toolUse.name === 'read_report_file' ||
                  toolUse.name === 'get_current_time') {
                toolResult = await this.handleCustomTool(toolUse.name, toolUse.input);
              } else {
                // Use MCP client for other tools
                toolResult = await this.mcpClient.callTool(toolUse.name, toolUse.input);
              }

              // Summarize large tool results to reduce token usage
              const resultString = JSON.stringify(toolResult);
              const resultLength = resultString.length;

              // If result is larger than 20k characters (~5k tokens), summarize it
              // Lowered from 50k to catch more cases and prevent token limit issues
              if (resultLength > 20000) {
                console.log(`⚠️  Large tool result from ${toolUse.name} (${Math.round(resultLength/1000)}k chars, ~${Math.round(resultLength/TOKEN_LIMITS.CHARS_PER_TOKEN/1000)}k tokens), summarizing...`);

                // Try to intelligently truncate based on result type
                if (Array.isArray(toolResult)) {
                  // For arrays, keep fewer items (30 instead of 50) to save tokens
                  const keepItems = Math.min(30, toolResult.length);
                  toolResult = {
                    _summary: `Array truncated: showing first ${keepItems} of ${toolResult.length} items. Use this sample to understand the data structure and patterns.`,
                    _total_items: toolResult.length,
                    items: toolResult.slice(0, keepItems)
                  };
                } else if (typeof toolResult === 'object' && toolResult !== null) {
                  // Keep structure but truncate large string values more aggressively
                  const summarized = {};
                  for (const [key, value] of Object.entries(toolResult)) {
                    if (typeof value === 'string' && value.length > 3000) {
                      // Truncate strings more aggressively (3k instead of 5k)
                      summarized[key] = value.substring(0, 3000) + `... [truncated ${Math.round((value.length - 3000)/1000)}k more chars]`;
                    } else if (Array.isArray(value) && value.length > 20) {
                      // Truncate large arrays within objects
                      summarized[key] = value.slice(0, 20);
                      summarized[`${key}_truncated`] = `Showing first 20 of ${value.length} items`;
                    } else {
                      summarized[key] = value;
                    }
                  }
                  toolResult = {
                    _summary: 'Large object values truncated to reduce token usage',
                    ...summarized
                  };
                } else if (typeof toolResult === 'string' && toolResult.length > 20000) {
                  // For very large strings, truncate more aggressively
                  toolResult = toolResult.substring(0, 15000) + `\n\n[Content truncated: ${Math.round((toolResult.length - 15000)/1000)}k more characters removed to stay within token limits]`;
                }
              }

              return {
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(toolResult)
              };
            } catch (toolError) {
              const toolErrorMessage = toolError?.message || toolError?.error?.message || 'Unknown tool error';
              const errorLower = toolErrorMessage.toLowerCase();
              const isAuthRequired = errorLower.includes('authenticationrequirederror') ||
                                     errorLower.includes('authentication required') ||
                                     errorLower.includes('interaction required') ||
                                     errorLower.includes('consent_required') ||
                                     errorLower.includes('login required') ||
                                     errorLower.includes('no account') ||
                                     errorLower.includes('gettoken');

              console.warn(`⚠️  Tool ${toolUse.name} failed: ${toolErrorMessage}`);
              if (isAuthRequired) {
                console.warn(`⚠️  ${toolUse.name} appears to require interactive authentication. Returning tool-level auth error so the agent can continue.`);
              }

              return {
                type: 'tool_result',
                tool_use_id: toolUse.id,
                is_error: true,
                content: JSON.stringify({
                  error: true,
                  tool: toolUse.name,
                  authRequired: isAuthRequired,
                  message: toolErrorMessage
                })
              };
            }
          })
        );

        // Check token count BEFORE adding tool results to prevent exceeding limit
        // Estimate what the token count will be after adding these results
        const testMessages = [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults }
        ];
        const estimatedTokensAfter = this.messageTruncator.estimateTokenCount(testMessages, tools);
        
        // Use a more conservative limit (150k instead of 180k) to leave larger buffer
        // This prevents hitting the 200k hard limit during conversation growth
        const conservativeLimit = 150000; // 150k tokens (leaves 50k buffer for safety)
        
        if (estimatedTokensAfter > conservativeLimit) {
          console.log(`⚠️  Estimated token count after tool results (${Math.round(estimatedTokensAfter/1000)}k) exceeds conservative limit (${Math.round(conservativeLimit/1000)}k), truncating before adding results...`);
          // Truncate existing messages more aggressively to make room for new tool results
          const targetLimit = conservativeLimit - 10000; // Leave 10k for new tool results
          messages = this.messageTruncator.truncateMessages(messages, targetLimit, tools);
          
          // Re-estimate after truncation
          const testMessagesAfterTruncate = [
            ...messages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults }
          ];
          const newEstimatedTokens = this.messageTruncator.estimateTokenCount(testMessagesAfterTruncate, tools);
          
          if (newEstimatedTokens > conservativeLimit) {
            console.warn(`⚠️  Still over limit after truncation (${Math.round(newEstimatedTokens/1000)}k). Tool results may be very large.`);
            // Further truncate tool results if still over limit
            const toolResultsTruncated = toolResults.map(result => {
              if (typeof result.content === 'string') {
                const content = JSON.parse(result.content);
                const contentStr = JSON.stringify(content);
                if (contentStr.length > 10000) {
                  // Truncate very large tool results
                  const truncated = contentStr.substring(0, 10000) + '... [truncated]';
                  return { ...result, content: truncated };
                }
              }
              return result;
            });
            toolResults = toolResultsTruncated;
          }
        }

        // Add assistant's response with all tool_use blocks
        messages.push({
          role: 'assistant',
          content: response.content
        });

        // Add user message with all tool_result blocks
        messages.push({
          role: 'user',
          content: toolResults
        });

        // Get next response with rate limiting
        // Add extra delay after tool execution to prevent rapid-fire requests
        await sleep(RATE_LIMITING.TOOL_EXECUTION_DELAY);

        // Final check after adding messages - truncate if needed
        const finalEstimatedTokens = this.messageTruncator.estimateTokenCount(messages, tools);
        if (finalEstimatedTokens > conservativeLimit) {
          console.log(`⚠️  Token count (${Math.round(finalEstimatedTokens/1000)}k) exceeds conservative limit, truncating messages...`);
          messages = this.messageTruncator.truncateMessages(messages, conservativeLimit, tools);
        }
        
        response = await this.makeApiCall({
          model: this.model,
          max_tokens: API_DEFAULTS.MAX_TOKENS,
          system: systemMessage,
          tools,
          messages
        });
      }

      // Extract final text response
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      const endTime = Date.now(); // Track execution end time
      const executionTimeMs = endTime - startTime;
      const executionTimeSec = (executionTimeMs / 1000).toFixed(2);
      const executionTimeMin = (executionTimeMs / 60000).toFixed(2);

      // Warn if agent made zero tool calls despite having tools available — likely hallucination.
      const agentHasTools = tools.length > 0;
      const zeroToolCalls = totalToolCallsMade === 0 && agentHasTools;
      if (zeroToolCalls) {
        console.warn(`⚠️  [${agentName}] Agent completed without making ANY tool calls despite ${tools.length} tools being available. Output may be hallucinated.`);
      }

      const result = {
        agentName,
        success: true,
        output: textContent,
        usage: response.usage,
        executionTimeMs,
        executionTimeSec,
        executionTimeMin,
        toolCallsMade: totalToolCallsMade,
        hallucinationWarning: zeroToolCalls,
        llmBackend: this.useOllama ? 'Ollama' : this.useGemini ? 'Gemini' : 'Claude',
        llmModel: this.model
      };
      
      // Include agent-specific parameters in result for reporting
      if (agentName === 'business-health' && this.agentParams.manualSourcesFolder) {
        result.manualSourcesFolder = this.agentParams.manualSourcesFolder;
      }
      if (agentName === 'telemetry-deepdive' && this.agentParams.folder) {
        result.folder = this.agentParams.folder;
        console.log("---------folder selected--------:" + this.agentParams.folder)
      }
      if (agentName === 'feature-telemetry-tracking' && this.agentParams.feature) {
        result.feature = this.agentParams.feature;
      }

      return result;

    } catch (error) {
      const errorMessage = error.message || error.error?.message || 'Unknown error';
      console.error(`Error running agent ${agentName}:`, errorMessage);
      
      // Check if it's a rate limit error
      const errorType = error.error?.type || error.type;
      const errorMsgLower = errorMessage.toLowerCase();
      const isRateLimitError = error.status === 429 || 
                               error.statusCode === 429 ||
                               errorType === 'rate_limit_error' ||
                               errorMsgLower.includes('rate_limit') ||
                               errorMsgLower.includes('rate limit') ||
                               errorMsgLower.includes('would exceed the rate limit');
      
      // Check if it's a "prompt too long" error
      const isPromptTooLong = error.status === 400 &&
                              (errorType === 'invalid_request_error' ||
                               errorMsgLower.includes('prompt is too long') ||
                               errorMsgLower.includes('too long') ||
                               errorMsgLower.includes('maximum'));
      
      if (isPromptTooLong) {
        console.error('❌ Prompt too long error: The conversation history exceeded the 200k token limit.');
        console.error('This can happen when an agent processes many large data sources.');
        console.error('The system has implemented:');
        console.error('  ✓ Proactive truncation during tool use loop');
        console.error('  ✓ Aggressive summarization of large tool results (>20k chars)');
        console.error('  ✓ Conservative token limits (150k) to leave buffer');
        console.error('Suggestions:');
        console.error('  1. Reduce the date range (use --start-date and --end-date with shorter periods)');
        console.error('  2. Split the agent work into smaller tasks');
        console.error('  3. Reduce the number of data sources processed at once');
        console.error('  4. For business-health: process fewer Slack channels or shorter time periods');
        console.error('  5. For strategy-roadmap: process feedback pages in batches');
      } else if (isRateLimitError) {
        console.error('Rate limit exceeded. The system will retry with exponential backoff.');
        console.error('If this persists, consider:');
        console.error('  1. Running agents individually with longer delays');
        console.error('  2. Reducing the scope of agent instructions');
        console.error('  3. Contacting Anthropic for a rate limit increase');
      }
      
      return {
        agentName,
        success: false,
        error: errorMessage,
        errorDetails: isRateLimitError ? 'Rate limit error' : undefined,
        llmBackend: this.useOllama ? 'Ollama' : this.useGemini ? 'Gemini' : 'Claude',
        llmModel: this.model
      };
    }
  }

  /**
   * Build context message with configuration (optimized for token usage).
   * @param {string} [agentName] - If provided, may return a slim context for specific agents (e.g. mixpanel-query).
   */
  buildContextMessage(agentName) {
    console.log('[AgentRunner] buildContextMessage called with dateRange:', this.dateRange, 'agentName:', agentName);
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentISOWeek = getISOWeekNumber(today);

    // Get default days from config, default to 7 if not specified (weekly-recap and business-pulse use 5 days)
    let defaultDays = this.config?.settings?.defaultDays || 7;
    if ((agentName === 'weekly-recap' || agentName === 'business-pulse') && !this.dateRange) {
      defaultDays = 5;
    }

    // Use provided date range or calculate defaults
    let endDateISO = todayISO;
    let startDateISO = null;
    let threeDaysAgoISO = null;
    
    if (this.dateRange) {
      endDateISO = this.dateRange.endDate || todayISO;
      const endDateObj = new Date(endDateISO + 'T00:00:00');

      // If start date is not provided, default to configured days before end date
      if (this.dateRange.startDate) {
        startDateISO = this.dateRange.startDate;
      } else {
        const defaultDaysAgo = new Date(endDateObj);
        defaultDaysAgo.setDate(endDateObj.getDate() - defaultDays);
        startDateISO = defaultDaysAgo.toISOString().split('T')[0];
      }

      // Calculate 3 days ago from end date
      const threeDaysAgo = new Date(endDateObj);
      threeDaysAgo.setDate(endDateObj.getDate() - 3);
      threeDaysAgoISO = threeDaysAgo.toISOString().split('T')[0];
    } else {
      // Default behavior: calculate configured days ago and 3 days ago
      const defaultDaysAgo = new Date(today);
      defaultDaysAgo.setDate(today.getDate() - defaultDays);
      startDateISO = defaultDaysAgo.toISOString().split('T')[0];
      
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);
      threeDaysAgoISO = threeDaysAgo.toISOString().split('T')[0];
    }

    // Slim context for mixpanel-query to stay under 200k token limit (only Mixpanel + dates)
    if (agentName === 'mixpanel-query') {
      const mauInsightIds = (this.config["mixpanel-insights"]?.mau || []).join(', ') || 'None';
      const providedInsightIds = this.agentParams?.insightIds;
      let mixpanelInsightsBlock;
      if (providedInsightIds) {
        const insightIdsArray = String(providedInsightIds).split(',').map(id => id.trim()).filter(id => id.length > 0);
        mixpanelInsightsBlock = `MAU Insight (bookmark ID): ${mauInsightIds}
**CRITICAL: FIRST query the MAU insight to get total unique organizations and users for percentage calculations**
Insight IDs (from parameter): ${insightIdsArray.join(', ')}
**CRITICAL: Use ONLY these bookmark IDs when querying Mixpanel insights: ${insightIdsArray.join(', ')}**
**Chart Link Format**: https://mixpanel.com/project/${this.config.mixpanel?.projectId || 'PROJECT_ID'}/view/${this.config.mixpanel?.workspaceId || 'WORKSPACE_ID'}/app/insights/?discover=1#report/{bookmarkId}`;
      } else {
        const customSurveys = (this.config["mixpanel-insights"]?.customSurveys || []).join(', ') || 'None';
        const others = (this.config["mixpanel-insights"]?.others || []).join(', ') || 'None';
        mixpanelInsightsBlock = `MAU Insight (bookmark ID): ${mauInsightIds}
**CRITICAL: FIRST query the MAU insight to get total unique organizations and users for percentage calculations**
Custom Surveys (bookmark IDs): ${customSurveys}
Other Insights (bookmark IDs): ${others}
**CRITICAL: Use ALL bookmark IDs from config["mixpanel-insights"].customSurveys and config["mixpanel-insights"].others when querying Mixpanel insights.**
**Chart Link Format**: https://mixpanel.com/project/${this.config.mixpanel?.projectId || 'PROJECT_ID'}/view/${this.config.mixpanel?.workspaceId || 'WORKSPACE_ID'}/app/insights/?discover=1#report/{bookmarkId}`;
      }
      return `# Configuration (Mixpanel Agent – Slim)

## Dates
Start: ${startDateISO} | End: ${endDateISO}

## Mixpanel
Project ID: ${this.config.mixpanel?.projectId || 'N/A'}
Workspace ID: ${this.config.mixpanel?.workspaceId || 'N/A'}
**CRITICAL: ALWAYS include projectId and workspaceId in Mixpanel MCP tool calls.**

## Mixpanel Insights
${mixpanelInsightsBlock}

## Dates (CRITICAL)
**Current Date**: ${todayISO}
**Analysis Period**: ${startDateISO} to ${endDateISO} (inclusive). Use ISO format YYYY-MM-DD for date params.`;
    }

    // Slim context for feature-telemetry-tracking: one feature's telemetry + MAU + dates
    if (agentName === 'feature-telemetry-tracking') {
      const mauIds = (this.config["mixpanel-insights"]?.mau || []).join(', ') || 'None';
      const rawFeature = this.agentParams?.feature;
      const featureKeyTrimmed = typeof rawFeature === 'string' ? rawFeature.trim() : (rawFeature ? String(rawFeature).trim() : '');
      const releases = this.config.releases || {};
      let release = featureKeyTrimmed ? releases[featureKeyTrimmed] : null;
      let featureKey = featureKeyTrimmed;
      if (!release && featureKeyTrimmed) {
        const entry = Object.entries(releases).find(
          ([k, r]) => (r.name || k).toLowerCase() === featureKeyTrimmed.toLowerCase()
        );
        if (entry) {
          featureKey = entry[0];
          release = entry[1];
        }
      }
      const featureName = release?.name || featureKey || 'Unknown';
      const telemetry = release?.telemetry;
      const telemetryStr = Array.isArray(telemetry)
        ? telemetry.join(', ')
        : (typeof telemetry === 'string' && telemetry ? telemetry : 'None');
      return `# Configuration (Feature Telemetry – Slim)

## Dates
Start: ${startDateISO} | End: ${endDateISO}

## Mixpanel
Project ID: ${this.config.mixpanel?.projectId || 'N/A'}
Workspace ID: ${this.config.mixpanel?.workspaceId || 'N/A'}
**CRITICAL: ALWAYS include projectId and workspaceId in Mixpanel MCP tool calls.**

## Overall MAU (baseline for adoption %)
MAU Insight (bookmark ID): ${mauIds}
**CRITICAL: FIRST query the MAU insight to get total unique users/organizations, then use that as the denominator for feature adoption %.**

## Selected Feature
Feature name: ${featureName}
Feature key: ${featureKey || 'N/A'}
**Telemetry (report IDs or URL for this feature)**: ${telemetryStr}
**Use only the telemetry value above** when querying this feature's Mixpanel report(s). If numeric IDs, query each with the Mixpanel MCP. If a URL, include it in the report as the feature report link.

## Dates (CRITICAL)
**Current Date**: ${todayISO}
**Analysis Period**: ${startDateISO} to ${endDateISO} (inclusive). Use ISO format YYYY-MM-DD for date params.`;
    }

    // Build concise configuration - only include essential values
    const teamPMs = (this.config.team?.ovTeamMembers || [])
      .map(m => `${m.name} (${m.email}, Slack: ${m.slackId || 'N/A'})`)
      .join(', ');
    const jiraTeams = (this.config.team?.jiraTeams || []).join(', ');
    const jiraProducts = (this.config.team?.jiraProducts || []).join(', ');
    const ovEntireTeam = (this.config.team?.OVEntireTeam || []).join(', ');
    const slackChannels = this.config.slack?.channels || {};
    const salesChannels = (slackChannels.salesChannels || []).join(', ');
    const csmChannels = (slackChannels.csmChannels || []).join(', ');
    const productGeneral = (slackChannels.productGeneral || []).join(', ');
    const productFeedback = (slackChannels.productFeedback || []).join(', ');
    const teamChannels = (slackChannels.teamChannels || []).join(', ');
    const telemetryChannels = (slackChannels.telemetryChannels || []).join(', ');

    const dateRangeText = `Start: ${startDateISO} | End: ${endDateISO}${threeDaysAgoISO ? ` | 3d ago from end: ${threeDaysAgoISO}` : ''}`;
    console.log('[AgentRunner] Calculated date range:', { startDateISO, endDateISO, threeDaysAgoISO, dateRangeText });
    const calendarNames = (this.config.calendar?.name || []).join(', ');
    const oneOnOnes = (this.config.team?.["1-1s"] || []).map(p => 
      `${p.name} (${p.email}, Role: ${p.role}, Relationship: ${p.relationship}, Slack: ${p.slackId}, DM: ${p.slackDMs || 'N/A'})`
    ).join('; ');
    const oneOnOneChannelTopics = (this.config.team?.["1-1-channelsTopics"] || []).join(', ');

    return `# Configuration (Concise Format)

## Dates
${dateRangeText}

## Team
PMs: ${teamPMs}
Jira Teams: ${jiraTeams}
Jira Products: ${jiraProducts}
OV Entire Team: ${ovEntireTeam}

## 1-1 People
1-1s: ${oneOnOnes || 'None'}
1-1 Channel Topics: ${oneOnOneChannelTopics || 'None'}
**IMPORTANT: 1-1 channel values are Slack channel IDs. Use these IDs directly in MCP tool calls.**

## Calendar
Calendar Names: ${calendarNames || 'None'}
**IMPORTANT: Use google-calendar MCP tools (list-calendars, list-events, search-events, get-freebusy) to access these calendars. Calendar names from config: ${calendarNames || 'None'}. You can use calendar names directly in the tools - they support both calendar IDs and calendar names.**

## Slack
Team channels: ${teamChannels || 'None'}
Product general channels: ${productGeneral || 'None'}
Product feedback channels: ${productFeedback || 'None'}
Sales channels: ${salesChannels || 'None'}
CSM channels: ${csmChannels || 'None'}
Telemetry channels: ${telemetryChannels || 'None'}
My user ID: ${this.config.slack?.myslackuserId || 'N/A'}
**IMPORTANT: All channel values above are Slack channel IDs (format: C075SE700NM). Use these IDs directly in MCP tool calls, NOT channel names.**

## Jira
OKR Board: ${this.config.jira?.ovOkrBoardId || 'N/A'}
Project: ${this.config.jira?.projectKey || 'N/A'}
OV Project: ${this.config.jira?.OVprojectKey || 'N/A'}

## Confluence
VoC Page ID: ${this.config.confluence?.vocPageId || 'N/A'}
Space: ${this.config.confluence?.spaceKey || 'N/A'}

## Hubspot
Product filter: ${this.config.hubspot?.productFilter || 'N/A'}

## Mixpanel
Project ID: ${this.config.mixpanel?.projectId || 'N/A'}
Workspace ID: ${this.config.mixpanel?.workspaceId || 'N/A'}
Username: ${this.config.mixpanel?.username ? 'Set' : 'N/A'}
**CRITICAL: When calling Mixpanel MCP tools, ALWAYS include the projectId parameter using the value from config.mixpanel.projectId (${this.config.mixpanel?.projectId || 'NOT SET - CHECK CONFIG'}). The projectId is required for all Mixpanel queries.**
**CRITICAL: Always include workspaceId parameter using the value from config.mixpanel.workspaceId (${this.config.mixpanel?.workspaceId || 'NOT SET - CHECK CONFIG'}).**

## Mixpanel Insights
${(() => {
      // MAU insight ID for baseline calculations
      const mauInsightIds = (this.config["mixpanel-insights"]?.mau || []).join(', ') || 'None';
      
      // If insightIds parameter is provided, use it; otherwise use config defaults
      const providedInsightIds = this.agentParams?.insightIds;
      if (providedInsightIds) {
        // Parse comma-separated list
        const insightIdsArray = providedInsightIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
        return `MAU Insight (bookmark ID): ${mauInsightIds}
**CRITICAL: FIRST query the MAU insight to get total unique organizations and users for percentage calculations**
Insight IDs (from parameter): ${insightIdsArray.join(', ')}
**CRITICAL: Use ONLY these bookmark IDs when querying Mixpanel insights: ${insightIdsArray.join(', ')}**
**Chart Link Format**: For each insight report, include a link to the Mixpanel chart: https://mixpanel.com/project/${this.config.mixpanel?.projectId || 'PROJECT_ID'}/view/${this.config.mixpanel?.workspaceId || 'WORKSPACE_ID'}/app/insights/?discover=1#report/{bookmarkId} (replace {bookmarkId} with the actual insight ID)`;
      } else {
        // Use config defaults
        const customSurveys = (this.config["mixpanel-insights"]?.customSurveys || []).join(', ') || 'None';
        const others = (this.config["mixpanel-insights"]?.others || []).join(', ') || 'None';
        const specificNetwork = (this.config["mixpanel-insights"]?.specificNetwork || []).join(', ') || 'None';
        return `MAU Insight (bookmark ID): ${mauInsightIds}
**CRITICAL: FIRST query the MAU insight to get total unique organizations and users for percentage calculations**
Custom Surveys (bookmark IDs): ${customSurveys}
Other Insights (bookmark IDs): ${others}
Specific Network (bookmark IDs): ${specificNetwork}
**CRITICAL: Use ALL bookmark IDs from config["mixpanel-insights"].customSurveys and config["mixpanel-insights"].others when querying Mixpanel insights. DO NOT hardcode insight IDs - always use the values from this configuration.**
**Chart Link Format**: For each insight report, include a link to the Mixpanel chart: https://mixpanel.com/project/${this.config.mixpanel?.projectId || 'PROJECT_ID'}/view/${this.config.mixpanel?.workspaceId || 'WORKSPACE_ID'}/app/insights/?discover=1#report/{bookmarkId} (replace {bookmarkId} with the actual insight ID)`;
      }
    })()}

## Thought Leadership
RSS Feeds: ${(this.config.thoughtleadership?.rssFeeds || []).join(', ') || 'None'}
HR News RSS: ${(this.config.thoughtleadership?.hrNewsRSS || []).join(', ') || 'None'}
AI Critics: ${(this.config.thoughtleadership?.AICritics || []).join(', ') || 'None'}
Web Sources: ${(this.config.thoughtleadership?.webSources || []).join(', ') || 'None'}
Industry News Sources: ${(this.config.thoughtleadership?.industryNewsSources || []).join(', ') || 'None'}
Reddit Sources (top ${this.config.thoughtleadership?.redditSources?.topPosts || 3} posts each): ${(this.config.thoughtleadership?.redditSources?.subreddits || []).map(s => `${s.name} (${s.reason})`).join(', ') || 'None'}
NYTimes Tech & AI: Use the nytimes MCP to fetch the top ${this.config.thoughtleadership?.nyTimes?.topArticlesCount || 3} articles from the "${(this.config.thoughtleadership?.nyTimes?.sections || ['technology']).join('", "')}" section(s). Filter for articles related to: ${(this.config.thoughtleadership?.nyTimes?.filterTopics || []).join(', ')}.
The Atlantic: Use the theatlantic MCP to fetch the top ${this.config.thoughtleadership?.theAtlantic?.topArticlesCount || 3} articles. Filter for articles related to: ${(this.config.thoughtleadership?.theAtlantic?.filterTopics || []).join(', ')}.
**CRITICAL: ONLY use RSS feeds listed above. DO NOT search for or use any RSS feeds not explicitly listed here.**

## Releases
${(() => {
      const releases = this.config.releases || {};
      if (Object.keys(releases).length === 0) {
        return 'None';
      }
      // Format releases as a readable list
      return Object.entries(releases)
        .map(([key, release]) => {
          const name = release.name || key;
          const date = release.date || 'N/A';
          const type = release.type || 'unknown';
          const description = release.description || '';
          return `- ${name} (${date}, ${type})${description ? `: ${description}` : ''}`;
        })
        .sort((a, b) => {
          // Sort by date (extract date from string)
          const dateA = a.match(/\(([0-9-]+),/)?.[1] || '';
          const dateB = b.match(/\(([0-9-]+),/)?.[1] || '';
          return dateB.localeCompare(dateA); // Descending order (newest first)
        })
        .join('\n');
    })()}
**IMPORTANT: Release data is available in config.releases. Each release has: name, date (YYYY-MM-DD format), type (major/minor), and description. Use this data to correlate release dates with business metrics (ARR growth, deal activity, churn patterns).**

## Dates (CRITICAL)
**Current Date/Time**: Today is ${todayISO}. The current date and time information is already provided here - DO NOT call any date/time retrieval tools (like get_current_time or similar).
**Current ISO Calendar Week**: Week ${currentISOWeek} of ${today.getFullYear()} (use this when looking for OneNote weekly pages, e.g., "Week ${currentISOWeek}" or "Week ${currentISOWeek}, ${today.getFullYear()}").
**Analysis Period**: Use ISO format YYYY-MM-DD for date params. The dates define an INCLUSIVE date range (period) from ${startDateISO} to ${endDateISO} (includes both start and end dates). When querying data sources, use parameters like after: "${startDateISO}" (inclusive) and before: "${endDateISO}" or onOrBefore: "${endDateISO}" (depending on API) to query data within this period.${threeDaysAgoISO ? ` For "last 3 days", use "${threeDaysAgoISO}".` : ''}`;
  }

  /**
   * Normalize MCP server name for flexible matching
   * Handles common variations like "withings-mcp", "mcp-withings", "oura-ring", etc.
   */
  normalizeServerName(serverName) {
    return serverName.toLowerCase()
      .replace(/^mcp[-_]?/, '')  // Remove "mcp-" or "mcp_" prefix
      .replace(/[-_]mcp$/, '')   // Remove "-mcp" or "_mcp" suffix
      .replace(/[-_]/g, '')      // Remove all dashes and underscores
      .trim();
  }

  /**
   * Build tools schema for Claude from MCP tools + custom filesystem tools
   * Filters tools based on agent-level ## MCPs configuration in the agent markdown file.
   * Falls back to legacy hardcoded filtering for agents without an ## MCPs section.
   */
  buildToolsSchema(agentName) {
    const availableTools = this.mcpClient.getAvailableTools();
    const agentMCPs = this.loadAgentMCPs(agentName);

    let filteredTools;

    if (agentMCPs !== null) {
      // --- Per-agent MCP config path ---
      if (agentMCPs === 'user-selected') {
        // research-ask style: MCPs passed as a runtime param
        if (this.agentParams?.mcps) {
          const selectedMcps = this.agentParams.mcps.split(',').map(s => s.trim().toLowerCase());
          filteredTools = availableTools.filter(tool => {
            const server = (tool.server || '').toLowerCase();
            return selectedMcps.some(sel => server.includes(sel) || sel.includes(server));
          });
          console.log(`[buildToolsSchema] User-selected MCPs for ${agentName}: [${selectedMcps.join(', ')}], ${filteredTools.length} tools`);
        } else {
          filteredTools = availableTools;
          console.log(`[buildToolsSchema] User-selected MCPs for ${agentName}: no param provided, all ${filteredTools.length} tools included`);
        }
      } else if (agentMCPs.length === 0) {
        // No MCPs needed — only custom filesystem tools
        filteredTools = [];
        console.log(`[buildToolsSchema] No MCPs configured for ${agentName}, using custom tools only`);
      } else {
        // Filter to exactly the listed MCPs using flexible name matching
        filteredTools = availableTools.filter(tool => {
          const normalizedServer = this.normalizeServerName(tool.server);
          return agentMCPs.some(mcp => {
            const normalizedMcp = this.normalizeServerName(mcp);
            return normalizedServer.includes(normalizedMcp) || normalizedMcp.includes(normalizedServer);
          });
        });
        const matchedServers = [...new Set(filteredTools.map(t => t.server))];
        const unmatchedMCPs = agentMCPs.filter(mcp => {
          const normalizedMcp = this.normalizeServerName(mcp);
          return !matchedServers.some(s => {
            const ns = this.normalizeServerName(s);
            return ns.includes(normalizedMcp) || normalizedMcp.includes(ns);
          });
        });
        console.log(`[buildToolsSchema] Configured MCPs for ${agentName}: [${agentMCPs.join(', ')}], matched: [${matchedServers.join(', ')}], ${filteredTools.length} tools`);
        if (unmatchedMCPs.length > 0) {
          console.warn(`[buildToolsSchema] ⚠️  MCPs configured but not found/connected for ${agentName}: ${unmatchedMCPs.join(', ')}`);
        }
      }
    } else {
      // --- Legacy fallback: no ## MCPs section in agent file ---
      const mcpConfig = this.config?.mcp || {};
      const healthServers = mcpConfig.health?.servers || [];

      filteredTools = availableTools.filter(tool => {
        const serverName = tool.server.toLowerCase();
        return !healthServers.some(healthServer =>
          serverName.includes(healthServer.toLowerCase())
        );
      });
      console.log(`[buildToolsSchema] Legacy filter for ${agentName}: excluded health MCPs (${healthServers.join(', ')}), ${filteredTools.length} tools available`);
    }

    const mcpTools = filteredTools.map(tool => ({
      name: tool.name,
      description: `[${tool.server}] ${tool.schema.description || `Tool from ${tool.server} server`}`,
      input_schema: tool.schema.inputSchema || {
        type: 'object',
        properties: {},
        required: []
      },
      _server: tool.server  // preserved for Gemini priority sorting; stripped before API call
    }));

    // Add custom filesystem tools using ToolHandler (always include)
    const filesystemTools = this.toolHandler.buildCustomToolsSchema();

    return [...mcpTools, ...filesystemTools];
  }

  /**
   * Handle custom filesystem tool calls (delegated to ToolHandler)
   */
  async handleCustomTool(toolName, args) {
    return await this.toolHandler.handleCustomTool(toolName, args);
  }
}
