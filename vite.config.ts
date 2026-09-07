import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function viteSyncPlugin(): Plugin {
  const syncFile = path.resolve(__dirname, 'server/data/sync_state.json')

  function ensureDir() {
    const dir = path.dirname(syncFile)
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch {}
    }
  }

  function readSyncData(): { payload: any; revision: number } {
    try {
      if (fs.existsSync(syncFile)) {
        const raw = fs.readFileSync(syncFile, 'utf-8')
        return JSON.parse(raw)
      }
    } catch {}
    return { payload: null, revision: 0 }
  }

  function writeSyncData(payload: any): number {
    ensureDir()
    const current = readSyncData()
    const nextRevision = (current.revision || 0) + 1
    const data = { payload, revision: nextRevision, lastModified: Date.now() }
    const tmp = `${syncFile}.tmp.${Date.now()}`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    try {
      fs.renameSync(tmp, syncFile)
    } catch {
      fs.writeFileSync(syncFile, JSON.stringify(data, null, 2), 'utf-8')
    }
    return nextRevision
  }

  return {
    name: 'vite-sync-plugin',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url?.split('?')[0] || ''

        if (url === '/api/sync/status' && req.method === 'GET') {
          const current = readSyncData()
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(
            JSON.stringify({
              ok: true,
              revision: current.revision || 0,
              lastModified: current.payload?.lastModified || 0,
              deviceName: current.payload?.deviceName || null,
            })
          )
          return
        }

        if (url === '/api/sync' && req.method === 'GET') {
          const current = readSyncData()
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(
            JSON.stringify({
              ok: true,
              payload: current.payload,
              revision: current.revision || 0,
              serverTimestamp: Date.now(),
            })
          )
          return
        }

        if (url === '/api/sync' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: any) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body)
              const payload = parsed.payload || parsed
              const revision = writeSyncData(payload)
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(
                JSON.stringify({
                  ok: true,
                  revision,
                  serverTimestamp: Date.now(),
                })
              )
            } catch (err) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Données JSON invalides' }))
            }
          })
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), viteSyncPlugin()],
  server: {
    host: true, // Écoute sur 0.0.0.0 pour un accès immédiat depuis iPhone sur le réseau local
    proxy: {
      '/api-deepl-free': {
        target: 'https://api-free.deepl.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-deepl-free/, ''),
      },
      '/api-deepl-pro': {
        target: 'https://api.deepl.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-deepl-pro/, ''),
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
