import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { CLAUDE_MODELS, GEMINI_MODELS, OLLAMA_CLOUD_MODELS, OLLAMA_LOCAL_MODELS } from '../llmModels'

const API_URL = import.meta.env.VITE_API_URL || ''

const ALL_MODELS = [
  ...CLAUDE_MODELS.map(m => ({ backend: 'claude', model: m.value, label: m.label, color: 'blue', tag: m.tag })),
  ...GEMINI_MODELS.map(m => ({ backend: 'gemini', model: m.value, label: m.label, color: 'purple', tag: m.tag })),
  ...OLLAMA_CLOUD_MODELS.map(m => ({ backend: 'ollama', model: m.value, label: m.label, color: 'amber', tag: m.tag })),
  ...OLLAMA_LOCAL_MODELS.map(m => ({ backend: 'ollama', model: m.value, label: m.label, color: 'amber', tag: m.tag })),
]

const BACKEND_ICON = { claude: '🔑', gemini: '💎', ollama: '🦙' }
const BACKEND_LABEL = { claude: 'Claude', gemini: 'Gemini', ollama: 'Ollama' }

// Keyword groups per MCP server type — used for quick prompt analysis
const MCP_KEYWORD_MAP = {
  slack: ['slack', 'channel', 'message', 'dm', 'workspace', 'team chat'],
  jira: ['jira', 'ticket', 'issue', 'sprint', 'backlog', 'story', 'epic', 'project board'],
  notion: ['notion', 'page', 'database', 'workspace', 'doc'],
  github: ['github', 'repo', 'pull request', 'pr', 'commit', 'branch', 'issue', 'code review'],
  mixpanel: ['mixpanel', 'analytics', 'event', 'funnel', 'retention', 'metric', 'user tracking'],
  google: ['google', 'drive', 'sheets', 'gmail', 'calendar', 'docs'],
  linear: ['linear', 'issue', 'cycle', 'team', 'project'],
  confluence: ['confluence', 'wiki', 'documentation', 'space'],
  instapaper: ['instapaper', 'article', 'read later', 'bookmark'],
}

function detectMcpNeeds(prompt, mcpServers) {
  const lower = prompt.toLowerCase()
  const needed = []
  for (const serverName of Object.keys(mcpServers)) {
    const keyLower = serverName.toLowerCase()
    // Check server name itself
    if (lower.includes(keyLower)) {
      needed.push(serverName)
      continue
    }
    // Check known keyword mappings
    const keywords = MCP_KEYWORD_MAP[keyLower] || []
    if (keywords.some(kw => lower.includes(kw))) {
      needed.push(serverName)
    }
  }
  return needed
}

function ResultCard({ result, model }) {
  const colorMap = { blue: 'border-blue-200 bg-blue-50', purple: 'border-purple-200 bg-purple-50', amber: 'border-amber-200 bg-amber-50' }
  const headerMap = { blue: 'bg-blue-100 text-blue-800', purple: 'bg-purple-100 text-purple-800', amber: 'bg-amber-100 text-amber-800' }

  return (
    <div className={`border-2 rounded-xl overflow-hidden flex flex-col ${colorMap[model.color]}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${headerMap[model.color]}`}>
        <div>
          <span className="font-semibold text-sm">{BACKEND_ICON[model.backend]} {model.label}</span>
          <span className="ml-2 text-xs opacity-70">{BACKEND_LABEL[model.backend]}</span>
        </div>
        {result && !result.error && (
          <span className="text-xs font-mono opacity-80">{(result.latencyMs / 1000).toFixed(2)}s</span>
        )}
      </div>

      <div className="p-4 flex-1 min-h-[160px]">
        {!result ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            Running...
          </div>
        ) : result.error ? (
          <div className="text-red-600 text-sm">
            <span className="font-semibold">Error:</span> {result.error}
          </div>
        ) : (
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{result.response}</pre>
        )}
      </div>
    </div>
  )
}

ResultCard.propTypes = {
  result: PropTypes.object,
  model: PropTypes.object.isRequired,
}

export default function LLMEvaluator({ password }) {
  const [selectedModels, setSelectedModels] = useState(['claude/claude-sonnet-4-5-20250929'])
  const [prompt, setPrompt] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystem, setShowSystem] = useState(false)
  const [results, setResults] = useState({})
  const [running, setRunning] = useState(false)
  const [mcpServers, setMcpServers] = useState({})
  const [mcpNeeded, setMcpNeeded] = useState([])
  const abortRef = useRef(null)

  const headers = { 'Content-Type': 'application/json', ...(password ? { 'x-app-password': password } : {}) }

  useEffect(() => {
    fetch(`${API_URL}/api/llm-eval/mcp-servers`, { headers })
      .then(async r => {
        const text = await r.text()
        try { return JSON.parse(text) } catch { return {} }
      })
      .then(data => setMcpServers(data || {}))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!prompt.trim()) { setMcpNeeded([]); return }
    setMcpNeeded(detectMcpNeeds(prompt, mcpServers))
  }, [prompt, mcpServers])

  const toggleModel = (key) => {
    setSelectedModels(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const selectedModelObjects = ALL_MODELS.filter(m => selectedModels.includes(`${m.backend}/${m.model}`))

  const handleRun = async () => {
    if (!prompt.trim() || selectedModelObjects.length === 0) return
    setRunning(true)
    setResults({})
    abortRef.current = new AbortController()

    const runs = selectedModelObjects.map(async (m) => {
      const key = `${m.backend}/${m.model}`
      try {
        const r = await fetch(`${API_URL}/api/llm-eval/run`, {
          method: 'POST',
          headers,
          signal: abortRef.current.signal,
          body: JSON.stringify({
            backend: m.backend,
            model: m.model,
            prompt,
            systemPrompt: systemPrompt || undefined
          })
        })
        const text = await r.text()
        let data
        try {
          data = JSON.parse(text)
        } catch {
          data = { error: r.ok ? 'Server returned unexpected response' : `Server error ${r.status} — make sure the backend is running and restarted after updates` }
        }
        setResults(prev => ({ ...prev, [key]: data }))
      } catch (err) {
        if (err.name !== 'AbortError') {
          setResults(prev => ({ ...prev, [key]: { error: err.message, latencyMs: 0, model: m.model, backend: m.backend } }))
        }
      }
    })

    await Promise.allSettled(runs)
    setRunning(false)
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  const byBackend = ['claude', 'gemini', 'ollama'].map(b => ({
    backend: b,
    models: ALL_MODELS.filter(m => m.backend === b)
  }))

  const colCount = Math.max(1, Math.min(selectedModelObjects.length, 3))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">LLM Evaluator</h2>
        <p className="text-sm text-gray-500">Select models, write a prompt, and compare responses side by side.</p>
      </div>

      {/* Model Selection */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">Select Models</h3>
        <div className="space-y-4">
          {byBackend.map(({ backend, models }) => (
            <div key={backend}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {BACKEND_ICON[backend]} {BACKEND_LABEL[backend]}
              </div>
              <div className="flex flex-wrap gap-2">
                {models.map(m => {
                  const key = `${m.backend}/${m.model}`
                  const active = selectedModels.includes(key)
                  const colorActive = { blue: 'bg-blue-600 text-white border-blue-600', purple: 'bg-purple-600 text-white border-purple-600', amber: 'bg-amber-500 text-white border-amber-500' }
                  const colorInactive = 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                  return (
                    <button
                      key={key}
                      onClick={() => toggleModel(key)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${active ? colorActive[m.color] : colorInactive}`}
                    >
                      {m.label}
                      {m.tag && <span className={`ml-1.5 text-xs ${active ? 'opacity-80' : 'text-gray-400'}`}>· {m.tag}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {selectedModelObjects.length === 0 && (
          <p className="text-sm text-amber-600 mt-3">Select at least one model to run the evaluation.</p>
        )}
      </div>

      {/* Prompt Area */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Prompt</h3>
          <button
            onClick={() => setShowSystem(s => !s)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showSystem ? 'Hide system prompt' : 'Add system prompt'}
          </button>
        </div>

        {showSystem && (
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="System prompt (optional)..."
            className="w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-y focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
        )}

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Enter your prompt here..."
          className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />

        {/* MCP Detection Banner */}
        {mcpNeeded.length > 0 && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <span className="text-xl mt-0.5">🔌</span>
            <div>
              <p className="font-semibold text-amber-800">MCP tools may be needed</p>
              <p className="text-amber-700 mt-0.5">
                Your prompt appears to reference: <span className="font-mono font-semibold">{mcpNeeded.join(', ')}</span>.
                These are connected MCP servers from your Claude Desktop config.
                Claude supports MCP natively — other models will answer without tool access and may have limited or incorrect results.
              </p>
            </div>
          </div>
        )}

        {/* MCP Servers Info */}
        {Object.keys(mcpServers).length > 0 && (
          <div className="text-xs text-gray-400 flex flex-wrap gap-1 items-center">
            <span>Connected MCP servers:</span>
            {Object.keys(mcpServers).map(name => (
              <span key={name} className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">{name}</span>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleRun}
            disabled={running || !prompt.trim() || selectedModelObjects.length === 0}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            {running ? 'Running...' : `Run on ${selectedModelObjects.length} model${selectedModelObjects.length !== 1 ? 's' : ''}`}
          </button>
          {running && (
            <button
              onClick={handleStop}
              className="px-5 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 font-semibold rounded-lg transition-colors text-sm"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Results Grid */}
      {(running || Object.keys(results).length > 0) && selectedModelObjects.length > 0 && (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
        >
          {selectedModelObjects.map(m => {
            const key = `${m.backend}/${m.model}`
            return (
              <ResultCard
                key={key}
                model={m}
                result={results[key] ?? null}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

LLMEvaluator.propTypes = {
  password: PropTypes.string,
}
