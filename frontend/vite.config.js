import { defineConfig } from 'vite'
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
  plugins: [react(), rewriteLegacyDownloaderUrlQuery()],
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('react-dom') || id.includes('react/') || id.includes('scheduler')) {
            return 'vendor-react'
          }

          if (id.includes('@mui/') || id.includes('@emotion/')) {
            return 'vendor-mui'
          }

          if (id.includes('react-router') || id.includes('@remix-run/router')) {
            return 'vendor-router'
          }

          if (id.includes('lucide-react') || id.includes('@icons-pack/react-simple-icons')) {
            return 'vendor-icons'
          }

          if (id.includes('cropperjs') || id.includes('react-cropper') || id.includes('qrcode')) {
            return 'vendor-media'
          }

          if (id.includes('simplebar-react') || id.includes('simplebar-core')) {
            return 'vendor-ui-utils'
          }

          return 'vendor'
        },
      },
    },
  }
})
