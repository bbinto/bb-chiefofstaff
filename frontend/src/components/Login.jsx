import { useState } from 'react'
import mariLogo from '../img/mari-128.png'

// Get API URL from environment variable, fallback to relative URL (uses proxy)
const API_URL = import.meta.env.VITE_API_URL || ''

function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Test the password by making a request to the API
      const response = await fetch(`${API_URL}/api/agents`, {
        headers: {
          'x-app-password': password
        }
      })

      if (response.ok) {
        // Password is correct
        onLogin(password)
      } else {
        setError('Invalid password')
      }
    } catch (err) {
      setError('Failed to connect to server')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full border border-teal-100">
        <div className="text-center mb-8">
          <img
            src={mariLogo}
            alt="Mari"
            className="w-20 h-20 rounded-lg shadow-lg mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Mari, the CoS</h1>
          <p className="text-sm text-gray-600">Enter password to access reports</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
              placeholder="Enter password"
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full bg-gradient-to-r from-[#00203F] to-teal-600 text-white py-3 rounded-lg font-medium hover:from-teal-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                Verifying...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
