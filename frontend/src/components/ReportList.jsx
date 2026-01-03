function ReportList({ reports, onReportSelect }) {
  if (reports.length === 0) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-indigo-100 p-12 text-center">
        <div className="text-indigo-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-indigo-600 font-medium text-sm">No reports found</p>
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
      'weekly-recap': 'from-blue-500 to-cyan-500',
      'business-health': 'from-green-500 to-emerald-500',
      'product-engineering': 'from-purple-500 to-pink-500',
      'okr-progress': 'from-orange-500 to-red-500',
    }
    return colors[agentName] || 'from-indigo-500 to-purple-500'
  }

  return (
    <div className="space-y-4">
      {reports.map(report => (
        <div
          key={report.id}
          onClick={() => onReportSelect(report)}
          className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md border-2 border-indigo-100 p-4 hover:shadow-xl hover:border-indigo-300 hover:scale-[1.02] cursor-pointer transition-all duration-300 group"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-[0.625rem] font-bold bg-gradient-to-r ${getAgentColor(report.agentName)} text-white shadow-sm`}>
                  {formatAgentName(report.agentName)}
                </span>
                <span className="text-xs text-indigo-600 font-medium">
                  {report.date} at {report.time}
                </span>
              </div>
            </div>
              <div className="ml-4 flex items-center">
              <div className="bg-indigo-100 group-hover:bg-indigo-200 rounded-full p-1.5 transition-colors">
                <svg
                  className="w-5 h-5 text-indigo-600 group-hover:text-indigo-700 group-hover:translate-x-1 transition-all"
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

