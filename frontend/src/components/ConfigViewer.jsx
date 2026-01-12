import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

function ConfigViewer({ password, onBack }) {
  const [config, setConfig] = useState(null)
  const [editedConfig, setEditedConfig] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [validationError, setValidationError] = useState(null)
  const [expandedSections, setExpandedSections] = useState({})

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      setLoading(true)
      const headers = password ? { 'x-app-password': password } : {}
      const response = await fetch('http://localhost:3001/api/config', { headers })

      if (!response.ok) throw new Error('Failed to fetch config')
      const data = await response.json()
      setConfig(data)
      setEditedConfig(JSON.stringify(data, null, 2))
      setError(null)

      // Initialize all sections as expanded
      const sections = Object.keys(data)
      const initialExpanded = {}
      sections.forEach(section => {
        initialExpanded[section] = true
      })
      setExpandedSections(initialExpanded)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching config:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      // Validate JSON first
      const parsedConfig = JSON.parse(editedConfig)
      setValidationError(null)

      setSaving(true)
      const headers = {
        'Content-Type': 'application/json',
        ...(password ? { 'x-app-password': password } : {})
      }

      const response = await fetch('http://localhost:3001/api/config', {
        method: 'PUT',
        headers,
        body: JSON.stringify(parsedConfig)
      })

      if (!response.ok) throw new Error('Failed to save config')

      setConfig(parsedConfig)
      setIsEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      if (err instanceof SyntaxError) {
        setValidationError(`Invalid JSON: ${err.message}`)
      } else {
        setError(err.message)
      }
      console.error('Error saving config:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditedConfig(JSON.stringify(config, null, 2))
    setIsEditing(false)
    setValidationError(null)
  }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const toggleAllSections = () => {
    const allExpanded = Object.values(expandedSections).every(v => v)
    const newState = {}
    Object.keys(expandedSections).forEach(key => {
      newState[key] = !allExpanded
    })
    setExpandedSections(newState)
  }

  const renderValue = (value, depth = 0) => {
    if (value === null) return <span className="text-gray-500">null</span>
    if (typeof value === 'boolean') return <span className="text-purple-600">{value.toString()}</span>
    if (typeof value === 'number') return <span className="text-blue-600">{value}</span>
    if (typeof value === 'string') return <span className="text-green-600">"{value}"</span>
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-gray-500">[]</span>
      if (value.every(item => typeof item === 'string')) {
        return (
          <div className="ml-4">
            {value.map((item, idx) => (
              <div key={idx} className="text-green-600">"{item}"</div>
            ))}
          </div>
        )
      }
      return (
        <div className="ml-4">
          {value.map((item, idx) => (
            <div key={idx} className="border-l-2 border-gray-200 pl-4 mb-2">
              {renderValue(item, depth + 1)}
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  const renderConfigSection = (sectionName, sectionData) => {
    const isExpanded = expandedSections[sectionName]

    return (
      <div key={sectionName} className="bg-white rounded-lg shadow-sm border border-gray-200 mb-3">
        <button
          onClick={() => toggleSection(sectionName)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-semibold text-gray-800">{sectionName}</span>
          </div>
          <span className="text-xs text-gray-500">
            {typeof sectionData === 'object' ? `${Object.keys(sectionData).length} items` : ''}
          </span>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 pt-2 border-t border-gray-100">
            {typeof sectionData === 'object' && !Array.isArray(sectionData) ? (
              <div className="space-y-3">
                {Object.entries(sectionData).map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <span className="font-medium text-sm text-indigo-600 mb-1">{key}:</span>
                    <div className="ml-4 text-sm">
                      {typeof value === 'object' && !Array.isArray(value) ? (
                        <div className="bg-gray-50 rounded p-3 space-y-2">
                          {Object.entries(value).map(([subKey, subValue]) => (
                            <div key={subKey} className="flex flex-col">
                              <span className="font-medium text-xs text-gray-600">{subKey}:</span>
                              <div className="ml-3">{renderValue(subValue)}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        renderValue(value)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              renderValue(sectionData)
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div>
            <p className="ml-4 text-indigo-700 font-medium">Loading configuration...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center">
            <div className="text-red-600 text-2xl mb-4">⚠️ Error</div>
            <p className="text-gray-700 font-medium">{error}</p>
            <button
              onClick={onBack}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-medium">Back</span>
            </button>
            <div>
              <h2 className="text-2xl font-bold text-white">Configuration</h2>
              <p className="text-indigo-100 text-sm">View and edit config.json</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Saved!</span>
              </div>
            )}
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="font-medium">Edit</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/20"
                >
                  <span className="font-medium">Cancel</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span className="font-medium">Saving...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="font-medium">Save</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {isEditing ? (
            <div>
              {validationError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {validationError}
                </div>
              )}
              <textarea
                value={editedConfig}
                onChange={(e) => setEditedConfig(e.target.value)}
                className="w-full h-[600px] p-4 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                spellCheck={false}
              />
              <p className="mt-2 text-sm text-gray-500">
                Edit the JSON configuration. Make sure it's valid JSON before saving.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Structured view of your configuration
                </p>
                <button
                  onClick={toggleAllSections}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  {Object.values(expandedSections).every(v => v) ? 'Collapse All' : 'Expand All'}
                </button>
              </div>
              <div className="space-y-2">
                {config && Object.entries(config).map(([sectionName, sectionData]) =>
                  renderConfigSection(sectionName, sectionData)
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

ConfigViewer.propTypes = {
  password: PropTypes.string,
  onBack: PropTypes.func.isRequired
}

export default ConfigViewer
