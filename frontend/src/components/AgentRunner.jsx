import { useState, useEffect, useRef } from 'react'

// Get API URL from environment variable, fallback to relative URL (uses proxy)
const API_URL = import.meta.env.VITE_API_URL || ''

function AgentRunner({ password, onClose }) {
  const [agents, setAgents] = useState([
    { name: 'prep-for-week', displayName: 'Prep for the Week', description: 'Prepare for upcoming week with todos, calendar, and 1-1 notes', lastRun: null },
    { name: 'weekly-recap', displayName: 'Weekly Recap', description: 'Weekly team catch-up and recap', lastRun: null },
    { name: 'business-health', displayName: 'Business Health', description: 'Officevibe business and product health', requiresParam: 'manualSourcesFolder', lastRun: null },
    { name: 'product-engineering', displayName: 'Product Engineering', description: 'Product development and engineering updates', lastRun: null },
    { name: 'telemetry-deepdive', displayName: 'Telemetry Deep Dive', description: 'Deep dive into telemetry data', requiresParam: 'folder', lastRun: null },
    { name: 'team-pulse', displayName: 'Team Pulse', description: 'Team engagement and pulse survey analysis', lastRun: null },
    { name: 'pingboard-migration', displayName: 'Pingboard Migration', description: 'Pingboard migration status', lastRun: null },
    { name: 'jira-tracker', displayName: 'Jira Tracker', description: 'Track Jira issues and progress', lastRun: null },
    { name: 'okr-progress', displayName: 'OKR Progress', description: 'OKR updates and progress tracking', lastRun: null },
    { name: 'productivity-weekly-tracker', displayName: 'Productivity Tracker', description: 'Weekly productivity tracking', lastRun: null },
    { name: 'quarterly-review', displayName: 'Quarterly Review', description: 'Quarterly review of product releases and OKR updates', lastRun: null },
    { name: 'quarterly-performance-review', displayName: 'Quarterly Performance Review', description: 'Quarterly performance review for Director of Product', lastRun: null },
    { name: 'performance-review-q3', displayName: 'Q3 Performance Review (WL)', description: 'Generate Q3 performance review using Workleap questionnaire format', requiresParam: 'email', lastRun: null },
    { name: 'thoughtleadership-updates', displayName: 'Thought Leadership', description: 'Product thought leadership and new topics', lastRun: null },
    { name: 'officevibe-strategy-roadmap', displayName: 'Officevibe Strategy Roadmap', description: 'Strategy roadmap for Officevibe', lastRun: null },
    { name: 'slack-user-analysis', displayName: 'Slack User Analysis', description: 'Analyze a Slack user\'s contributions', requiresParam: 'slackUserId', lastRun: null },
    { name: '1-1', displayName: '1-1 Prep', description: 'Prepare for a 1-1 meeting', requiresParam: 'email', lastRun: null },
    { name: 'weekly-executive-summary', displayName: 'Weekly Executive Summary', description: 'Generate executive summary from all reports', requiresParam: 'week', lastRun: null },
    { name: 'good-vibes-recognition', displayName: 'Recognition Recommendations', description: 'Suggests recognitions for team members', lastRun: null }
     
  ])

  const [selectedAgents, setSelectedAgents] = useState([])
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  })
  const [parameters, setParameters] = useState({
    slackUserId: '',
    manualSourcesFolder: '',
    folder: '',
    email: '',
    week: ''
  })
  const [isRunning, setIsRunning] = useState(false)
  const [executionStatus, setExecutionStatus] = useState(null)
  const [executionLogs, setExecutionLogs] = useState([])
  const [executionId, setExecutionId] = useState(null)
  const [detailedError, setDetailedError] = useState(null)
  const logsEndRef = useRef(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [executionLogs])

  // Fetch last run timestamps for each agent
  useEffect(() => {
    const fetchLastRunTimes = async () => {
      try {
        const headers = password ? { 'x-app-password': password } : {}
        const response = await fetch(`${API_URL}/api/reports`, { headers })

        if (!response.ok) return

        const reports = await response.json()

        // Find the most recent report for each agent
        const lastRunMap = {}
        reports.forEach(report => {
          const agentName = report.agentName
          if (!lastRunMap[agentName] || new Date(report.timestamp) > new Date(lastRunMap[agentName])) {
            lastRunMap[agentName] = report.timestamp
          }
        })

        // Update agents with last run times
        setAgents(prevAgents =>
          prevAgents.map(agent => ({
            ...agent,
            lastRun: lastRunMap[agent.name] || null
          }))
        )
      } catch (error) {
        console.error('Error fetching last run times:', error)
      }
    }

    fetchLastRunTimes()
  }, [password])

  // Format relative time (e.g., "2 hours ago", "3 days ago")
  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Never'

    const now = new Date()
    const past = new Date(timestamp)
    const diffMs = now - past
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return `${Math.floor(diffDays / 365)}y ago`
  }

  const handleAgentToggle = (agentName) => {
    setSelectedAgents(prev => {
      if (prev.includes(agentName)) {
        return prev.filter(a => a !== agentName)
      } else {
        return [...prev, agentName]
      }
    })
  }

  const handleSelectAll = () => {
    if (selectedAgents.length === agents.length) {
      setSelectedAgents([])
    } else {
      setSelectedAgents(agents.map(a => a.name))
    }
  }

  const handleParameterChange = (paramName, value) => {
    setParameters(prev => ({
      ...prev,
      [paramName]: value
    }))
  }

  const handleRunAgents = async () => {
    if (selectedAgents.length === 0) {
      alert('Please select at least one agent to run')
      return
    }

    // Validate required parameters
    const selectedAgentConfigs = agents.filter(a => selectedAgents.includes(a.name))
    for (const agent of selectedAgentConfigs) {
      if (agent.requiresParam && !parameters[agent.requiresParam]) {
        alert(`${agent.displayName} requires a ${agent.requiresParam} parameter`)
        return
      }
    }

    setIsRunning(true)
    setExecutionStatus('running')
    setExecutionLogs([])
    setDetailedError(null)

    try {
      const headers = password ? { 'x-app-password': password } : {}

      const requestBody = {
        agents: selectedAgents,
        dateRange: dateRange.startDate || dateRange.endDate ? dateRange : null,
        parameters
      }

      setExecutionLogs(prev => [...prev, `Starting execution of ${selectedAgents.length} agent(s)...`])

      const response = await fetch(`${API_URL}/api/run-agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || 'Failed to start agent execution')
      }

      const result = await response.json()
      setExecutionId(result.executionId)
      setExecutionLogs(prev => [...prev, `Process started with PID: ${result.pid}`])

      // Connect to Server-Sent Events stream for real-time logs
      const eventSource = new EventSource(`${API_URL}/api/execution/${result.executionId}/stream`)

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'status') {
            setExecutionStatus(data.status)
            if (data.status === 'completed') {
              setExecutionLogs(prev => [...prev, '✓ Execution completed successfully!'])
              setIsRunning(false)
              eventSource.close()
              // Reload reports after completion
              setTimeout(() => {
                window.location.reload()
              }, 2000)
            } else if (data.status === 'failed') {
              setExecutionLogs(prev => [...prev, `✗ Execution failed with exit code ${data.exitCode}`])
              setIsRunning(false)
              eventSource.close()
            }
          } else if (data.type === 'stdout' || data.type === 'stderr') {
            // Filter out empty lines and add log
            const message = data.message.trim()
            if (message) {
              setExecutionLogs(prev => [...prev, message])
            }
          } else if (data.type === 'error') {
            setExecutionLogs(prev => [...prev, `ERROR: ${data.message}`])
            setDetailedError(data.message)
          }
        } catch (err) {
          console.error('Error parsing SSE data:', err)
        }
      }

      eventSource.onerror = (error) => {
        console.error('SSE Error:', error)
        eventSource.close()
        // Don't set error status here - the stream might just be ending normally
      }

    } catch (error) {
      console.error('Error running agents:', error)
      setExecutionStatus('error')
      setDetailedError(error.message)
      setExecutionLogs(prev => [...prev, `Error: ${error.message}`])
      setIsRunning(false)
    }
  }

  // Get agents that require parameters
  const selectedAgentsRequiringParams = agents.filter(
    a => selectedAgents.includes(a.name) && a.requiresParam
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#00203F] via-teal-700 to-teal-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Run Agent Reports</h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            disabled={isRunning}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Agent Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Select Agents</h3>
              <button
                onClick={handleSelectAll}
                className="text-sm text-[#00203F] hover:text-teal-700 font-medium"
                disabled={isRunning}
              >
                {selectedAgents.length === agents.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {agents.map(agent => (
                <label
                  key={agent.name}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedAgents.includes(agent.name)
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-teal-300 bg-white'
                  } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedAgents.includes(agent.name)}
                    onChange={() => handleAgentToggle(agent.name)}
                    disabled={isRunning}
                    className="mt-1 w-4 h-4 text-[#00203F] rounded focus:ring-teal-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-gray-900 text-sm">
                        {agent.displayName}
                        {agent.requiresParam && (
                          <span className="ml-2 text-xs text-orange-600 font-normal">*</span>
                        )}
                      </div>
                      <div className={`text-xs font-medium ${
                        agent.lastRun ? 'text-gray-500' : 'text-gray-400 italic'
                      }`}>
                        {formatRelativeTime(agent.lastRun)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{agent.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Date Range (Optional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Parameters */}
          {selectedAgentsRequiringParams.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Required Parameters
                <span className="text-sm font-normal text-gray-500 ml-2">
                  (for selected agents marked with *)
                </span>
              </h3>
              <div className="space-y-4">
                {selectedAgentsRequiringParams.map(agent => (
                  <div key={agent.requiresParam} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      {agent.requiresParam === 'slackUserId' && 'Slack User ID'}
                      {agent.requiresParam === 'manualSourcesFolder' && 'Manual Sources Folder'}
                      {agent.requiresParam === 'folder' && 'Folder'}
                      {agent.requiresParam === 'email' && 'Email'}
                      {agent.requiresParam === 'week' && 'Week'}
                      <span className="text-orange-600 ml-1">*</span>
                    </label>
                    <div className="text-xs text-gray-600 mb-2">
                      Required for: {agent.displayName}
                    </div>
                    <input
                      type="text"
                      value={parameters[agent.requiresParam]}
                      onChange={(e) => handleParameterChange(agent.requiresParam, e.target.value)}
                      disabled={isRunning}
                      placeholder={
                        agent.requiresParam === 'slackUserId' ? 'e.g., U01234567AB' :
                        agent.requiresParam === 'manualSourcesFolder' ? 'e.g., Week 1' :
                        agent.requiresParam === 'folder' ? 'e.g., week1' :
                        agent.requiresParam === 'email' ? 'e.g., user@example.com' :
                        agent.requiresParam === 'week' ? 'e.g., week 1 or week 1 2025' :
                        ''
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution Status */}
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
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
                      <span className="font-medium text-blue-900">Executing agents...</span>
                    </>
                  )}
                  {executionStatus === 'completed' && (
                    <>
                      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="font-medium text-green-900">Execution completed!</span>
                    </>
                  )}
                  {(executionStatus === 'error' || executionStatus === 'failed') && (
                    <>
                      <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span className="font-medium text-red-900">Execution failed</span>
                    </>
                  )}
                </div>
                {detailedError && (
                  <div className="mt-2 text-sm text-red-700 bg-red-100 p-2 rounded border border-red-300">
                    <strong>Error Details:</strong> {detailedError}
                  </div>
                )}
              </div>

              {/* Console-like log viewer */}
              {executionLogs.length > 0 && (
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 max-h-96 overflow-y-auto">
                  <div className="space-y-1">
                    {executionLogs.map((log, index) => (
                      <div key={index} className="whitespace-pre-wrap break-words">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isRunning}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleRunAgents}
              disabled={isRunning || selectedAgents.length === 0}
              className="px-6 py-2 bg-gradient-to-r from-[#00203F] to-teal-600 text-white rounded-lg hover:from-teal-700 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isRunning ? 'Running...' : 'Run Selected Agents'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgentRunner
