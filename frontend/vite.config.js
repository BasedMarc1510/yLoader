import { defineConfig, splitVendorChunkPlugin } from 'vite'
import react from '@vitejs/plugin-react'

function rewriteLegacyDownloaderUrlQuery() {
  return {
    name: 'yloader-rewrite-legacy-downloader-url-query',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const rawUrl = String(req.url || '')
        if (!rawUrl || !rawUrl.includes('?') || !rawUrl.includes('url=')) {
          next()
          return
        }

        try {
          const parsed = new URL(rawUrl, 'http://localhost')
          const sourceParam = String(parsed.searchParams.get('source') || '').trim()
          const legacyUrlParam = String(parsed.searchParams.get('url') || '').trim()

          if (legacyUrlParam) {
            if (!sourceParam) {
              parsed.searchParams.set('source', legacyUrlParam)
            }
            parsed.searchParams.delete('url')
            req.url = `${parsed.pathname}${parsed.search}`
          }
        } catch {
          // Ignore malformed URLs and continue normal middleware chain.
        }

        next()
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), rewriteLegacyDownloaderUrlQuery(), splitVendorChunkPlugin()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Proxy API calls during local dev to the local backend.
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:4000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  }
})
