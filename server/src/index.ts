import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'fs'
import { resolve, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = new Hono()

// Détection dynamique du dossier dist (dans Docker ou en local)
const DIST_DIR = existsSync('/app/dist')
  ? '/app/dist'
  : resolve(__dirname, '../../dist')

const DATA_DIR = existsSync('/app/data')
  ? '/app/data'
  : resolve(__dirname, '../data')

if (!existsSync(DATA_DIR)) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
  } catch {
    // Ignorer
  }
}

const LESSONS_FILE = resolve(DATA_DIR, 'shared_lessons.json')

// Structure de stockage des leçons partagées
type SharedLesson = {
  id: string
  username: string
  [key: string]: any
}

// Initialisation stockage fichier
function loadFileLessons(): Record<string, SharedLesson> {
  try {
    if (!existsSync(LESSONS_FILE)) return {}
    const raw = readFileSync(LESSONS_FILE, 'utf-8')
    return JSON.parse(raw) || {}
  } catch (err) {
    console.error('Erreur lecture shared_lessons.json:', err)
    return {}
  }
}

function saveFileLessons(lessons: Record<string, SharedLesson>): void {
  try {
    writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2), 'utf-8')
  } catch (err) {
    console.error('Erreur écriture shared_lessons.json:', err)
  }
}

// Connexion MySQL optionnelle si DATABASE_URL est fourni
let dbPool: mysql.Pool | null = null
if (process.env.DATABASE_URL) {
  try {
    dbPool = mysql.createPool(process.env.DATABASE_URL)
    // Initialiser table shared_lessons
    dbPool.query(`
      CREATE TABLE IF NOT EXISTS shared_lessons (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(64) NOT NULL,
        data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `).catch((err) => console.error('Erreur init table shared_lessons:', err))
  } catch (err) {
    console.error('Erreur connexion MySQL:', err)
  }
}

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
  '.ttf': 'font/ttf',
}

app.use('/*', cors())

// Healthcheck
app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))

// ============================================================================
// API ROUTES POUR LE PARTAGE DE LEÇONS (SHARE.MATHISBNL.INFO)
// ============================================================================

// 1. Récupérer une leçon partagée par son ID
app.get('/api/share/lessons/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'ID manquant' }, 400)

  // Vérifier en base de données si disponible
  if (dbPool) {
    try {
      const [rows] = await dbPool.query('SELECT data FROM shared_lessons WHERE id = ?', [id])
      const list = rows as any[]
      if (list.length > 0) {
        const item = typeof list[0].data === 'string' ? JSON.parse(list[0].data) : list[0].data
        return c.json({ lesson: item })
      }
    } catch (err) {
      console.error('Erreur DB get lesson:', err)
    }
  }

  // Fallback stockage fichier
  const fileLessons = loadFileLessons()
  const lesson = fileLessons[id]
  if (!lesson) {
    return c.json({ error: 'Leçon introuvable ou dépubliée' }, 404)
  }

  return c.json({ lesson })
})

// 2. Enregistrer ou mettre à jour une leçon partagée
app.post('/api/share/lessons', async (c) => {
  try {
    const body = await c.req.json()
    const lesson = body.lesson || body
    if (!lesson || !lesson.id || !lesson.username) {
      return c.json({ error: 'Données de leçon incomplètes (id et username requis)' }, 400)
    }

    // Sauvegarde fichier
    const fileLessons = loadFileLessons()
    fileLessons[lesson.id] = lesson
    saveFileLessons(fileLessons)

    // Sauvegarde DB
    if (dbPool) {
      try {
        await dbPool.query(
          'INSERT INTO shared_lessons (id, username, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), username = VALUES(username)',
          [lesson.id, lesson.username, JSON.stringify(lesson)]
        )
      } catch (err) {
        console.error('Erreur DB save lesson:', err)
      }
    }

    return c.json({ success: true, id: lesson.id })
  } catch (err) {
    console.error('Erreur POST /api/share/lessons:', err)
    return c.json({ error: 'Erreur serveur lors de la sauvegarde de la leçon' }, 500)
  }
})

// 3. Lister les leçons partagées
app.get('/api/share/lessons', async (c) => {
  const username = c.req.query('username')

  if (dbPool) {
    try {
      let query = 'SELECT data FROM shared_lessons'
      const params: any[] = []
      if (username) {
        query += ' WHERE username = ?'
        params.push(username)
      }
      query += ' ORDER BY created_at DESC'
      const [rows] = await dbPool.query(query, params)
      const list = (rows as any[]).map((r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data))
      return c.json({ lessons: list })
    } catch (err) {
      console.error('Erreur DB list lessons:', err)
    }
  }

  const fileLessons = loadFileLessons()
  let list = Object.values(fileLessons)
  if (username) {
    list = list.filter((l) => l.username.toLowerCase() === username.toLowerCase())
  }

  return c.json({ lessons: list })
})

// 4. Supprimer / Dépublier une leçon
app.delete('/api/share/lessons/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'ID manquant' }, 400)

  // Suppression fichier
  const fileLessons = loadFileLessons()
  delete fileLessons[id]
  saveFileLessons(fileLessons)

  // Suppression DB
  if (dbPool) {
    try {
      await dbPool.query('DELETE FROM shared_lessons WHERE id = ?', [id])
    } catch (err) {
      console.error('Erreur DB delete lesson:', err)
    }
  }

  return c.json({ success: true })
})

// 5. Ajouter une réaction d'élève (emoji)
app.post('/api/share/lessons/:id/reactions', async (c) => {
  const id = c.req.param('id')
  const { emoji } = await c.req.json()
  if (!id || !emoji) return c.json({ error: 'Paramètres manquants' }, 400)

  const fileLessons = loadFileLessons()
  const lesson = fileLessons[id]
  if (!lesson) return c.json({ error: 'Leçon introuvable' }, 404)

  const reactions = { ...(lesson.reactions || {}) }
  reactions[emoji] = (reactions[emoji] || 0) + 1
  lesson.reactions = reactions
  lesson.updatedAt = new Date().toISOString()
  fileLessons[id] = lesson
  saveFileLessons(fileLessons)

  if (dbPool) {
    try {
      await dbPool.query('UPDATE shared_lessons SET data = ? WHERE id = ?', [JSON.stringify(lesson), id])
    } catch (err) {
      console.error('Erreur DB update reactions:', err)
    }
  }

  return c.json({ reactions })
})

// 6. Ajouter un commentaire d'élève
app.post('/api/share/lessons/:id/comments', async (c) => {
  const id = c.req.param('id')
  const { authorName, text } = await c.req.json()
  if (!id || !text?.trim()) return c.json({ error: 'Commentaire vide' }, 400)

  const fileLessons = loadFileLessons()
  const lesson = fileLessons[id]
  if (!lesson) return c.json({ error: 'Leçon introuvable' }, 404)

  const newComment = {
    id: `comm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    authorName: (authorName || 'Élève').trim(),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  }

  lesson.studentComments = [...(lesson.studentComments || []), newComment]
  lesson.updatedAt = new Date().toISOString()
  fileLessons[id] = lesson
  saveFileLessons(fileLessons)

  if (dbPool) {
    try {
      await dbPool.query('UPDATE shared_lessons SET data = ? WHERE id = ?', [JSON.stringify(lesson), id])
    } catch (err) {
      console.error('Erreur DB update comments:', err)
    }
  }

  return c.json({ comment: newComment })
})

// 7. Ajouter un commentaire Figma positionné
app.post('/api/share/lessons/:id/figma-comments', async (c) => {
  const id = c.req.param('id')
  const { pageIndex, xPercent, yPercent, authorName, text } = await c.req.json()
  if (!id || !text?.trim()) return c.json({ error: 'Commentaire vide' }, 400)

  const fileLessons = loadFileLessons()
  const lesson = fileLessons[id]
  if (!lesson) return c.json({ error: 'Leçon introuvable' }, 404)

  const newFigmaComment = {
    id: `figma-comm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    pageIndex: pageIndex || 0,
    xPercent: Number(xPercent) || 0,
    yPercent: Number(yPercent) || 0,
    authorName: (authorName || 'Élève').trim(),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  }

  lesson.figmaComments = [...(lesson.figmaComments || []), newFigmaComment]
  lesson.updatedAt = new Date().toISOString()
  fileLessons[id] = lesson
  saveFileLessons(fileLessons)

  if (dbPool) {
    try {
      await dbPool.query('UPDATE shared_lessons SET data = ? WHERE id = ?', [JSON.stringify(lesson), id])
    } catch (err) {
      console.error('Erreur DB update figma-comments:', err)
    }
  }

  return c.json({ comment: newFigmaComment })
})

// 8. Ajouter un sticker de réaction positionné
app.post('/api/share/lessons/:id/stickers', async (c) => {
  const id = c.req.param('id')
  const { pageIndex, xPercent, yPercent, emoji } = await c.req.json()
  if (!id || !emoji) return c.json({ error: 'Sticker manquant' }, 400)

  const fileLessons = loadFileLessons()
  const lesson = fileLessons[id]
  if (!lesson) return c.json({ error: 'Leçon introuvable' }, 404)

  const newSticker = {
    id: `sticker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    pageIndex: pageIndex || 0,
    xPercent: Number(xPercent) || 0,
    yPercent: Number(yPercent) || 0,
    emoji: emoji,
    createdAt: new Date().toISOString(),
  }

  lesson.stickers = [...(lesson.stickers || []), newSticker]
  lesson.updatedAt = new Date().toISOString()
  fileLessons[id] = lesson
  saveFileLessons(fileLessons)

  if (dbPool) {
    try {
      await dbPool.query('UPDATE shared_lessons SET data = ? WHERE id = ?', [JSON.stringify(lesson), id])
    } catch (err) {
      console.error('Erreur DB update stickers:', err)
    }
  }

  return c.json({ sticker: newSticker })
})

// ============================================================================
// SERVING DES FICHIERS STATIQUES (SPA FRONTEND)
// ============================================================================
app.get('*', (c) => {
  const url = new URL(c.req.url)
  let filePath = resolve(DIST_DIR, '.' + url.pathname)

  if (!filePath.startsWith(DIST_DIR)) {
    filePath = resolve(DIST_DIR, 'index.html')
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = resolve(DIST_DIR, 'index.html')
  }

  if (!existsSync(filePath)) {
    return c.text('Application en cours de construction ou index.html introuvable.', 404)
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
