import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function ReportViewer({ report, onBack }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchReportContent()
  }, [report])

  const fetchReportContent = async () => {
    try {
      setLoading(true)
      const response = await fetch(`http://localhost:3001/api/reports/${report.filename}`)
      if (!response.ok) throw new Error('Failed to fetch report content')
      const data = await response.json()
      setContent(data.content)
      setError(null)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching report content:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatAgentName = (name) => {
    return name.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  if (loading) {
    return (
      <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border-2 border-indigo-100 p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600 mx-auto"></div>
          <p className="mt-4 text-indigo-700 font-medium">Loading report...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border-2 border-red-200 p-8">
        <div className="text-center">
          <div className="text-red-600 text-2xl mb-4">⚠️ Error</div>
          <p className="text-gray-700 font-medium">{error}</p>
        </div>
      </div>
    )
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
    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-xl border-2 border-indigo-100">
      {/* Header */}
      <div className="border-b-2 border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 text-indigo-700 hover:text-indigo-900 hover:bg-white rounded-lg transition-all duration-200 font-medium border border-indigo-200 hover:border-indigo-300 hover:shadow-sm text-sm"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Reports
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[0.625rem] font-bold bg-gradient-to-r ${getAgentColor(report.agentName)} text-white shadow-sm`}>
              {formatAgentName(report.agentName)}
            </span>
            <span className="text-xs text-indigo-600 font-medium">
              {report.date} at {report.time}
            </span>
          </div>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mt-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
          {report.filename}
        </h2>
      </div>

      {/* Content */}
      <div className="px-6 py-6 bg-gradient-to-br from-white to-indigo-50/30">
        <div className="prose prose-sm max-w-none prose-headings:font-bold prose-p:text-gray-700 prose-a:text-indigo-600 prose-a:font-medium hover:prose-a:text-indigo-800">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Custom styling for code blocks
              code: ({ node, inline, className, children, ...props }) => {
                return inline ? (
                  <code className="bg-gray-100 px-1 py-0.5 rounded text-xs" {...props}>
                    {children}
                  </code>
                ) : (
                  <code className="block bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto text-xs" {...props}>
                    {children}
                  </code>
                )
              },
              // Custom styling for tables
              table: ({ children }) => (
                <div className="overflow-x-auto my-4">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-gray-50">{children}</thead>
              ),
              tbody: ({ children }) => (
                <tbody className="bg-white divide-y divide-gray-200">{children}</tbody>
              ),
              th: ({ children }) => (
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-300">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-3 py-2 text-xs text-gray-900 border-b border-gray-200">
                  {children}
                </td>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

export default ReportViewer

