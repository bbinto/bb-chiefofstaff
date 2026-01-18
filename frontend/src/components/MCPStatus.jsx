import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

function MCPStatus({ password, onBack }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedServers, setExpandedServers] = useState(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const [actionMessage, setActionMessage] = useState(null)

  const checkMCPStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      const headers = password ? { 'x-app-password': password } : {}
      const response = await fetch(`${API_URL}/api/mcp-status`, { headers })

      if (response.status === 401) {
        throw new Error('Authentication failed')
      }

      if (!response.ok) throw new Error('Failed to fetch MCP status')

      const data = await response.json()
      setStatus(data)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching MCP status:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleServerExpansion = (serverName) => {
    setExpandedServers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(serverName)) {
        newSet.delete(serverName)
      } else {
        newSet.add(serverName)
      }
      return newSet
    })
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    setActionMessage(null)
    setError(null)

    try {
      const headers = password ? { 'x-app-password': password } : {}
      const response = await fetch(`${API_URL}/api/mcp-refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      })

      if (response.status === 401) {
        throw new Error('Authentication failed')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || 'Failed to refresh MCP connections')
      }

      const data = await response.json()
      setActionMessage({
        type: 'success',
        message: `✓ ${data.message}. Connected to ${data.connectedServers} server(s) with ${data.availableTools} tools.`
      })

      // Refresh status after successful refresh
      setTimeout(() => {
        checkMCPStatus()
      }, 1000)
    } catch (err) {
      setError(err.message)
      setActionMessage({
        type: 'error',
        message: `✗ Error: ${err.message}`
      })
    } finally {
      setRefreshing(false)
    }
  }

  const handleClearCache = async () => {
    if (!confirm('Clear Slack MCP cache? This will force refetch of channels and users on next connection.')) {
      return
    }

    setClearingCache(true)
    setActionMessage(null)
    setError(null)

    try {
      const headers = password ? { 'x-app-password': password } : {}
      const response = await fetch(`${API_URL}/api/mcp-clear-cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      })

      if (response.status === 401) {
        throw new Error('Authentication failed')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || 'Failed to clear cache')
      }

      const data = await response.json()
      setActionMessage({
        type: 'success',
        message: `✓ ${data.message}${data.clearedFiles && data.clearedFiles.length > 0 ? ` (${data.clearedFiles.join(', ')})` : ''}.`
      })
    } catch (err) {
      setError(err.message)
      setActionMessage({
        type: 'error',
        message: `✗ Error: ${err.message}`
      })
    } finally {
      setClearingCache(false)
    }
  }

  const handleFullRefresh = async () => {
    if (!confirm('Clear cache and refresh all MCP connections? This will force refetch of Slack channels/users and reconnect all servers.')) {
      return
    }

    // First clear cache
    setClearingCache(true)
    setRefreshing(false)
    setActionMessage(null)
    setError(null)

    try {
      const headers = password ? { 'x-app-password': password } : {}

      // Step 1: Clear cache
      const clearResponse = await fetch(`${API_URL}/api/mcp-clear-cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      })

      if (!clearResponse.ok) {
        const errorData = await clearResponse.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || 'Failed to clear cache')
      }

      const clearData = await clearResponse.json()
      setActionMessage({
        type: 'success',
        message: `✓ Cache cleared. Refreshing connections...`
      })

      // Step 2: Refresh connections
      setClearingCache(false)
      setRefreshing(true)

      const refreshResponse = await fetch(`${API_URL}/api/mcp-refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      })

      if (refreshResponse.status === 401) {
        throw new Error('Authentication failed')
      }

      if (!refreshResponse.ok) {
        const errorData = await refreshResponse.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || 'Failed to refresh connections')
      }

      const refreshData = await refreshResponse.json()
      setActionMessage({
        type: 'success',
        message: `✓ Full refresh complete! Connected to ${refreshData.connectedServers} server(s) with ${refreshData.availableTools} tools.`
      })

      // Refresh status after successful refresh
      setTimeout(() => {
        checkMCPStatus()
      }, 1000)
    } catch (err) {
      setError(err.message)
      setActionMessage({
        type: 'error',
        message: `✗ Error: ${err.message}`
      })
    } finally {
      setClearingCache(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    checkMCPStatus()
  }, [password])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[#00203F]">MCP Connection Status</h2>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-[#00203F] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
        </div>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-200 border-t-[#00203F] mx-auto"></div>
          <p className="mt-4 text-[#00203F] font-medium">Checking MCP connections...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[#00203F]">MCP Connection Status</h2>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-[#00203F] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
        </div>
        <div className="text-center bg-red-50 rounded-xl p-8 border border-red-200">
          <div className="text-red-600 text-2xl mb-4">⚠️ Error</div>
          <p className="text-gray-700 font-medium">{error}</p>
          <button
            onClick={checkMCPStatus}
            className="mt-4 px-4 py-2 bg-[#00203F] text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#00203F]">MCP Connection Status</h2>
          <p className="text-sm text-gray-500 mt-1">
            Last checked: {status?.timestamp ? new Date(status.timestamp).toLocaleString() : 'Never'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleFullRefresh}
            disabled={loading || refreshing || clearingCache}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00203F] to-teal-700 text-white rounded-lg hover:from-teal-700 hover:to-teal-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            title="Clear Slack cache and refresh all MCP connections"
          >
            {(refreshing || clearingCache) ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Full Refresh
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading || refreshing || clearingCache}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh MCP connections"
          >
            {refreshing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Refresh
          </button>
          <button
            onClick={handleClearCache}
            disabled={loading || refreshing || clearingCache}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Clear Slack MCP cache files (channels and users)"
          >
            {clearingCache ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
            Clear Cache
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-[#00203F] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
        </div>
      </div>

      {/* Action Messages */}
      {actionMessage && (
        <div className={`mb-6 p-4 rounded-lg border ${
          actionMessage.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            <span className="font-medium">{actionMessage.message}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="ml-auto text-gray-500 hover:text-gray-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-6 border border-teal-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-teal-700 font-medium mb-1">Total Servers</p>
              <p className="text-3xl font-bold text-[#00203F]">{status?.totalServers || 0}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700 font-medium mb-1">Connected</p>
              <p className="text-3xl font-bold text-[#00203F]">{status?.connectedServers || 0}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-lg p-6 border border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-700 font-medium mb-1">Failed</p>
              <p className="text-3xl font-bold text-[#00203F]">{status?.failedServers || 0}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Server List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-[#00203F] mb-4">Server Details</h3>
        {status?.servers && status.servers.length > 0 ? (
          status.servers.map((server, index) => {
            const isExpanded = expandedServers.has(server.name)
            return (
              <div
                key={index}
                className={`rounded-lg border ${
                  server.connected
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${
                          server.connected ? 'bg-green-500' : 'bg-red-500'
                        }`}></div>
                        <h4 className="font-semibold text-[#00203F]">{server.name}</h4>
                        {server.connected && (
                          <button
                            onClick={() => toggleServerExpansion(server.name)}
                            className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium rounded-full transition-colors flex items-center gap-1"
                          >
                            {server.toolCount} tools
                            <svg
                              className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="ml-6 space-y-1">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Command:</span> {server.config.command}
                        </p>
                        {server.config.args && server.config.args.length > 0 && (
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Args:</span> {server.config.args.join(' ')}
                          </p>
                        )}
                        {server.error && (
                          <div className="mt-2 p-2 bg-red-100 rounded text-sm text-red-700">
                            <span className="font-medium">Error:</span> {server.error}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {server.connected ? (
                        <span className="text-green-600 font-medium text-sm">Connected</span>
                      ) : (
                        <span className="text-red-600 font-medium text-sm">Disconnected</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expandable Tools List */}
                {server.connected && isExpanded && server.tools && server.tools.length > 0 && (
                  <div className="border-t border-green-200 bg-white/50 p-4">
                    <h5 className="text-sm font-semibold text-[#00203F] mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      Available Tools ({server.tools.length})
                    </h5>
                    <div className="space-y-2">
                      {server.tools.map((tool, toolIndex) => (
                        <div
                          key={toolIndex}
                          className="p-3 bg-white rounded border border-gray-200 hover:border-teal-300 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0"></div>
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-sm font-medium text-[#00203F] break-all">
                                {tool.name}
                              </p>
                              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                {tool.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="text-center py-8 text-gray-500">
            No MCP servers configured
          </div>
        )}
      </div>
    </div>
  )
}

export default MCPStatus
