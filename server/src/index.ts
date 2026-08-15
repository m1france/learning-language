import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { readFileSync, existsSync } from 'fs'
import { resolve, extname } from 'path'

const app = new Hono()
const DIST_DIR = '/app/dist'

const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
}

app.use('/*', cors())

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.get('*', (c) => {
    const url = new URL(c.req.url)
    let filePath = resolve(DIST_DIR, '.' + url.pathname)

    if (!filePath.startsWith(DIST_DIR)) {
        filePath = resolve(DIST_DIR, 'index.html')
    }

    if (!existsSync(filePath)) {
        filePath = resolve(DIST_DIR, 'index.html')
    }

    const ext = extname(filePath)
    const contentType = mimeTypes[ext] || 'application/octet-stream'
    const content = readFileSync(filePath)

    return c.body(content, 200, { 'Content-Type': contentType })
})

const port = parseInt(process.env.PORT || '3001')
serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server running on port ${info.port}`)
})