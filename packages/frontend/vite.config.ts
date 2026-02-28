import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/masks': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
