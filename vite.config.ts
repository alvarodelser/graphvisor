import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/graphvisor/',
  plugins: [react()],
  server: {
    // GraphVisor reads collections from the ingestion worker's API
    // (services/worker, published on localhost:8090).
    proxy: {
      '/graphvisor/api': {
        target: process.env.GRAPHVISOR_WORKER ?? 'http://localhost:8090',
        rewrite: path => path.replace(/^\/graphvisor\/api/, '/api'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
})
