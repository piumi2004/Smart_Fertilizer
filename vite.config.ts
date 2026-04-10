import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        // Keep the browser's Host (e.g. localhost:5173) so Set-Cookie stays on the dev origin.
        changeOrigin: false,
        secure: false,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
        secure: false,
      },
    },
  },
})
