import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { markdownToSlack } from 'md-to-slack'
import { exportToPDF } from '../utils/pdfExport'

// Get API URL from environment variable, fallback to relative URL (uses proxy)
const API_URL = import.meta.env.VITE_API_URL || ''

function ReportViewer({ report, onBack, password }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesEditing, setNotesEditing] = useState(false)
  const [notesSaving, setNotesSaving] = useState(false)

  // Parse markdown content into sections
  const parseContentSections = (markdown) => {
    const lines = markdown.split('\n')
    const sections = []
    let currentSection = null
    let currentH2Section = null

    lines.forEach((line, index) => {
      // Check for H2
      if (line.startsWith('## ')) {
        if (currentSection) {
          if (currentH2Section) {
            currentH2Section.sections.push(currentSection)
          }
          currentSection = null
        }
        if (currentH2Section) {
          sections.push(currentH2Section)
        }
        currentH2Section = {
          type: 'h2',
          title: line.substring(3).trim(),
          sections: []
        }
      }
      // Check for H3
      else if (line.startsWith('### ')) {
        if (currentSection) {
          if (currentH2Section) {
            currentH2Section.sections.push(currentSection)
          } else {
            sections.push(currentSection)
          }
        }
        currentSection = {
          type: 'h3',
          title: line.substring(4).trim(),
          content: []
        }
      }
      // Regular content
      else {
        if (currentSection) {
          currentSection.content.push(line)
        } else if (currentH2Section) {
          // Content directly under H2 (before any H3)
          if (!currentH2Section.intro) {
            currentH2Section.intro = []
          }
          currentH2Section.intro.push(line)
        } else {
          // Content before any headers
          sections.push({ type: 'content', content: [line] })
        }
      }
    })

    // Add remaining sections
    if (currentSection) {
      if (currentH2Section) {
        currentH2Section.sections.push(currentSection)
      } else {
        sections.push(currentSection)
      }
    }
    if (currentH2Section) {
      sections.push(currentH2Section)
    }

    return sections
  }

  useEffect(() => {
    fetchReportContent()
    loadNotes()
  }, [report])

  const loadNotes = () => {
    try {
      const savedNotes = localStorage.getItem(`report-notes-${report.filename}`)
      if (savedNotes) {
        setNotes(savedNotes)
      }
    } catch (err) {
      console.error('Error loading notes:', err)
    }
  }

  const handleSaveNotes = async () => {
    try {
      setNotesSaving(true)
      localStorage.setItem(`report-notes-${report.filename}`, notes)
      setNotesEditing(false)
    } catch (err) {
      console.error('Error saving notes:', err)
      alert('Failed to save notes. Please try again.')
    } finally {
      setNotesSaving(false)
    }
  }

  const handleCancelEdit = () => {
    loadNotes() // Reload original notes
    setNotesEditing(false)
  }

  const fetchReportContent = async () => {
    try {
      setLoading(true)
      const headers = password ? { 'x-app-password': password } : {}
      const response = await fetch(`${API_URL}/api/reports/${report.filename}`, { headers })
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

  const handleExportPDF = async () => {
    try {
      setExporting(true)
      await exportToPDF(
        report.filename,
        report.agentName,
        `${report.date} ${report.time}`
      )
    } catch (err) {
      console.error('Failed to export PDF:', err)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleExportSlack = () => {
    try {
      const slackFormatted = markdownToSlack(content)
      navigator.clipboard.writeText(slackFormatted)
      alert('Slack-formatted message copied to clipboard!')
    } catch (err) {
      console.error('Failed to export to Slack format:', err)
      alert('Failed to export to Slack format. Please try again.')
    }
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete this report?\n\n${report.filename}\n\nThis action cannot be undone.`
    )

    if (!confirmed) return

    try {
      setDeleting(true)
      const headers = {
        'Content-Type': 'application/json',
      }
      if (password) {
        headers['x-app-password'] = password
      }
      const response = await fetch(`${API_URL}/api/reports/${encodeURIComponent(report.filename)}`, {
        method: 'DELETE',
        headers,
      })

      if (!response.ok) {
        // Try to parse as JSON, but handle HTML responses
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to delete report')
        } else {
          const text = await response.text()
          console.error('Server returned non-JSON response:', text)
          throw new Error(`Failed to delete report: ${response.status} ${response.statusText}`)
        }
      }

      alert('Report deleted successfully!')
      onBack() // Navigate back to report list
    } catch (err) {
      console.error('Failed to delete report:', err)
      alert(`Failed to delete report: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border-2 border-teal-100 p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-200 border-t-[#00203F] mx-auto"></div>
          <p className="mt-4 text-[#00203F] font-medium">Loading report...</p>
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
      'weekly-recap': 'from-cyan-500 to-teal-500',
      'business-health': 'from-emerald-500 to-teal-500',
      'product-engineering': 'from-[#00203F] to-teal-600',
      'okr-progress': 'from-teal-600 to-cyan-500',
    }
    return colors[agentName] || 'from-[#00203F] to-teal-600'
  }

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-xl border-2 border-teal-100">
      {/* Header */}
      <div className="border-b-2 border-teal-100 bg-gradient-to-r from-teal-50 to-cyan-50 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              title="Back to Reports"
              className="flex items-center justify-center p-2 text-[#00203F] hover:text-[#001529] hover:bg-white rounded-lg transition-all duration-200 border border-teal-200 hover:border-teal-300 hover:shadow-sm"
            >
              <svg
                className="w-5 h-5"
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
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              title={exporting ? 'Exporting...' : 'Export PDF'}
              className="flex items-center justify-center p-2 text-white bg-gradient-to-r from-[#00203F] to-[#003060] hover:from-[#001529] hover:to-[#002040] rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
            <button
              onClick={handleExportSlack}
              title="Copy for Slack"
              className="flex items-center justify-center p-2 text-white bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
              </svg>
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              title={deleting ? 'Deleting...' : 'Delete Report'}
              className="flex items-center justify-center p-2 text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[0.625rem] font-bold bg-gradient-to-r ${getAgentColor(report.agentName)} text-white shadow-sm`}>
              {formatAgentName(report.agentName)}
            </span>
            <span className="text-xs text-[#00203F] font-medium">
              {report.date} at {report.time}
              {report.executionTime && (
                <span className="ml-2 text-teal-700 font-semibold">
                  (ran in {report.executionTime}s)
                </span>
              )}
            </span>
          </div>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mt-3 bg-gradient-to-r from-[#00203F] via-teal-600 to-[#ADEFD1] bg-clip-text text-transparent">
          Filename: {report.filename}
        </h2>
      </div>

      {/* Report Notes Section */}
      <div className="border-b-2 border-teal-100 bg-gradient-to-r from-amber-50 to-yellow-50 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Report Evaluation Notes
          </h3>
          {!notesEditing ? (
            <button
              onClick={() => setNotesEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-amber-700 hover:text-amber-900 hover:bg-white rounded-lg transition-all duration-200 font-medium border border-amber-200 hover:border-amber-300 hover:shadow-sm text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              {notes ? 'Edit Notes' : 'Add Notes'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelEdit}
                disabled={notesSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-gray-700 hover:text-gray-900 hover:bg-white rounded-lg transition-all duration-200 font-medium border border-gray-300 hover:border-gray-400 hover:shadow-sm text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={notesSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-white bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 rounded-lg transition-all duration-200 font-medium shadow-sm hover:shadow-md text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {notesSaving ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          )}
        </div>
        {notesEditing ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add your evaluation notes here: findings on the report quality, suggestions for prompt improvements, specific issues to address..."
            className="w-full px-3 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm text-gray-900 bg-white placeholder-gray-400 min-h-[100px] font-mono"
          />
        ) : notes ? (
          <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-white/50 px-3 py-2 rounded border border-amber-200">
            {notes}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">
            No notes yet. Click "Add Notes" to add evaluation feedback for this report.
          </p>
        )}
      </div>

      {/* Content */}
      <div id="report-content" className="px-6 py-6 bg-gradient-to-br from-white to-teal-50/30">
        {(() => {
          const sections = parseContentSections(content)
          const elements = []
          let standaloneH3s = []

          sections.forEach((section, sectionIndex) => {
            if (section.type === 'h2') {
              // Flush any accumulated standalone H3s
              if (standaloneH3s.length > 0) {
                elements.push(
                  <div key={`standalone-${elements.length}`} className="report-content-grid mb-6">
                    {standaloneH3s}
                  </div>
                )
                standaloneH3s = []
              }

              // Add H2 section
              elements.push(
                <div key={sectionIndex} className="report-h2-section">
                  <h2>{section.title}</h2>
                  {section.intro && section.intro.length > 0 && (
                    <div className="prose prose-sm max-w-none mb-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {section.intro.join('\n')}
                      </ReactMarkdown>
                    </div>
                  )}
                  <div className="report-content-grid">
                    {section.sections.map((h3Section, h3Index) => {
                      const isExecutiveSummary = h3Section.title.match(/One-Line Executive Summary/i)
                      const isFullWidth = h3Section.title.match(/Actionable Recommendations|Actions/i)

                      if (isExecutiveSummary) {
                        return (
                          <div key={h3Index} className="executive-summary-box">
                            <h3>{h3Section.title}</h3>
                            <div className="executive-summary-content">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {h3Section.content.join('\n')}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )
                      }

                      if (isFullWidth) {
                        return (
                          <div key={h3Index} className="h3-section-box full-width-section">
                            <h3>{h3Section.title}</h3>
                            <div className="h3-section-content prose prose-sm max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {h3Section.content.join('\n')}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div key={h3Index} className="h3-section-box">
                          <h3>{h3Section.title}</h3>
                          <div className="h3-section-content prose prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {h3Section.content.join('\n')}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            } else if (section.type === 'h3') {
              // Check if this is the Executive Summary section or full-width section
              const isExecutiveSummary = section.title.match(/One-Line Executive Summary/i)
              const isFullWidth = section.title.match(/Actionable Recommendations|Actions/i)

              if (isExecutiveSummary) {
                // Flush any accumulated standalone H3s first
                if (standaloneH3s.length > 0) {
                  elements.push(
                    <div key={`standalone-${elements.length}`} className="report-content-grid mb-6">
                      {standaloneH3s}
                    </div>
                  )
                  standaloneH3s = []
                }

                // Render Executive Summary with special styling (full width)
                elements.push(
                  <div key={sectionIndex} className="executive-summary-box">
                    <h3>{section.title}</h3>
                    <div className="executive-summary-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {section.content.join('\n')}
                      </ReactMarkdown>
                    </div>
                  </div>
                )
              } else if (isFullWidth) {
                // Flush any accumulated standalone H3s first
                if (standaloneH3s.length > 0) {
                  elements.push(
                    <div key={`standalone-${elements.length}`} className="report-content-grid mb-6">
                      {standaloneH3s}
                    </div>
                  )
                  standaloneH3s = []
                }

                // Render full-width section
                elements.push(
                  <div key={sectionIndex} className="h3-section-box full-width-section">
                    <h3>{section.title}</h3>
                    <div className="h3-section-content prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {section.content.join('\n')}
                      </ReactMarkdown>
                    </div>
                  </div>
                )
              } else {
                // Accumulate regular standalone H3s
                standaloneH3s.push(
                  <div key={sectionIndex} className="h3-section-box">
                    <h3>{section.title}</h3>
                    <div className="h3-section-content prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {section.content.join('\n')}
                      </ReactMarkdown>
                    </div>
                  </div>
                )
              }
            } else {
              // Flush any accumulated standalone H3s
              if (standaloneH3s.length > 0) {
                elements.push(
                  <div key={`standalone-${elements.length}`} className="report-content-grid mb-6">
                    {standaloneH3s}
                  </div>
                )
                standaloneH3s = []
              }

              // Add regular content
              elements.push(
                <div key={sectionIndex} className="prose prose-sm max-w-none mb-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {section.content.join('\n')}
                  </ReactMarkdown>
                </div>
              )
            }
          })

          // Flush any remaining standalone H3s
          if (standaloneH3s.length > 0) {
            elements.push(
              <div key={`standalone-${elements.length}`} className="report-content-grid mb-6">
                {standaloneH3s}
              </div>
            )
          }

          return elements
        })()}
      </div>
    </div>
  )
}

export default ReportViewer

