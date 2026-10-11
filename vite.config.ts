import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
// Прокси на бэк: на хосте — localhost:8080, внутри docker-compose — http://backend:8080 (VITE_PROXY_TARGET).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/chat': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
