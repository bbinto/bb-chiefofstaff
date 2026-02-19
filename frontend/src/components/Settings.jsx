import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

// Get API URL from environment variable, fallback to relative URL
const API_URL = import.meta.env.VITE_API_URL || ''

function Settings({ password, onBack }) {
  const [llmSettings, setLlmSettings] = useState(null)
  const [useOllama, setUseOllama] = useState(false)
  const [ollamaModel, setOllamaModel] = useState('mistral')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434')
  const [claudeModel, setClaudeModel] = useState('claude-sonnet-4-5-20250929')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const commonOllamaModels = [
    { value: 'mistral', label: 'Mistral 7B (Fast, Good quality)' },
    { value: 'neural-chat', label: 'Neural Chat 7B (Fast, Instruction-tuned)' },
    { value: 'openchat', label: 'OpenChat 8B (Fast, Lightweight)' },
    { value: 'dolphin-mixtral', label: 'Dolphin Mixtral 8x7B (Slow, High quality)' },
    { value: 'llama2', label: 'Llama 2 13B (Medium, Good reasoning)' },
    { value: 'neural-chat:latest', label: 'Neural Chat Latest' },
  ]

  useEffect(() => {
    fetchSettings()
  }, [])

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
      setUseOllama(data.useOllama || false)
      setOllamaModel(data.ollamaModel || 'mistral')
      setOllamaBaseUrl(data.ollamaBaseUrl || 'http://localhost:11434')
      setClaudeModel(data.claudeModel || 'claude-sonnet-4-5-20250929')
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
        useOllama,
        ollamaModel: useOllama ? ollamaModel : undefined,
        ollamaBaseUrl: useOllama ? ollamaBaseUrl : undefined,
        claudeModel: !useOllama ? claudeModel : undefined,
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

  const handleTestOllamaConnection = async () => {
    try {
      setTestingConnection(true)
      setTestResult(null)

      const response = await fetch(`${ollamaBaseUrl}/models`, {
        method: 'GET',
      }).catch(e => {
        throw new Error(`Connection failed: ${e.message}`)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Ollama server returned an error`)
      }

      const data = await response.json()
      
      if (data.models && Array.isArray(data.models)) {
        const modelNames = data.models.map(m => m.name || m.model).join(', ')
        setTestResult({
          success: true,
          message: `✅ Connected! Found ${data.models.length} model(s): ${modelNames.substring(0, 100)}${modelNames.length > 100 ? '...' : ''}`
        })
      } else {
        setTestResult({
          success: true,
          message: '✅ Connected to Ollama server'
        })
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: `❌ Connection failed: ${err.message}. Make sure Ollama is running at ${ollamaBaseUrl}`
      })
    } finally {
      setTestingConnection(false)
    }
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

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {/* LLM Selection */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">LLM Backend</h2>
            <p className="text-sm text-gray-600 mb-6">Choose which LLM to use for agents. This affects all future agent runs.</p>

            <div className="space-y-4">
              {/* Claude Option */}
              <label className="flex items-start p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors" style={{ borderColor: !useOllama ? '#3b82f6' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="llm"
                  value="claude"
                  checked={!useOllama}
                  onChange={() => setUseOllama(false)}
                  className="mt-1"
                />
                <div className="ml-4 flex-1">
                  <div className="font-semibold text-gray-900">🔑 Anthropic Claude API</div>
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
              <label className="flex items-start p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors" style={{ borderColor: useOllama ? '#3b82f6' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="llm"
                  value="ollama"
                  checked={useOllama}
                  onChange={() => setUseOllama(true)}
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
            </div>
          </div>

          {/* Claude Configuration */}
          {!useOllama && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Claude Configuration</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                <select
                  value={claudeModel}
                  onChange={(e) => setClaudeModel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="claude-opus-4-1-20250805">Claude Opus 4.1 (Latest, Most capable)</option>
                  <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (Recommended)</option>
                  <option value="claude-haiku-3-5-20241022">Claude Haiku 3.5 (Fast, Budget-friendly)</option>
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
          {useOllama && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Ollama Configuration</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ollama Base URL</label>
                <input
                  type="text"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm"
                />
                <p className="text-xs text-gray-600 mt-1">
                  ℹ️ Default: <code className="bg-gray-200 px-1 rounded">http://localhost:11434</code> (adjust if Ollama is on a different host/port)
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Model</label>
                  <button
                    onClick={handleTestOllamaConnection}
                    disabled={testingConnection}
                    className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
                  >
                    {testingConnection ? 'Testing...' : '🔗 Test Connection'}
                  </button>
                </div>

                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  {commonOllamaModels.map(model => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                  <option value="" disabled>──────────────</option>
                  <option value={ollamaModel}>{ollamaModel} (current)</option>
                </select>
                <p className="text-xs text-gray-600 mt-1">
                  💡 Recommended: <strong>mistral</strong> (fast) or <strong>neural-chat</strong> (instruction-tuned)
                </p>
              </div>

              {testResult && (
                <div className={`p-3 rounded text-sm ${testResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {testResult.message}
                </div>
              )}

              <div className="p-3 bg-amber-100 rounded text-sm text-amber-800 space-y-1">
                <p>⚠️ <strong>Setup Required:</strong></p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Have Ollama installed from <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="underline">ollama.ai</a></li>
                  <li>Run <code className="bg-amber-200 px-1 rounded">ollama serve</code> in a terminal</li>
                  <li>Pull a model: <code className="bg-amber-200 px-1 rounded">ollama pull {ollamaModel}</code></li>
                </ul>
              </div>
            </div>
          )}

          {/* Current Status */}
          <div className="bg-gray-100 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Current Configuration</h3>
            <div className="text-sm text-gray-700 space-y-1 font-mono">
              <div className="flex justify-between">
                <span>Backend:</span>
                <span className="font-bold">{useOllama ? '🦙 Ollama' : '🔑 Claude'}</span>
              </div>
              {useOllama ? (
                <>
                  <div className="flex justify-between">
                    <span>Model:</span>
                    <span>{ollamaModel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>URL:</span>
                    <span>{ollamaBaseUrl}</span>
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
            <strong>ℹ️ How it works:</strong> When you save these settings, all new agent runs will use the selected LLM. The setting persists for the current session. For detailed setup instructions, see <strong>OLLAMA_SETUP.md</strong>.
          </div>
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
