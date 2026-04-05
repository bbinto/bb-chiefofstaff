import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: ['hyperconscientious-mel-exhaustingly.ngrok-free.dev', '10.88.111.48', 'bb-cos.ngrok.app'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 3000,
    host: '0.0.0.0'
  }
})

