import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '10.88.111.20',
    proxy: {
      '/api': {
        target: 'http://10.88.111.20:3001',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 3000,
    host: '10.88.111.20'
  }
})

