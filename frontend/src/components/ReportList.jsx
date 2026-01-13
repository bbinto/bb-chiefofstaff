import { useState, useEffect } from 'react'

function ReportList({ reports, onReportSelect }) {
  const [favorites, setFavorites] = useState(() => {
    // Load favorites from localStorage on init
    const saved = localStorage.getItem('reportFavorites')
    return saved ? JSON.parse(saved) : []
  })

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('reportFavorites', JSON.stringify(favorites))
  }, [favorites])

  const toggleFavorite = (e, reportId) => {
    e.stopPropagation() // Prevent report selection when clicking star
    setFavorites(prev => {
      if (prev.includes(reportId)) {
        return prev.filter(id => id !== reportId)
      } else {
        return [...prev, reportId]
      }
    })
  }

  const isFavorite = (reportId) => favorites.includes(reportId)

  const hasNotes = (reportFilename) => {
    const savedNotes = localStorage.getItem(`report-notes-${reportFilename}`)
    return savedNotes && savedNotes.trim().length > 0
  }

  if (reports.length === 0) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-teal-100 p-12 text-center">
        <div className="text-teal-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-[#00203F] font-medium text-sm">No reports found</p>
      </div>
    )
  }

  const formatAgentName = (name) => {
    return name.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  const getAgentColor = (agentName) => {
    const colors = {
      'weekly-recap': 'from-teal-500 to-teal-500',
      'business-health': 'from-teal-500 to-teal-500',
      'product-engineering': 'from-teal-500 to-teal-500',
      'okr-progress': 'from-orange-500 to-teal-500',
    }
    return colors[agentName] || 'from-teal-500 to-teal-500'
  }

  const formatDateAndTime = (report) => {
    if (!report.timestamp) {
      return `${report.date} at ${report.time}`
    }
    
    const date = new Date(report.timestamp)
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dayOfWeek = daysOfWeek[date.getDay()]
    
    // Format date: "Mon, Jan 3, 2026"
    const dateStr = date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
    
    // Format time: "2:30 PM"
    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
    
    return `${dateStr} at ${timeStr}`
  }

  return (
    <div className="space-y-4">
      {reports.map(report => (
        <div
          key={report.id}
          onClick={() => onReportSelect(report)}
          className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md border-2 border-teal-100 p-4 hover:shadow-xl hover:border-teal-300 hover:scale-[1.02] cursor-pointer transition-all duration-300 group"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {/* Favorite Star Button */}
                <button
                  onClick={(e) => toggleFavorite(e, report.id)}
                  className="hover:scale-110 transition-transform focus:outline-none"
                  title={isFavorite(report.id) ? "Remove from favorites" : "Add to favorites"}
                >
                  <svg
                    className={`w-5 h-5 ${isFavorite(report.id) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300 hover:text-yellow-400'} transition-colors`}
                    fill={isFavorite(report.id) ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                    />
                  </svg>
                </button>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-[0.625rem] font-bold bg-gradient-to-r ${getAgentColor(report.agentName)} text-white shadow-sm`}>
                  {formatAgentName(report.agentName)}
                </span>
                <span className="text-xs text-[#00203F] font-medium">
                  {formatDateAndTime(report)}
                </span>
                {report.cost !== null && report.cost !== undefined && (
                  <span className="text-xs text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded-md border border-green-200">
                    ${report.cost.toFixed(4)}
                  </span>
                )}
                {hasNotes(report.filename) && (
                  <span className="inline-flex items-center text-xs text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200" title="Has evaluation notes">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </span>
                )}
              </div>
              {(report.oneLineSummary || (report.insights && report.insights.length > 0)) && (
                <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                  {report.oneLineSummary || report.insights[0]}
                </p>
              )}
            </div>
              <div className="ml-4 flex items-center">
              <div className="bg-teal-100 group-hover:bg-teal-200 rounded-full p-1.5 transition-colors">
                <svg
                  className="w-5 h-5 text-[#00203F] group-hover:text-teal-700 group-hover:translate-x-1 transition-all"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default ReportList

