import { useState, useEffect, useRef } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

function SkillRunner({ password, onClose }) {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [parameters, setParameters] = useState({})
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [activeLlm, setActiveLlm] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const resultRef = useRef(null)

  const headers = password ? { 'x-app-password': password } : {}

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [skillsRes, settingsRes] = await Promise.all([
          fetch(`${API_URL}/api/skills`, { headers }),
          fetch(`${API_URL}/api/settings/llm`, { headers })
        ])
        if (skillsRes.ok) {
          const data = await skillsRes.json()
          setSkills(data)
        }
        if (settingsRes.ok) {
          const s = await settingsRes.json()
          const icon = s.useOllama ? '🦙' : s.useGemini ? '💎' : '🔑'
          const model = s.useOllama ? s.ollamaModel : s.useGemini ? s.geminiModel : s.claudeModel
          setActiveLlm({ icon, model })
        }
      } catch (err) {
        console.error('Error fetching skills:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [password])

  // Scroll result into view when it arrives
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [result])

  const handleSelectSkill = (skill) => {
    setSelectedSkill(skill)
    // Initialize parameters with empty values
    const initParams = {}
    ;(skill.parameters || []).forEach(p => { initParams[p.name] = '' })
    setParameters(initParams)
    setResult(null)
    setError(null)
  }

  const handleParamChange = (name, value) => {
    setParameters(prev => ({ ...prev, [name]: value }))
  }

  const handleRun = async () => {
    if (!selectedSkill) return
    setIsRunning(true)
    setResult(null)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/run-skill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ skillId: selectedSkill.id, parameters })
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Skill execution failed')
      }
      setResult(data.result)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsRunning(false)
    }
  }

  const handleCopy = () => {
    if (!result) return
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleBack = () => {
    setSelectedSkill(null)
    setResult(null)
    setError(null)
    setParameters({})
  }

  // Group skills by category
  const filteredSkills = skills.filter(s => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
  })

  const byCategory = filteredSkills.reduce((acc, skill) => {
    const cat = skill.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(skill)
    return acc
  }, {})

  const sortedCategories = Object.keys(byCategory).sort()

  const categoryColors = {
    Writing: 'bg-blue-100 text-blue-800 border-blue-200',
    Productivity: 'bg-green-100 text-green-800 border-green-200',
    Strategy: 'bg-purple-100 text-purple-800 border-purple-200',
    Analysis: 'bg-orange-100 text-orange-800 border-orange-200',
    General: 'bg-gray-100 text-gray-800 border-gray-200',
  }

  const getCategoryColor = (cat) => categoryColors[cat] || 'bg-teal-100 text-teal-800 border-teal-200'

  const categoryIcons = {
    Writing: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    Productivity: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    Strategy: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  }

  const getCategoryIcon = (cat) => categoryIcons[cat] || (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#00203F] via-teal-700 to-teal-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {selectedSkill && (
              <button
                onClick={handleBack}
                disabled={isRunning}
                className="text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors mr-1"
                title="Back to skills"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold text-white">
                {selectedSkill ? selectedSkill.name : 'Run a Skill'}
              </h2>
              {!selectedSkill && (
                <p className="text-[#ADEFD1] text-xs mt-0.5">
                  {skills.length} skill{skills.length !== 1 ? 's' : ''} available
                </p>
              )}
              {selectedSkill && (
                <p className="text-[#ADEFD1] text-xs mt-0.5">{selectedSkill.description}</p>
              )}
            </div>
            {activeLlm && (
              <span className="text-xs font-medium bg-white/20 text-white px-2.5 py-1 rounded-full ml-2">
                {activeLlm.icon} {activeLlm.model}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            disabled={isRunning}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Skill List View */}
          {!selectedSkill && (
            <div className="p-6 space-y-4">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-teal-200 border-t-[#00203F]"></div>
                </div>
              ) : skills.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="font-medium">No skills found</p>
                  <p className="text-sm mt-1">Add YAML files to the <code className="bg-gray-100 px-1 rounded">/skills</code> directory</p>
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <p>No skills match &ldquo;{searchQuery}&rdquo;</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {sortedCategories.map(category => (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getCategoryColor(category)}`}>
                          {getCategoryIcon(category)}
                          {category}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {byCategory[category].map(skill => (
                          <button
                            key={skill.id}
                            onClick={() => handleSelectSkill(skill)}
                            className="text-left p-4 rounded-lg border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all group"
                          >
                            <div className="font-semibold text-gray-900 group-hover:text-teal-700 text-sm mb-1">
                              {skill.name}
                            </div>
                            <div className="text-xs text-gray-500 leading-relaxed">{skill.description}</div>
                            {skill.parameters && skill.parameters.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {skill.parameters.map(p => (
                                  <span key={p.name} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                    {p.label || p.name}{p.required === true || p.required === 'true' ? ' *' : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Skill Run View */}
          {selectedSkill && (
            <div className="p-6 space-y-6">

              {/* Category badge */}
              <div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getCategoryColor(selectedSkill.category)}`}>
                  {getCategoryIcon(selectedSkill.category)}
                  {selectedSkill.category}
                </span>
              </div>

              {/* Parameters */}
              {selectedSkill.parameters && selectedSkill.parameters.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-gray-900">Parameters</h3>
                  {selectedSkill.parameters.map(param => (
                    <div key={param.name}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {param.label || param.name}
                        {(param.required === true || param.required === 'true') && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </label>
                      {param.description && (
                        <p className="text-xs text-gray-500 mb-1.5">{param.description}</p>
                      )}
                      {param.type === 'textarea' ? (
                        <textarea
                          value={parameters[param.name] || ''}
                          onChange={e => handleParamChange(param.name, e.target.value)}
                          disabled={isRunning}
                          rows={5}
                          placeholder={param.description || `Enter ${param.label || param.name}...`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y disabled:opacity-50"
                        />
                      ) : param.type === 'select' ? (
                        <select
                          value={parameters[param.name] || ''}
                          onChange={e => handleParamChange(param.name, e.target.value)}
                          disabled={isRunning}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white disabled:opacity-50"
                        >
                          <option value="">Select {param.label || param.name}...</option>
                          {(param.options || []).map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label || opt.value}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={parameters[param.name] || ''}
                          onChange={e => handleParamChange(param.name, e.target.value)}
                          disabled={isRunning}
                          placeholder={param.description || `Enter ${param.label || param.name}...`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">This skill has no parameters — just click Run.</p>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-red-800">Skill failed</p>
                      <p className="text-xs text-red-600 mt-0.5">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Result */}
              {result && (
                <div ref={resultRef} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                      <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Result
                    </h3>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-teal-600 px-2.5 py-1.5 rounded-lg hover:bg-teal-50 transition-colors border border-gray-200 hover:border-teal-300"
                    >
                      {copied ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
                    {result}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between flex-shrink-0">
          {selectedSkill ? (
            <>
              <button
                onClick={handleBack}
                disabled={isRunning}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Skills
              </button>
              <button
                onClick={handleRun}
                disabled={isRunning}
                className="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-white bg-gradient-to-r from-[#00203F] to-teal-600 rounded-lg hover:from-teal-700 hover:to-teal-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {isRunning ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                    Running...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Run Skill
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Add skills by creating YAML-formatted <code className="bg-gray-200 px-1 rounded">.md</code> files in the <code className="bg-gray-200 px-1 rounded">/skills</code> directory
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default SkillRunner
