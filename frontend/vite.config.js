import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/meetings': 'http://localhost:8000',
      '/actions': 'http://localhost:8000',
      '/search': 'http://localhost:8000',
    },
  },
})
