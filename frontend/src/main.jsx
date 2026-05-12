import React from 'react'
import ReactDOM from 'react-dom/client'
import posthog from 'posthog-js'
import App from './App.jsx'
import './index.css'

const phKey = import.meta.env.VITE_POSTHOG_KEY
if (phKey) {
  posthog.init(phKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

