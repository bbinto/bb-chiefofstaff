import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

function MCPStatus({ password, onBack }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedServers, setExpandedServers] = useState(new Set())

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
        <div className="flex items-center gap-3">
          <button
            onClick={checkMCPStatus}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
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
