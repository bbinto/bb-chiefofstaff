import { useState, useEffect } from 'react'
import ReportList from './components/ReportList'
import ReportViewer from './components/ReportViewer'
import FilterBar from './components/FilterBar'
import Login from './components/Login'
import AgentRunner from './components/AgentRunner'
import Analytics from './components/Analytics'
import ConfigViewer from './components/ConfigViewer'
import MCPStatus from './components/MCPStatus'
import mariLogo from './img/mari-128.png'

// Get API URL from environment variable, fallback to relative URL (uses proxy)
const API_URL = import.meta.env.VITE_API_URL || ''

function App() {
  const [reports, setReports] = useState([])
  const [agents, setAgents] = useState([])
  const [selectedReport, setSelectedReport] = useState(null)
  const [selectedAgent, setSelectedAgent] = useState('all')
  const [selectedWeek, setSelectedWeek] = useState('all')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [password, setPassword] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showAgentRunner, setShowAgentRunner] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [showMCPStatus, setShowMCPStatus] = useState(false)

  useEffect(() => {
    // Check if password is stored in sessionStorage
    const storedPassword = sessionStorage.getItem('appPassword')
    if (storedPassword) {
      setPassword(storedPassword)
      setIsAuthenticated(true)
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && password) {
      fetchReports()
      fetchAgents()
    }
  }, [isAuthenticated, password])

  // Handle URL-based direct report access
  useEffect(() => {
    if (isAuthenticated && password && reports.length > 0) {
      const path = window.location.pathname
      // Check if path contains a .md filename
      if (path !== '/' && path.endsWith('.md')) {
        const filename = path.substring(1) // Remove leading slash
        const report = reports.find(r => r.filename === filename)
        if (report) {
          setSelectedReport(report)
          // Update URL without reloading
          window.history.replaceState({}, '', `/${filename}`)
        }
      }
    }
  }, [isAuthenticated, password, reports])

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname
      if (path === '/') {
        setSelectedReport(null)
      } else if (path.endsWith('.md') && reports.length > 0) {
        const filename = path.substring(1)
        const report = reports.find(r => r.filename === filename)
        if (report) {
          setSelectedReport(report)
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [reports])

  const handleLogin = (pass) => {
    setPassword(pass)
    setIsAuthenticated(true)
    sessionStorage.setItem('appPassword', pass)
  }

  const handleLogout = () => {
    setPassword(null)
    setIsAuthenticated(false)
    sessionStorage.removeItem('appPassword')
    setReports([])
    setAgents([])
    setSelectedReport(null)
  }

  const fetchReports = async () => {
    try {
      setLoading(true)
      const headers = password ? { 'x-app-password': password } : {}
      const response = await fetch(`${API_URL}/api/reports`, { headers })

      if (response.status === 401) {
        handleLogout()
        throw new Error('Authentication failed')
      }

      if (!response.ok) throw new Error('Failed to fetch reports')
      const data = await response.json()
      setReports(data)
      setError(null)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching reports:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchAgents = async () => {
    try {
      const headers = password ? { 'x-app-password': password } : {}
      const response = await fetch(`${API_URL}/api/agents`, { headers })

      if (response.status === 401) {
        handleLogout()
        throw new Error('Authentication failed')
      }

      if (!response.ok) throw new Error('Failed to fetch agents')
      const data = await response.json()
      setAgents(data)
    } catch (err) {
      console.error('Error fetching agents:', err)
    }
  }

  // Helper function to get ISO week number
  const getWeekNumber = (date) => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7))
    const yearStart = new Date(d.getFullYear(), 0, 1)
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`
  }

  // Helper function to format week for display
  const formatWeekDisplay = (weekStr) => {
    const [year, week] = weekStr.split('-W')
    return `Week ${week}, ${year}`
  }

  // Get unique weeks from reports
  const reportWeeks = [...new Set(reports.map(report => getWeekNumber(report.timestamp)))]

  // Add predefined calendar weeks (weeks 1-6 of 2026)
  const predefinedWeeks = [
    '2026-W01',
    '2026-W02',
    '2026-W03',
    '2026-W04',
    '2026-W05',
    '2026-W06'
  ]

  // Combine and deduplicate weeks, then sort
  const weeks = [...new Set([...predefinedWeeks, ...reportWeeks])]
    .sort()
    .reverse()

  // Get favorites from localStorage
  const getFavorites = () => {
    const saved = localStorage.getItem('reportFavorites')
    return saved ? JSON.parse(saved) : []
  }

  // Filter reports by agent, week, and favorites
  const filteredReports = reports.filter(report => {
    const matchesAgent = selectedAgent === 'all' || report.agentName === selectedAgent
    const matchesWeek = selectedWeek === 'all' || getWeekNumber(report.timestamp) === selectedWeek
    const matchesFavorites = !showFavoritesOnly || getFavorites().includes(report.id)
    return matchesAgent && matchesWeek && matchesFavorites
  })

  // Calculate total cost for filtered reports
  const totalCost = filteredReports.reduce((sum, report) => {
    return sum + (report.cost || 0)
  }, 0)

  const handleReportSelect = (report) => {
    setSelectedReport(report)
    // Update URL to include report filename
    window.history.pushState({}, '', `/${report.filename}`)
  }

  const handleBack = () => {
    setSelectedReport(null)
    // Update URL back to root
    window.history.pushState({}, '', '/')
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-200 border-t-[#00203F] mx-auto"></div>
          <p className="mt-4 text-[#00203F] font-medium">Loading reports...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center bg-white rounded-xl shadow-lg p-8 border border-red-200 max-w-md">
          <div className="text-red-600 text-2xl mb-4">⚠️ Error</div>
          <p className="text-gray-700 font-medium">{error}</p>
          <p className="text-sm text-gray-500 mt-2">Make sure the server is running: npm run server</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-50">
      <header className="bg-gradient-to-r from-[#00203F] via-teal-700 to-teal-600 shadow-lg border-b border-[#00203F]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            
            <div className="flex items-center gap-4">
              <a href="/"><img 
                src={mariLogo} 
                alt="Mari" 
                className="w-12 h-12 rounded-lg shadow-lg"
              />
             </a>
              <div>
                <h1 className="text-xl font-bold text-white drop-shadow-lg">Mari, the CoS</h1>
                <p className="text-xs text-[#ADEFD1] mt-0.5">Agent Reports & Analytics</p>
              </div>
            
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowAgentRunner(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20 hover:border-white/30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="font-medium text-sm">Run Agents</span>
              </button>
              <button
                onClick={() => setShowConfig(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20 hover:border-white/30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-medium text-sm">Config</span>
              </button>
              <button
                onClick={() => {
                  console.log('Analytics button clicked')
                  setShowAnalytics(true)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20 hover:border-white/30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className="font-medium text-sm">Analytics</span>
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20 hover:border-white/30"
                title="Sign out"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="font-medium text-sm">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {showMCPStatus ? (
          <MCPStatus
            password={password}
            onBack={() => setShowMCPStatus(false)}
          />
        ) : showConfig ? (
          <ConfigViewer
            password={password}
            onBack={() => setShowConfig(false)}
          />
        ) : showAnalytics ? (
          <Analytics
            password={password}
            onBack={() => setShowAnalytics(false)}
          />
        ) : selectedReport ? (
          <ReportViewer
            report={selectedReport}
            onBack={handleBack}
            password={password}
          />
        ) : (
          <>
            <FilterBar
              agents={agents}
              selectedAgent={selectedAgent}
              onAgentChange={setSelectedAgent}
              weeks={weeks}
              selectedWeek={selectedWeek}
              onWeekChange={setSelectedWeek}
              formatWeekDisplay={formatWeekDisplay}
              reportCount={filteredReports.length}
              totalCost={totalCost}
              showFavoritesOnly={showFavoritesOnly}
              onFavoritesToggle={() => setShowFavoritesOnly(!showFavoritesOnly)}
            />
            <ReportList
              reports={filteredReports}
              onReportSelect={handleReportSelect}
            />
          </>
        )}
      </div>

      {showAgentRunner && (
        <AgentRunner
          password={password}
          onClose={() => setShowAgentRunner(false)}
        />
      )}

      <footer className="bg-gradient-to-r from-[#00203F] via-teal-700 to-teal-600 border-t border-[#00203F]/20 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

            <div className="text-center md:text-left">
              <h3 className="text-white font-semibold text-lg mb-3">About Mari</h3>
              <p className="text-[#ADEFD1] text-sm leading-relaxed">
                Mari is an AI-powered Chief of Staff assistant that helps you manage your team's workflows,
                track progress, and generate insightful reports. Built with modern AI agents to streamline
                your operations.
              </p>
            </div>

            <div className="text-center">
              <h3 className="text-white font-semibold text-lg mb-3">Quick Links</h3>
              <div className="flex flex-col gap-2">
                <a
                  href="https://github.com/bbinto/bb-chiefofstaff"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20 hover:border-white/30"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium text-sm">View on GitHub</span>
                </a>
                <a
                  href="https://medium.com/p/7e862a052a85"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20 hover:border-white/30"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
                  </svg>
                  <span className="font-medium text-sm">Read Blog Post</span>
                </a>
              </div>
            </div>

            <div className="text-center md:text-right">
              <h3 className="text-white font-semibold text-lg mb-3">System Status</h3>
              <div className="flex flex-col gap-2 items-center md:items-end">
                <button
                  onClick={() => setShowMCPStatus(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20 hover:border-white/30"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                  <span className="font-medium text-sm">Check MCP Status</span>
                </button>
                <p className="text-[#ADEFD1] text-xs mt-2">
                  View connection status of all MCP servers
                </p>
              </div>
              <div className="mt-4">
                <p className="text-teal-200 text-xs">
                  © 2026 Mari Chief of Staff
                </p>
              </div>
            </div>

          </div>
        </div>
      </footer>
    </div>
  )
}

export default App

