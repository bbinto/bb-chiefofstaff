import { useState, useEffect } from 'react'

function Analytics({ password, onBack }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [timeRange, setTimeRange] = useState('all') // all, 7d, 30d, 90d

  useEffect(() => {
    console.log('Analytics component mounted')
    fetchReports()
  }, [password])

  const fetchReports = async () => {
    try {
      console.log('Analytics: Fetching reports...')
      setLoading(true)
      const headers = password ? { 'x-app-password': password } : {}
      const response = await fetch('http://localhost:3001/api/reports', { headers })

      console.log('Analytics: Response status:', response.status)
      if (!response.ok) throw new Error('Failed to fetch reports')

      const data = await response.json()
      console.log('Analytics: Fetched', data.length, 'reports')
      setReports(data)
      setError(null)
    } catch (err) {
      console.error('Analytics: Error fetching reports:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Filter reports by time range
  const getFilteredReports = () => {
    if (timeRange === 'all') return reports

    const now = new Date()
    const cutoffDate = new Date()

    switch (timeRange) {
      case '7d':
        cutoffDate.setDate(now.getDate() - 7)
        break
      case '30d':
        cutoffDate.setDate(now.getDate() - 30)
        break
      case '90d':
        cutoffDate.setDate(now.getDate() - 90)
        break
      default:
        return reports
    }

    return reports.filter(report => new Date(report.timestamp) >= cutoffDate)
  }

  const filteredReports = getFilteredReports()

  // Calculate statistics
  const totalCost = filteredReports.reduce((sum, report) => sum + (report.cost || 0), 0)
  const totalReports = filteredReports.length
  const avgCost = totalReports > 0 ? totalCost / totalReports : 0

  // Group by agent
  const agentStats = filteredReports.reduce((acc, report) => {
    const agent = report.agentName
    if (!acc[agent]) {
      acc[agent] = {
        name: agent,
        count: 0,
        totalCost: 0,
        reports: []
      }
    }
    acc[agent].count++
    acc[agent].totalCost += (report.cost || 0)
    acc[agent].reports.push(report)
    return acc
  }, {})

  const agentStatsArray = Object.values(agentStats).sort((a, b) => b.totalCost - a.totalCost)

  // Calculate percentages for the pie chart
  const agentCostPercentages = agentStatsArray.map(agent => ({
    ...agent,
    percentage: totalCost > 0 ? (agent.totalCost / totalCost) * 100 : 0,
    avgCost: agent.count > 0 ? agent.totalCost / agent.count : 0
  }))

  // Group by date for timeline
  const dailyStats = filteredReports.reduce((acc, report) => {
    const date = new Date(report.timestamp).toLocaleDateString()
    if (!acc[date]) {
      acc[date] = { date, cost: 0, count: 0 }
    }
    acc[date].cost += (report.cost || 0)
    acc[date].count++
    return acc
  }, {})

  const dailyStatsArray = Object.values(dailyStats).sort((a, b) =>
    new Date(a.date) - new Date(b.date)
  )

  // Get color for pie chart segments
  const getColor = (index) => {
    const colors = [
      'bg-indigo-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-blue-500',
      'bg-cyan-500',
      'bg-teal-500',
      'bg-green-500',
      'bg-lime-500',
      'bg-yellow-500',
      'bg-orange-500',
      'bg-red-500',
      'bg-rose-500',
      'bg-fuchsia-500',
      'bg-violet-500',
      'bg-sky-500',
      'bg-emerald-500'
    ]
    return colors[index % colors.length]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Error loading analytics: {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Reports
          </button>
        </div>

        {/* Time Range Filter */}
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'All Time' },
            { value: '7d', label: 'Last 7 Days' },
            { value: '30d', label: 'Last 30 Days' },
            { value: '90d', label: 'Last 90 Days' }
          ].map(option => (
            <button
              key={option.value}
              onClick={() => setTimeRange(option.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRange === option.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total Cost</p>
              <p className="text-3xl font-bold text-indigo-600 mt-2">${totalCost.toFixed(4)}</p>
            </div>
            <div className="bg-indigo-100 rounded-full p-3">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total Reports</p>
              <p className="text-3xl font-bold text-purple-600 mt-2">{totalReports}</p>
            </div>
            <div className="bg-purple-100 rounded-full p-3">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Average Cost</p>
              <p className="text-3xl font-bold text-pink-600 mt-2">${avgCost.toFixed(4)}</p>
            </div>
            <div className="bg-pink-100 rounded-full p-3">
              <svg className="w-8 h-8 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Unique Agents</p>
              <p className="text-3xl font-bold text-cyan-600 mt-2">{agentStatsArray.length}</p>
            </div>
            <div className="bg-cyan-100 rounded-full p-3">
              <svg className="w-8 h-8 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost by Agent - Bar Chart */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Cost by Agent Type</h3>
          <div className="space-y-3">
            {agentCostPercentages.map((agent, index) => (
              <div key={agent.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{agent.name}</span>
                  <span className="text-gray-600">${agent.totalCost.toFixed(4)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full ${getColor(index)} transition-all duration-500`}
                    style={{ width: `${agent.percentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                  <span>{agent.count} report{agent.count !== 1 ? 's' : ''}</span>
                  <span>{agent.percentage.toFixed(1)}% of total</span>
                </div>
              </div>
            ))}
            {agentStatsArray.length === 0 && (
              <div className="text-center text-gray-500 py-8">No reports found</div>
            )}
          </div>
        </div>

        {/* Agent Usage - Table */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Agent Usage Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-semibold text-gray-700">Agent</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-700">Runs</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-700">Avg Cost</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {agentCostPercentages.slice(0, 10).map((agent) => (
                  <tr key={agent.name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 font-medium text-gray-900">{agent.name}</td>
                    <td className="py-3 px-3 text-right text-gray-600">{agent.count}</td>
                    <td className="py-3 px-3 text-right text-gray-600">${(agent.avgCost || 0).toFixed(4)}</td>
                    <td className="py-3 px-3 text-right font-semibold text-indigo-600">${(agent.totalCost || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {agentStatsArray.length === 0 && (
              <div className="text-center text-gray-500 py-8">No reports found</div>
            )}
          </div>
        </div>
      </div>

      {/* Daily Timeline */}
      {dailyStatsArray.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Daily Activity Timeline</h3>
          <div className="overflow-x-auto">
            <div className="flex gap-2 min-w-max pb-4">
              {dailyStatsArray.map((day, index) => {
                const maxCost = Math.max(...dailyStatsArray.map(d => d.cost))
                const heightPercentage = maxCost > 0 ? (day.cost / maxCost) * 100 : 0

                return (
                  <div key={index} className="flex flex-col items-center gap-2 min-w-[60px]">
                    <div className="flex flex-col items-center justify-end h-48 w-full">
                      <div className="text-xs font-semibold text-gray-700 mb-1">${day.cost.toFixed(3)}</div>
                      <div
                        className="w-12 bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-lg transition-all hover:from-indigo-700 hover:to-indigo-500 cursor-pointer relative group"
                        style={{ height: `${heightPercentage}%`, minHeight: day.cost > 0 ? '8px' : '0' }}
                        title={`${day.count} reports - $${day.cost.toFixed(4)}`}
                      >
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                          {day.count} report{day.count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 text-center transform -rotate-45 origin-top-left mt-4">
                      {day.date}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Top 5 Most Expensive Reports */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Most Expensive Reports</h3>
        <div className="space-y-2">
          {[...filteredReports]
            .sort((a, b) => (b.cost || 0) - (a.cost || 0))
            .slice(0, 5)
            .map((report, index) => (
              <div key={report.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{report.agentName}</div>
                    <div className="text-xs text-gray-500">{new Date(report.timestamp).toLocaleString()}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-indigo-600">${(report.cost || 0).toFixed(4)}</div>
                </div>
              </div>
            ))}
          {filteredReports.length === 0 && (
            <div className="text-center text-gray-500 py-8">No reports found</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Analytics
