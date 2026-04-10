import { useState, useEffect, useRef } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

function CheckPodcasts({ password }) {
  const [keywords, setKeywords] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
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

  // Default date range: last 30 days
  useEffect(() => {
    const today = new Date()
    const prior = new Date()
    prior.setDate(today.getDate() - 30)
    const fmt = (d) => d.toISOString().split('T')[0]
    setEndDate(fmt(today))
    setStartDate(fmt(prior))
  }, [])

  useEffect(() => {
    const fetchLlm = async () => {
      try {
        const headers = password ? { 'x-app-password': password } : {}
        const res = await fetch(`${API_URL}/api/settings/llm`, { headers })
        if (res.ok) {
          const s = await res.json()
          const icon = s.useOllama ? '🦙' : s.useGemini ? '💎' : '🔑'
          const model = s.useOllama ? s.ollamaModel : s.useGemini ? s.geminiModel : s.claudeModel
          setActiveLlm({ icon, model })
        }
      } catch (err) {
        console.error('Error fetching LLM settings:', err)
      }
    }
    fetchLlm()
  }, [password])

  const handleSubmit = async () => {
    if (!keywords.trim()) {
      alert('Please enter at least one keyword')
      return
    }
    if (!startDate || !endDate) {
      alert('Please select a date range')
      return
    }
    if (new Date(startDate) > new Date(endDate)) {
      alert('Start date must be before end date')
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

      setExecutionLogs([`Searching podcasts for keywords: "${keywords.trim()}"...`])

      const response = await fetch(`${API_URL}/api/run-agents`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agents: ['check-podcasts'],
          dateRange: { startDate, endDate },
          parameters: {
            prompt: keywords.trim()
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || 'Failed to start podcast check')
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
                  setExecutionLogs(prev => [...prev, '✓ Podcast check completed!'])
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
              setExecutionLogs(prev => [...prev, '✓ Podcast check completed! Report saved.'])
              setIsRunning(false)
              eventSource.close()
              clearInterval(fallbackPollInterval)
              setTimeout(() => window.location.reload(), 2000)
            } else if (data.status === 'failed') {
              setExecutionLogs(prev => [...prev, `✗ Podcast check failed (exit code ${data.exitCode})`])
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
          <h2 className="text-2xl font-bold text-[#00203F]">Check Podcasts</h2>
          <p className="text-sm text-gray-500 mt-1">
            Search your saved Spotify podcasts for episodes matching keywords in a date range.
          </p>
        </div>
        {activeLlm && (
          <span className="text-xs font-medium bg-[#00203F] text-white px-3 py-1.5 rounded-full">
            {activeLlm.icon} {activeLlm.model}
          </span>
        )}
      </div>

      {/* Keywords input */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <label className="block text-sm font-semibold text-gray-800">
          Keywords <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
          disabled={isRunning}
          placeholder='e.g. "AI, product strategy, founder stories"'
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
        />
        <p className="text-xs text-gray-500">
          Enter one or more comma-separated keywords. Episodes whose title or description match any keyword will be included.
        </p>
      </div>

      {/* Date range */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <label className="block text-sm font-semibold text-gray-800">
          Date Range <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              disabled={isRunning}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              disabled={isRunning}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-1">
          {[
            { label: 'Last 7 days', days: 7 },
            { label: 'Last 30 days', days: 30 },
            { label: 'Last 90 days', days: 90 },
          ].map(({ label, days }) => (
            <button
              key={days}
              onClick={() => {
                const today = new Date()
                const prior = new Date()
                prior.setDate(today.getDate() - days)
                const fmt = (d) => d.toISOString().split('T')[0]
                setStartDate(fmt(prior))
                setEndDate(fmt(today))
              }}
              disabled={isRunning}
              className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-600 border border-gray-200 transition-colors disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Spotify note */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
        <div>
          <p className="text-sm font-medium text-green-800">Spotify MCP</p>
          <p className="text-xs text-green-700 mt-0.5">
            This agent uses your Spotify account via the spotify-podcast MCP to read your saved shows and their episodes.
          </p>
        </div>
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
                  <span className="font-medium text-blue-900">Searching podcasts...</span>
                </>
              )}
              {executionStatus === 'completed' && (
                <>
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium text-green-900">Podcast check complete — report saved!</span>
                </>
              )}
              {(executionStatus === 'error' || executionStatus === 'failed') && (
                <>
                  <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium text-red-900">Podcast check failed</span>
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
          disabled={isRunning || !keywords.trim() || !startDate || !endDate}
          className="px-6 py-2.5 bg-gradient-to-r from-[#00203F] to-teal-600 text-white rounded-lg font-medium text-sm hover:from-teal-700 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? 'Searching...' : 'Search Podcasts'}
        </button>
      </div>
    </div>
  )
}

export default CheckPodcasts
