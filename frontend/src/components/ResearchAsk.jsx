import { useState, useEffect, useRef } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

function ResearchAsk({ password }) {
  const [query, setQuery] = useState('')
  const [mcpServers, setMcpServers] = useState([])
  const [selectedMcps, setSelectedMcps] = useState([])
  const [loadingServers, setLoadingServers] = useState(true)
  const [activeLlm, setActiveLlm] = useState(null)
  const [isRunning, setIsRunning] = useState(false)
  const [executionStatus, setExecutionStatus] = useState(null)
  const [executionLogs, setExecutionLogs] = useState([])
  const [detailedError, setDetailedError] = useState(null)
  const logsEndRef = useRef(null)

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [executionLogs])

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const headers = password ? { 'x-app-password': password } : {}
        const [serversRes, llmRes] = await Promise.all([
          fetch(`${API_URL}/api/mcp-servers`, { headers }),
          fetch(`${API_URL}/api/settings/llm`, { headers })
        ])
        if (serversRes.ok) {
          const data = await serversRes.json()
          setMcpServers(data.servers || [])
        }
        if (llmRes.ok) {
          const s = await llmRes.json()
          const icon = s.useOllama ? '🦙' : s.useGemini ? '💎' : '🔑'
          const model = s.useOllama ? s.ollamaModel : s.useGemini ? s.geminiModel : s.claudeModel
          setActiveLlm({ icon, model })
        }
      } catch (err) {
        console.error('Error fetching MCP servers:', err)
      } finally {
        setLoadingServers(false)
      }
    }
    fetchServers()
  }, [password])

  const toggleMcp = (name) => {
    setSelectedMcps(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    )
  }

  const toggleAll = () => {
    setSelectedMcps(prev =>
      prev.length === mcpServers.length ? [] : mcpServers.map(s => s.name)
    )
  }

  const handleSubmit = async () => {
    if (!query.trim()) {
      alert('Please enter a query or keywords')
      return
    }
    if (selectedMcps.length === 0) {
      alert('Please select at least one MCP source')
      return
    }

    setIsRunning(true)
    setExecutionStatus('running')
    setExecutionLogs([])
    setDetailedError(null)

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(password ? { 'x-app-password': password } : {})
      }

      setExecutionLogs([`Starting research for: "${query.trim()}"...`])

      const response = await fetch(`${API_URL}/api/run-agents`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agents: ['research-ask'],
          parameters: {
            prompt: query.trim(),
            mcps: selectedMcps.join(',')
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || 'Failed to start research')
      }

      const result = await response.json()
      setExecutionLogs(prev => [...prev, `Process started with PID: ${result.pid}`])

      const streamUrl = password
        ? `${API_URL}/api/execution/${result.executionId}/stream?password=${encodeURIComponent(password)}`
        : `${API_URL}/api/execution/${result.executionId}/stream`

      let eventSource = null
      let fallbackPollInterval = null

      const startFallbackPolling = () => {
        setExecutionLogs(prev => [...prev, '[Using polling fallback for logs]'])
        fallbackPollInterval = setInterval(async () => {
          try {
            const r = await fetch(`${API_URL}/api/execution/${result.executionId}`, {
              headers: password ? { 'x-app-password': password } : {}
            })
            if (r.ok) {
              const execution = await r.json()
              if (execution.logs) {
                const newLogs = execution.logs.slice(executionLogs.length - 1)
                newLogs.forEach(log => {
                  if (log.type === 'stdout' || log.type === 'stderr') {
                    const lines = (log.message?.trim() || '').split('\n')
                    setExecutionLogs(prev => [...prev, ...lines.filter(l => l.trim())])
                  }
                })
              }
              if (execution.status !== 'running') {
                clearInterval(fallbackPollInterval)
                setExecutionStatus(execution.status)
                if (execution.status === 'completed') {
                  setExecutionLogs(prev => [...prev, '✓ Research completed!'])
                  setIsRunning(false)
                  setTimeout(() => window.location.reload(), 2000)
                }
              }
            }
          } catch (err) {
            console.error('Fallback poll error:', err)
          }
        }, 2000)
      }

      eventSource = new EventSource(streamUrl)

      eventSource.onopen = () => {
        setExecutionLogs(prev => [...prev, '[Connected to real-time log stream]'])
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'status') {
            setExecutionStatus(data.status)
            if (data.status === 'completed') {
              setExecutionLogs(prev => [...prev, '✓ Research completed! Report saved.'])
              setIsRunning(false)
              eventSource.close()
              clearInterval(fallbackPollInterval)
              setTimeout(() => window.location.reload(), 2000)
            } else if (data.status === 'failed') {
              setExecutionLogs(prev => [...prev, `✗ Research failed (exit code ${data.exitCode})`])
              setIsRunning(false)
              eventSource.close()
              clearInterval(fallbackPollInterval)
            }
          } else if (data.type === 'stdout' || data.type === 'stderr') {
            const message = data.message?.trim() || ''
            if (message) {
              setExecutionLogs(prev => [...prev, ...message.split('\n').filter(l => l.trim())])
            }
          } else if (data.type === 'error') {
            const lines = data.message?.split('\n').filter(l => l.trim()) || []
            setExecutionLogs(prev => [...prev, ...lines.map(l => `ERROR: ${l}`)])
            setDetailedError(data.message)
          }
        } catch (err) {
          console.error('Error parsing SSE data:', err)
        }
      }

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource.close()
          startFallbackPolling()
        }
      }
    } catch (error) {
      setExecutionStatus('error')
      setDetailedError(error.message)
      setExecutionLogs(prev => [...prev, `Error: ${error.message}`])
      setIsRunning(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#00203F]">Research & Ask</h2>
          <p className="text-sm text-gray-500 mt-1">
            Enter a question or comma-separated keywords, pick your data sources, and get a report.
          </p>
        </div>
        {activeLlm && (
          <span className="text-xs font-medium bg-[#00203F] text-white px-3 py-1.5 rounded-full">
            {activeLlm.icon} {activeLlm.model}
          </span>
        )}
      </div>

      {/* Query input */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <label className="block text-sm font-semibold text-gray-800">
          Query / Keywords <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={3}
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={isRunning}
          placeholder='e.g. "What did the team ship last sprint?" or "OKR progress, Q1, product"'
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none disabled:opacity-50"
        />
      </div>

      {/* MCP selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold text-gray-800">
            Data Sources (MCP Servers) <span className="text-red-500">*</span>
          </label>
          <button
            onClick={toggleAll}
            disabled={isRunning || loadingServers}
            className="text-xs text-teal-700 hover:text-teal-900 font-medium disabled:opacity-40"
          >
            {selectedMcps.length === mcpServers.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {loadingServers ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-teal-300 border-t-teal-600" />
            Loading MCP servers...
          </div>
        ) : mcpServers.length === 0 ? (
          <p className="text-sm text-red-500">No MCP servers found in Claude Desktop config.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
            {mcpServers.map(server => (
              <label
                key={server.name}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer text-sm transition-all ${
                  selectedMcps.includes(server.name)
                    ? 'border-teal-500 bg-teal-50 text-teal-900 font-medium'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-teal-300'
                } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedMcps.includes(server.name)}
                  onChange={() => toggleMcp(server.name)}
                  disabled={isRunning}
                  className="w-3.5 h-3.5 text-teal-600 rounded"
                />
                <span className="truncate">{server.name}</span>
              </label>
            ))}
          </div>
        )}

        {selectedMcps.length > 0 && (
          <p className="text-xs text-gray-500">
            {selectedMcps.length} source{selectedMcps.length !== 1 ? 's' : ''} selected: {selectedMcps.join(', ')}
          </p>
        )}
      </div>

      {/* Execution status + logs */}
      {executionStatus && (
        <div className="space-y-3">
          <div className={`p-4 rounded-lg border ${
            executionStatus === 'running' ? 'bg-blue-50 border-blue-200' :
            executionStatus === 'completed' ? 'bg-green-50 border-green-200' :
            'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {executionStatus === 'running' && (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
                  <span className="font-medium text-blue-900">Researching...</span>
                </>
              )}
              {executionStatus === 'completed' && (
                <>
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium text-green-900">Research complete — report saved!</span>
                </>
              )}
              {(executionStatus === 'error' || executionStatus === 'failed') && (
                <>
                  <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium text-red-900">Research failed</span>
                </>
              )}
            </div>
            {detailedError && (
              <div className="mt-2 text-sm text-red-700 bg-red-100 p-2 rounded border border-red-300">
                <strong>Error:</strong> {detailedError}
              </div>
            )}
          </div>

          {executionLogs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 max-h-96 overflow-y-auto">
              {executionLogs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap break-words">{log}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={isRunning || !query.trim() || selectedMcps.length === 0}
          className="px-6 py-2.5 bg-gradient-to-r from-[#00203F] to-teal-600 text-white rounded-lg font-medium text-sm hover:from-teal-700 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? 'Researching...' : 'Run Research'}
        </button>
      </div>
    </div>
  )
}

export default ResearchAsk
