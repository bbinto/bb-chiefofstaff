import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

// Get API URL from environment variable, fallback to relative URL
const API_URL = import.meta.env.VITE_API_URL || ''

function Settings({ password, onBack }) {
  const [activeTab, setActiveTab] = useState('llm')
  
  // LLM Settings state
  const [llmSettings, setLlmSettings] = useState(null)
  const [llmBackend, setLlmBackend] = useState('claude') // 'claude' | 'ollama' | 'gemini'
  const [ollamaModel, setOllamaModel] = useState('deepseek-v3.1:671b-cloud')
  const [claudeModel, setClaudeModel] = useState('claude-sonnet-4-5-20250929')
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash')
  
  // Config state
  const [config, setConfig] = useState(null)
  const [editedConfig, setEditedConfig] = useState('')
  const [isEditingConfig, setIsEditingConfig] = useState(false)
  const [expandedSections, setExpandedSections] = useState({})
  
  // Shared state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [validationError, setValidationError] = useState(null)

  const localOllamaModels = [

  ]

  const cloudOllamaModels = [
    { value: 'gpt-oss:120b-cloud', label: 'GPT-OSS 120B (Cloud, High quality)' },
    { value: 'qwen3-vl:235b-cloud', label: 'Qwen3 VL 235B (Cloud, Vision + Language)' },
    { value: 'deepseek-v3.1:671b-cloud', label: 'DeepSeek V3.1 671B (Cloud, High quality)' },
    { value: 'nemotron-3-nano:30b-cloud', label: 'Nemotron 3 Nano 30B (Cloud, Low latency)' },
    { value: 'glm-5:cloud', label: 'GLM-5 (Cloud, General purpose)' },

  ]

  useEffect(() => {
    if (activeTab === 'llm') {
      fetchSettings()
    } else if (activeTab === 'config') {
      fetchConfig()
    }
  }, [activeTab])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const headers = password ? { 'x-app-password': password } : {}
      console.log('📡 Fetching settings from:', `${API_URL}/api/settings/llm`)
      console.log('   Headers:', { 'x-app-password': password ? '***' : 'none' })
      
      const response = await fetch(`${API_URL}/api/settings/llm`, { headers })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unable to parse error response' }))
        const errorMsg = errorData.error || errorData.message || `HTTP ${response.status}`
        throw new Error(`Server error: ${errorMsg}`)
      }
      const data = await response.json()
      
      setLlmSettings(data)
      if (data.useGemini) {
        setLlmBackend('gemini')
      } else if (data.useOllama) {
        setLlmBackend('ollama')
      } else {
        setLlmBackend('claude')
      }
      setOllamaModel(data.ollamaModel || 'mistral')
      setClaudeModel(data.claudeModel || 'claude-sonnet-4-5-20250929')
      setGeminiModel(data.geminiModel || 'gemini-2.5-flash')
      setError(null)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      setSaving(true)
      const headers = {
        'Content-Type': 'application/json',
        ...(password ? { 'x-app-password': password } : {})
      }

      const settingsData = {
        useOllama: llmBackend === 'ollama',
        useGemini: llmBackend === 'gemini',
        ollamaModel: llmBackend === 'ollama' ? ollamaModel : undefined,
        claudeModel: llmBackend === 'claude' ? claudeModel : undefined,
        geminiModel: llmBackend === 'gemini' ? geminiModel : undefined,
      }

      console.log('📡 Saving settings:', settingsData)
      const response = await fetch(`${API_URL}/api/settings/llm`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(settingsData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unable to parse error response' }))
        const errorMsg = errorData.error || errorData.message || `HTTP ${response.status}`
        throw new Error(`Server error: ${errorMsg}`)
      }

      setLlmSettings(settingsData)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
      console.error('❌ Error saving settings:', err)
    } finally {
      setSaving(false)
    }
  }

  const fetchConfig = async () => {
    try {
      setLoading(true)
      const headers = password ? { 'x-app-password': password } : {}
      const response = await fetch(`${API_URL}/api/config`, { headers })

      if (!response.ok) throw new Error('Failed to fetch config')
      const data = await response.json()
      setConfig(data)
      setEditedConfig(JSON.stringify(data, null, 2))
      setError(null)
      setValidationError(null)

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

  const handleSaveConfig = async () => {
    try {
      // Validate JSON first
      const parsedConfig = JSON.parse(editedConfig)
      setValidationError(null)

      setSaving(true)
      const headers = {
        'Content-Type': 'application/json',
        ...(password ? { 'x-app-password': password } : {})
      }

      const response = await fetch(`${API_URL}/api/config`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(parsedConfig)
      })

      if (!response.ok) throw new Error('Failed to save config')

      setConfig(parsedConfig)
      setIsEditingConfig(false)
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

  const handleCancelConfig = () => {
    setEditedConfig(JSON.stringify(config, null, 2))
    setIsEditingConfig(false)
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
    Object.keys(expandedSections).forEach(section => {
      newState[section] = !allExpanded
    })
    setExpandedSections(newState)
  }

  return (
    <div className="min-h-screen bg-gray-50 space-y-6 p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">⚙️ Settings</h1>
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
        >
          ← Back
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          ⚠️ Error: {error}
        </div>
      )}

      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
          ✅ Settings saved successfully
        </div>
      )}

      {validationError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          ⚠️ {validationError}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('llm')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'llm'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          🔑 LLM Settings
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'config'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          ⚙️ Configuration
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      ) : activeTab === 'llm' ? (
        <div className="max-w-2xl space-y-6">
          {/* LLM Selection */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">LLM Backend</h2>
            <p className="text-sm text-gray-600 mb-6">Choose which LLM to use for agents. This affects all future agent runs.</p>

            <div className="space-y-4">
              {/* Claude Option */}
              <label className="flex items-start p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors" style={{ borderColor: llmBackend === 'claude' ? '#3b82f6' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="llm"
                  value="claude"
                  checked={llmBackend === 'claude'}
                  onChange={() => setLlmBackend('claude')}
                  className="mt-1"
                />
                <div className="ml-4 flex-1">
                  <div className="font-semibold text-gray-900">🔑 Anthropic Claude API <span className="text-xs font-normal text-blue-600">(Default)</span></div>
                  <p className="text-sm text-gray-600 mt-1">Use cloud-based Claude for best quality and full feature support</p>
                  <ul className="text-xs text-gray-500 mt-2 space-y-1">
                    <li>✓ Best output quality</li>
                    <li>✓ Full tool calling support</li>
                    <li>✓ 200k token context window</li>
                    <li>❌ Requires API key & payment</li>
                  </ul>
                </div>
              </label>

              {/* Ollama Option */}
              <label className="flex items-start p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors" style={{ borderColor: llmBackend === 'ollama' ? '#3b82f6' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="llm"
                  value="ollama"
                  checked={llmBackend === 'ollama'}
                  onChange={() => setLlmBackend('ollama')}
                  className="mt-1"
                />
                <div className="ml-4 flex-1">
                  <div className="font-semibold text-gray-900">🦙 Local Ollama</div>
                  <p className="text-sm text-gray-600 mt-1">Use free, local LLM for privacy and zero cost</p>
                  <ul className="text-xs text-gray-500 mt-2 space-y-1">
                    <li>✓ Completely free</li>
                    <li>✓ 100% private (no API calls)</li>
                    <li>✓ Runs locally on your machine</li>
                    <li>❌ Lower output quality</li>
                    <li>❌ Limited tool support</li>
                  </ul>
                </div>
              </label>

              {/* Gemini Option */}
              <label className="flex items-start p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors" style={{ borderColor: llmBackend === 'gemini' ? '#3b82f6' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="llm"
                  value="gemini"
                  checked={llmBackend === 'gemini'}
                  onChange={() => setLlmBackend('gemini')}
                  className="mt-1"
                />
                <div className="ml-4 flex-1">
                  <div className="font-semibold text-gray-900">💎 Google Gemini API</div>
                  <p className="text-sm text-gray-600 mt-1">Use Google&apos;s Gemini models as an alternative cloud LLM</p>
                  <ul className="text-xs text-gray-500 mt-2 space-y-1">
                    <li>✓ Competitive output quality</li>
                    <li>✓ Function calling support</li>
                    <li>✓ Generous free tier available</li>
                    <li>❌ Requires Gemini API key</li>
                    <li>❌ Different tool format (limited MCP support)</li>
                  </ul>
                </div>
              </label>
            </div>
          </div>

          {/* Claude Configuration */}
          {llmBackend === 'claude' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Claude Configuration</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                <select
                  value={claudeModel}
                  onChange={(e) => setClaudeModel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="claude-opus-4-6">Claude Opus 4.6 (Arena #1 Text Today)</option>
                  <option value="claude-opus-4-6-thinking">Claude Opus 4.6 Thinking (Arena #1 Thinking Today)</option>
                  <option value="claude-opus-4-1-20250805">Claude Opus 4.1 (Latest, Most capable)</option>
                  <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (Recommended)</option>
                  <option value="claude-3-5-haiku-20241022">Claude Haiku 3.5 (Fast, Budget-friendly)</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fast, Budget-friendly)</option>
                  <option value="claude-3-haiku-20240307">Claude 3 Haiku (Cheapest, ~$0.25/M input)</option>
                </select>
                <p className="text-xs text-gray-600 mt-1">
                  ℹ️ Claude Sonnet 4.5 offers the best balance of speed and quality for agents.
                </p>
              </div>

              <div className="mt-4 p-3 bg-blue-100 rounded text-sm text-blue-800">
                ℹ️ Your API key is configured via the <code className="bg-blue-200 px-1 rounded">ANTHROPIC_API_KEY</code> environment variable.
              </div>
            </div>
          )}

          {/* Ollama Configuration */}
          {llmBackend === 'ollama' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Ollama Configuration</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <optgroup label="☁️ Cloud Models (no local install needed)">
                    {cloudOllamaModels.map(model => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🖥️ Local Models (requires Ollama running locally)">
                    {localOllamaModels.map(model => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </optgroup>
                  {!localOllamaModels.find(m => m.value === ollamaModel) && !cloudOllamaModels.find(m => m.value === ollamaModel) && (
                    <optgroup label="Current">
                      <option value={ollamaModel}>{ollamaModel}</option>
                    </optgroup>
                  )}
                </select>
                <p className="text-xs text-gray-600 mt-1">
                  ☁️ Cloud models run remotely — easy on your Pi. 🖥️ Local models require <code className="bg-gray-200 px-1 rounded">ollama serve</code>.
                </p>
              </div>
            </div>
          )}

          {/* Gemini Configuration */}
          {llmBackend === 'gemini' && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Gemini Configuration</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Best quality flash)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Highest quality)</option>
                  <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (Cheapest, best rate limits)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy, fast)</option>
                </select>
                <p className="text-xs text-gray-600 mt-1">
                  💡 <strong>Flash 2.5</strong> offers the best balance of quality and speed.
                </p>
              </div>

              <div className="p-3 bg-purple-100 rounded text-sm text-purple-800">
                ℹ️ Your API key is configured via the <code className="bg-purple-200 px-1 rounded">GOOGLE_GEMINI_API_KEY</code> environment variable.
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 space-y-1">
                <p>⚠️ <strong>Note:</strong> Gemini uses Google&apos;s OpenAI-compatible API endpoint. MCP tool calling works differently from Claude — some agents may have limited functionality.</p>
              </div>
            </div>
          )}

          {/* Current Status */}
          <div className="bg-gray-100 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Current Configuration</h3>
            <div className="text-sm text-gray-700 space-y-1 font-mono">
              <div className="flex justify-between">
                <span>Backend:</span>
                <span className="font-bold">
                  {llmBackend === 'ollama' ? '🦙 Ollama' : llmBackend === 'gemini' ? '💎 Gemini' : '🔑 Claude'}
                </span>
              </div>
              {llmBackend === 'gemini' ? (
                <div className="flex justify-between">
                  <span>Model:</span>
                  <span>{geminiModel}</span>
                </div>
              ) : llmBackend === 'ollama' ? (
                <>
                  <div className="flex justify-between">
                    <span>Model:</span>
                    <span>{ollamaModel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>URL:</span>
                    <span>http://localhost:11434</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span>Model:</span>
                  <span>{claudeModel}</span>
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex gap-3">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {saving ? 'Saving...' : '💾 Save Settings'}
            </button>
            <button
              onClick={onBack}
              className="px-6 py-3 bg-gray-300 text-gray-900 font-semibold rounded-lg hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            <strong>ℹ️ How it works:</strong> When you save these settings, all new agent runs will use the selected LLM. Claude is always the default. For Ollama setup instructions, see <strong>OLLAMA_SETUP.md</strong>. For Gemini, add <code className="bg-blue-200 px-1 rounded">GOOGLE_GEMINI_API_KEY</code> to your <code className="bg-blue-200 px-1 rounded">.env</code> file.
          </div>
        </div>
      ) : (
        // Config Tab Content
        <div className="max-w-4xl space-y-6">
          {config && (
            <>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Configuration</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={toggleAllSections}
                      className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                    >
                      {Object.values(expandedSections).every(v => v) ? '▼ Collapse All' : '▶ Expand All'}
                    </button>
                    {!isEditingConfig && (
                      <button
                        onClick={() => setIsEditingConfig(true)}
                        className="text-sm px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                      >
                        ✏️ Edit
                      </button>
                    )}
                  </div>
                </div>

                {isEditingConfig ? (
                  <div className="space-y-4">
                    <textarea
                      value={editedConfig}
                      onChange={(e) => setEditedConfig(e.target.value)}
                      className="w-full h-96 p-3 border border-gray-300 rounded-lg font-mono text-sm"
                      spellCheck="false"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={handleSaveConfig}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                      >
                        {saving ? 'Saving...' : '💾 Save Config'}
                      </button>
                      <button
                        onClick={handleCancelConfig}
                        className="px-6 py-2 bg-gray-300 text-gray-900 font-semibold rounded-lg hover:bg-gray-400 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(config).map(([section, content]) => (
                      <div key={section} className="border border-gray-200 rounded-lg">
                        <button
                          onClick={() => toggleSection(section)}
                          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                        >
                          <span className="font-semibold text-gray-900">{expandedSections[section] ? '▼' : '▶'} {section}</span>
                          <span className="text-xs text-gray-500">
                            {typeof content === 'object' ? `${Object.keys(content).length} items` : 'string'}
                          </span>
                        </button>
                        {expandedSections[section] && (
                          <div className="p-3 bg-gray-50 border-t border-gray-200 font-mono text-xs overflow-auto max-h-64">
                            <pre>{JSON.stringify(content, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                <strong>ℹ️ How it works:</strong> This shows the complete configuration file used by the application. You can edit it directly here. Changes are saved to the config file immediately.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

Settings.propTypes = {
  password: PropTypes.string,
  onBack: PropTypes.func.isRequired
}

export default Settings
