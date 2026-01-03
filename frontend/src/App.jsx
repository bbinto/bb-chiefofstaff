import { useState, useEffect } from 'react'
import ReportList from './components/ReportList'
import ReportViewer from './components/ReportViewer'
import FilterBar from './components/FilterBar'
import mariLogo from './img/mari-128.png'

function App() {
  const [reports, setReports] = useState([])
  const [agents, setAgents] = useState([])
  const [selectedReport, setSelectedReport] = useState(null)
  const [selectedAgent, setSelectedAgent] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchReports()
    fetchAgents()
  }, [])

  const fetchReports = async () => {
    try {
      setLoading(true)
      const response = await fetch('http://localhost:3001/api/reports')
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
      const response = await fetch('http://localhost:3001/api/agents')
      if (!response.ok) throw new Error('Failed to fetch agents')
      const data = await response.json()
      setAgents(data)
    } catch (err) {
      console.error('Error fetching agents:', err)
    }
  }

  const filteredReports = selectedAgent === 'all' 
    ? reports 
    : reports.filter(report => report.agentName === selectedAgent)

  const handleReportSelect = (report) => {
    setSelectedReport(report)
  }

  const handleBack = () => {
    setSelectedReport(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600 mx-auto"></div>
          <p className="mt-4 text-indigo-700 font-medium">Loading reports...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center bg-white rounded-xl shadow-lg p-8 border border-red-200 max-w-md">
          <div className="text-red-600 text-2xl mb-4">⚠️ Error</div>
          <p className="text-gray-700 font-medium">{error}</p>
          <p className="text-sm text-gray-500 mt-2">Make sure the server is running: npm run server</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <header className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-lg border-b border-indigo-700/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src={mariLogo} 
                alt="Mari" 
                className="w-12 h-12 rounded-lg shadow-lg"
              />
              <div>
                <h1 className="text-xl font-bold text-white drop-shadow-lg">Mari, the CoS</h1>
                <p className="text-xs text-indigo-100 mt-0.5">Agent Reports & Analytics</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/bbinto/bb-chiefofstaff"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20 hover:border-white/30"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                <span className="font-medium text-sm">GitHub</span>
              </a>
              <a
                href="https://medium.com/p/7e862a052a85"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20 hover:border-white/30"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
                </svg>
                <span className="font-medium text-sm">Blog Post</span>
              </a>
            </div>
          </div>
        </div>
      </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {selectedReport ? (
          <ReportViewer 
            report={selectedReport} 
            onBack={handleBack}
          />
        ) : (
          <>
            <FilterBar
              agents={agents}
              selectedAgent={selectedAgent}
              onAgentChange={setSelectedAgent}
              reportCount={filteredReports.length}
            />
            <ReportList
              reports={filteredReports}
              onReportSelect={handleReportSelect}
            />
          </>
        )}
      </div>
    </div>
  )
}

export default App

