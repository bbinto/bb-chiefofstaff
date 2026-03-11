import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

const VERDICT_STYLES = {
  report1_better: { label: 'Report A wins', color: 'text-teal-700 bg-teal-50 border-teal-200' },
  report2_better: { label: 'Report B wins', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  comparable:     { label: 'Comparable',    color: 'text-gray-600 bg-gray-50 border-gray-200' },
}

function VerdictBadge({ verdict }) {
  const style = VERDICT_STYLES[verdict] || VERDICT_STYLES.comparable
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${style.color}`}>
      {style.label}
    </span>
  )
}

function DiffTable({ title, rows }) {
  if (!rows || rows.length === 0) return null
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-bold text-gray-900">{title}</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((row, i) => (
          <div key={i} className="px-6 py-4 grid grid-cols-[160px_1fr_1fr_120px] gap-4 items-start text-sm">
            <div className="font-semibold text-gray-700 pt-0.5">{row.aspect}</div>
            <div className="text-gray-600">
              <span className="block text-xs font-semibold text-teal-700 mb-1">Report A</span>
              {row.report1}
            </div>
            <div className="text-gray-600">
              <span className="block text-xs font-semibold text-blue-700 mb-1">Report B</span>
              {row.report2}
            </div>
            <div className="flex items-start justify-end">
              <VerdictBadge verdict={row.verdict} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportComparison({ password, reports }) {
  const [report1, setReport1] = useState('')
  const [report2, setReport2] = useState('')
  const [comparing, setComparing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [currentModel, setCurrentModel] = useState(null)

  useEffect(() => {
    const headers = password ? { 'x-app-password': password } : {}
    fetch(`${API_URL}/api/settings/llm`, { headers })
      .then(r => r.json())
      .then(s => {
        if (s.useOllama) setCurrentModel(`Local Ollama (${s.ollamaModel})`)
        else if (s.useGemini) setCurrentModel(`Gemini (${s.geminiModel})`)
        else setCurrentModel(`Claude (${s.claudeModel})`)
      })
      .catch(() => {})
  }, [password])

  const sortedReports = [...reports].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const handleCompare = async () => {
    if (!report1 || !report2) return
    if (report1 === report2) {
      setError('Please select two different reports.')
      return
    }
    setComparing(true)
    setResult(null)
    setError(null)
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(password ? { 'x-app-password': password } : {})
      }
      const res = await fetch(`${API_URL}/api/reports/compare`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ report1, report2 })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Comparison failed')
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setComparing(false)
    }
  }

  const overallStyle = result
    ? (VERDICT_STYLES[result.comparison?.overallVerdict] || VERDICT_STYLES.comparable)
    : null

  return (
    <div className="space-y-6">
      {/* Selector card */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Select Two Reports to Compare</h3>
          {currentModel && (
            <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              Using: <span className="font-semibold text-gray-700">{currentModel}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-teal-700 mb-1">Report A</label>
            <select
              value={report1}
              onChange={e => setReport1(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">— Select report —</option>
              {sortedReports.map(r => (
                <option key={r.filename} value={r.filename}>
                  {r.filename}{r.llm ? ` [${r.llm}]` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-1">Report B</label>
            <select
              value={report2}
              onChange={e => setReport2(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select report —</option>
              {sortedReports.map(r => (
                <option key={r.filename} value={r.filename}>
                  {r.filename}{r.llm ? ` [${r.llm}]` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleCompare}
          disabled={!report1 || !report2 || comparing}
          className="px-6 py-2 bg-[#00203F] text-white rounded-lg font-medium text-sm hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {comparing ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span>
              Comparing…
            </span>
          ) : 'Compare Reports'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Overall verdict */}
          <div className={`rounded-xl border p-6 ${overallStyle.color}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-base">Overall Verdict</span>
              <VerdictBadge verdict={result.comparison.overallVerdict} />
            </div>
            <p className="text-sm">{result.comparison.overallReason}</p>
            {result.comparison.summary && (
              <p className="text-sm mt-2 opacity-80">{result.comparison.summary}</p>
            )}
            <p className="text-xs mt-3 opacity-60">Analysed by {result.model}</p>
          </div>

          <DiffTable title="Content Differences" rows={result.comparison.contentDifferences} />
          <DiffTable title="Formatting Differences" rows={result.comparison.formattingDifferences} />
        </div>
      )}
    </div>
  )
}

export default ReportComparison
