import { useState, useEffect, useRef } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

const WORKSPACES = [
  {
    id: 'all',
    label: 'All Workspaces',
    description: 'Scan Lenny\'s, Rand, and WiP communities',
    icon: '🌐',
    focus: 'Product strategy · Leadership · Women in tech'
  },
  {
    id: 'lennys',
    label: 'Lenny\'s Slack',
    description: 'New frameworks and articles about product strategy',
    icon: '📦',
    focus: 'Product frameworks · PM strategy · Discovery'
  },
  {
    id: 'rand',
    label: 'Rand\'s Community',
    description: 'Leadership tips and SaaS Product Director insights',
    icon: '🎯',
    focus: 'SaaS leadership · GTM · Audience research'
  },
  {
    id: 'wip',
    label: 'WiP (Women in Product)',
    description: 'Women leadership and career advancement topics',
    icon: '💪',
    focus: 'Women leadership · Executive presence · DEI'
  }
]

const DAY_OPTIONS = [
  { value: 3, label: 'Last 3 days' },
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' }
]

function SlackCommunityDigest({ password, onBack }) {
  const [selectedWorkspace, setSelectedWorkspace] = useState('all')
  const [dayOption, setDayOption] = useState(7)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
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

  const getDateRange = () => {
    if (dayOption === 'custom') {
      return { startDate: customStartDate, endDate: customEndDate }
    }
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - dayOption)
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    }
  }

  const handleRun = async () => {
    if (dayOption === 'custom' && (!customStartDate || !customEndDate)) {
      alert('Please set both start and end dates for the custom range')
      return
    }

    setIsRunning(true)
    setExecutionStatus('running')
    setExecutionLogs([])
    setDetailedError(null)

    const dateRange = getDateRange()
    const workspace = WORKSPACES.find(w => w.id === selectedWorkspace)

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(password ? { 'x-app-password': password } : {})
      }

      setExecutionLogs([`Starting Slack Community Digest for: ${workspace.label}...`])

      const response = await fetch(`${API_URL}/api/run-agents`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agents: ['slack-community-digest'],
          dateRange,
          parameters: {
            slackWorkspace: selectedWorkspace
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || 'Failed to start digest')
      }

      const result = await response.json()
      setExecutionLogs(prev => [...prev, `Process started (PID: ${result.pid})`])

      const streamUrl = password
        ? `${API_URL}/api/execution/${result.executionId}/stream?password=${encodeURIComponent(password)}`
        : `${API_URL}/api/execution/${result.executionId}/stream`

      let eventSource = null

      const connectSSE = () => {
        try {
          eventSource = new EventSource(streamUrl)

          eventSource.onopen = () => {
            setExecutionLogs(prev => [...prev, '[Connected to live stream]'])
          }

          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)

              if (data.type === 'status') {
                setExecutionStatus(data.status)
                if (data.status === 'completed') {
                  setExecutionLogs(prev => [...prev, '✓ Digest completed! Reloading reports...'])
                  setIsRunning(false)
                  eventSource.close()
                  setTimeout(() => window.location.reload(), 2000)
                } else if (data.status === 'failed') {
                  setExecutionLogs(prev => [...prev, `✗ Failed (exit code ${data.exitCode})`])
                  setIsRunning(false)
                  eventSource.close()
                }
              } else if (data.type === 'stdout' || data.type === 'stderr') {
                const message = data.message?.trim() || ''
                if (message) {
                  const lines = message.split('\n')
                  setExecutionLogs(prev => [...prev, ...lines.filter(l => l.trim())])
                }
              } else if (data.type === 'error') {
                const errorLines = data.message?.split('\n').filter(l => l.trim()) || []
                setExecutionLogs(prev => [...prev, ...errorLines.map(l => `ERROR: ${l}`)])
                setDetailedError(data.message)
              }
            } catch (err) {
              console.error('SSE parse error:', err)
            }
          }

          eventSource.onerror = () => {
            if (eventSource.readyState === EventSource.CLOSED) {
              eventSource.close()
              // Fallback polling
              startPolling(result.executionId)
            }
          }
        } catch (err) {
          console.error('SSE connect error:', err)
          startPolling(result.executionId)
        }
      }

      const startPolling = (executionId) => {
        setExecutionLogs(prev => [...prev, '[Using polling fallback]'])
        const interval = setInterval(async () => {
          try {
            const headers = password ? { 'x-app-password': password } : {}
            const res = await fetch(`${API_URL}/api/execution/${executionId}`, { headers })
            if (res.ok) {
              const exec = await res.json()
              if (exec.status !== 'running') {
                clearInterval(interval)
                setExecutionStatus(exec.status)
                if (exec.status === 'completed') {
                  setExecutionLogs(prev => [...prev, '✓ Digest completed!'])
                  setIsRunning(false)
                  setTimeout(() => window.location.reload(), 2000)
                }
              }
            }
          } catch (err) {
            console.error('Poll error:', err)
          }
        }, 2000)
      }

      connectSSE()

    } catch (error) {
      console.error('Error running digest:', error)
      setExecutionStatus('error')
      setDetailedError(error.message)
      setExecutionLogs(prev => [...prev, `Error: ${error.message}`])
      setIsRunning(false)
    }
  }

  const selectedWs = WORKSPACES.find(w => w.id === selectedWorkspace)
  const dateRange = getDateRange()

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Slack Community Digest</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Surface high-engagement threads and shared links from external Slack communities
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Workspace Selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Workspace
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {WORKSPACES.map(ws => (
              <button
                key={ws.id}
                onClick={() => !isRunning && setSelectedWorkspace(ws.id)}
                disabled={isRunning}
                className={`text-left p-4 rounded-lg border-2 transition-all ${
                  selectedWorkspace === ws.id
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-teal-300 bg-white'
                } ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{ws.icon}</span>
                  <span className="font-semibold text-gray-900 text-sm">{ws.label}</span>
                  {selectedWorkspace === ws.id && (
                    <svg className="w-4 h-4 text-teal-600 ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-1">{ws.description}</p>
                <p className="text-xs text-teal-600 font-medium">{ws.focus}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Date Range
          </h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {DAY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => !isRunning && setDayOption(opt.value)}
                disabled={isRunning}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                  dayOption === opt.value
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-teal-400'
                } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {dayOption === 'custom' && (
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                />
              </div>
            </div>
          )}
          {dayOption !== 'custom' && (
            <p className="text-xs text-gray-500 mt-2">
              Will scan from <span className="font-medium text-gray-700">{dateRange.startDate}</span> to <span className="font-medium text-gray-700">{dateRange.endDate}</span>
            </p>
          )}
        </div>

        {/* Criteria Summary */}
        <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl border border-teal-200 p-5">
          <h3 className="text-sm font-semibold text-teal-800 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            What the agent will look for
          </h3>
          <div className="space-y-2 text-xs text-teal-700">
            {(selectedWorkspace === 'all' ? WORKSPACES.slice(1) : [selectedWs]).map(ws => (
              <div key={ws.id} className="flex items-start gap-2">
                <span>{ws.icon}</span>
                <div>
                  <span className="font-semibold">{ws.label}:</span> {ws.description}
                  <span className="text-teal-500"> — min. 3 replies or 5 reactions</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Execution Log */}
        {executionStatus && (
          <div className="space-y-3">
            <div className={`p-4 rounded-lg ${
              executionStatus === 'running' ? 'bg-blue-50 border border-blue-200' :
              executionStatus === 'completed' ? 'bg-green-50 border border-green-200' :
              'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-center gap-2">
                {executionStatus === 'running' && (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
                    <span className="font-medium text-blue-900">Running digest...</span>
                  </>
                )}
                {executionStatus === 'completed' && (
                  <>
                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium text-green-900">Digest completed!</span>
                  </>
                )}
                {(executionStatus === 'error' || executionStatus === 'failed') && (
                  <>
                    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium text-red-900">Digest failed</span>
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
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 max-h-64 overflow-y-auto">
                <div className="space-y-1">
                  {executionLogs.map((log, i) => (
                    <div key={i} className="whitespace-pre-wrap break-words">{log}</div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Run Button */}
        <div className="flex justify-end">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#00203F] to-teal-600 text-white rounded-xl font-semibold hover:from-teal-700 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {isRunning ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Running...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Run Digest for {selectedWs?.label}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SlackCommunityDigest
