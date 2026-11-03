import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { createAccounts } from './auth.js'
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'fs'
import { renameSync } from 'fs'
import { resolve, extname, dirname, sep } from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = new Hono()

// Détection dynamique du dossier dist (dans Docker ou en local)
const DIST_DIR = process.env.DIST_DIR || (existsSync('/app/dist')
  ? '/app/dist'
  : resolve(__dirname, '../../dist'))

const DATA_DIR = process.env.DATA_DIR || (existsSync('/app/data')
  ? '/app/data'
  : resolve(__dirname, '../data'))

process.umask(0o077)
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
const accounts = createAccounts(resolve(DATA_DIR, 'accounts.sqlite'))

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
    if (!existsSync(LESSONS_FILE)) return Object.create(null)
    const raw = readFileSync(LESSONS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid lesson store')
    return Object.assign(Object.create(null), parsed)
  } catch (err) {
    console.error('Erreur lecture shared_lessons.json:', err)
    throw err
  }
}

function saveFileLessons(lessons: Record<string, SharedLesson>): void {
  const data = JSON.stringify(lessons)
  if (Buffer.byteLength(data) > 20 * 1024 * 1024) throw new Error('Lesson storage limit reached')
  const temporary = `${LESSONS_FILE}.tmp`
  writeFileSync(temporary, data, { encoding: 'utf-8', mode: 0o600 })
  renameSync(temporary, LESSONS_FILE)
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
  '.mjs': 'application/javascript',
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

const production = process.env.NODE_ENV === 'production'
if (production && !process.env.APP_ORIGIN) throw new Error('Production requires APP_ORIGIN')
if (process.env.APP_ORIGIN && new URL(process.env.APP_ORIGIN).origin !== process.env.APP_ORIGIN) throw new Error('APP_ORIGIN must be an origin without a trailing slash')

app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Cache-Control', 'no-store')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin')
    const allowed = process.env.APP_ORIGIN || new URL(c.req.url).origin
    const devOrigin = !production && !process.env.APP_ORIGIN && ['http://localhost:5173','http://127.0.0.1:5173'].includes(origin || '')
    if ((production && !origin) || (origin && origin !== allowed && !devOrigin) || c.req.header('sec-fetch-site') === 'cross-site') {
      return c.json({ error: 'Origin not allowed' }, 403)
    }
  }
  await next()
})
// Close rejected HTTP/1 uploads so an unread oversized body cannot poison the next keep-alive request.
const jsonBodyLimit = (maxSize: number) => bodyLimit({ maxSize, onError: (c) => {
  c.header('Connection', 'close')
  return c.json({ error: 'Le contenu dépasse la taille maximale autorisée.' }, 413)
} })
app.use('/api/account/progress', jsonBodyLimit(10 * 1024 * 1024))
app.use('/api/*', async (c, next) => {
  if(c.req.path === '/api/account/progress') return next()
  return jsonBodyLimit(2 * 1024 * 1024)(c,next)
})
app.use('/api/*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
    if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) return c.json({ error: 'JSON required' }, 415)
    try {
      const body = await c.req.json()
      if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'JSON object required' }, 400)
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }
  }
  await next()
})
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  console.error('Request failed:', err.message)
  return c.json({ error: 'Request failed; no success was recorded' }, 500)
})

app.route('/', accounts.app)

// Fixed upstream and path: this endpoint cannot be used as an arbitrary HTTP proxy.
app.post('/api/deepl/:plan/translate', async (c) => {
  if (accounts.rateLimit(c, 'deepl', 120)) return c.json({error:'Too many requests'},429)
  const plan = c.req.param('plan')
  if (plan !== 'free' && plan !== 'pro') return c.json({ error: 'Unknown DeepL plan' }, 400)
  const key = c.req.header('x-deepl-key') || ''
  const body = await c.req.json()
  if (!key || key.length > 256 || !Array.isArray(body.text) || body.text.length < 1 || body.text.length > 50 || body.text.some((text: unknown) => typeof text !== 'string' || text.length > 5000) || typeof body.target_lang !== 'string' || !/^[A-Z]{2}(-[A-Z]{2})?$/.test(body.target_lang) || (body.source_lang !== undefined && (typeof body.source_lang !== 'string' || !/^[A-Z]{2}$/.test(body.source_lang)))) return c.json({ error: 'Invalid translation request' }, 400)
  const upstream = await fetch(`https://${plan === 'free' ? 'api-free' : 'api'}.deepl.com/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: body.text, target_lang: body.target_lang, source_lang: body.source_lang }),
    signal: AbortSignal.timeout(15000),
  })
  return new Response(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
})

// ============================================================================
// STOCKAGE INDIVIDUEL PAR APPAREIL - SYNCHRONISATION NON AUTHENTIFIÉE DÉSACTIVÉE
// ============================================================================
app.get('/api/sync/status', (c) => c.json({ ok: false, error: 'Stockage individuel par appareil actif' }, 404))
app.get('/api/sync', (c) => c.json({ ok: false, error: 'Stockage individuel par appareil actif' }, 404))
app.post('/api/sync', (c) => c.json({ ok: false, error: 'Stockage individuel par appareil actif' }, 404))

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
  const user = accounts.currentUser(c)
  if (!user) return c.json({error:'Connexion requise.'},401)
  if(c.req.header('x-account-id')!==user.id)return c.json({error:'Le compte a changé dans un autre onglet.',code:'ACCOUNT_CHANGED'},403)
  try {
    const body = await c.req.json()
    const lesson = body.lesson || body
    if (!lesson || typeof lesson.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(lesson.id) || ['__proto__', 'constructor', 'prototype'].includes(lesson.id) || typeof lesson.username !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(lesson.username)) {
      return c.json({ error: 'Données de leçon incomplètes (id et username requis)' }, 400)
    }

    // Sauvegarde fichier
    const fileLessons = loadFileLessons()
    const owner = accounts.store.db.prepare('SELECT user_id FROM lesson_owners WHERE lesson_id=?').get(lesson.id) as {user_id:string}|undefined
    // A legacy MySQL-only lesson cannot be claimed by selecting its public ID.
    if (!owner && dbPool && !Object.hasOwn(fileLessons,lesson.id)) {
      const [rows] = await dbPool.query('SELECT id FROM shared_lessons WHERE id = ?', [lesson.id])
      if ((rows as unknown[]).length) return c.json({error:'Cette leçon historique ne peut pas être modifiée depuis ce compte.'},403)
    }
    if ((Object.hasOwn(fileLessons,lesson.id) && !owner) || (owner && owner.user_id !== user.id)) return c.json({error:'Cette leçon appartient à un autre compte ou est une leçon historique.'},403)
    if (!Object.hasOwn(fileLessons, lesson.id) && Object.keys(fileLessons).length >= 200) return c.json({ error: 'Lesson limit reached' }, 413)
    // Private ownership is stored separately and never accepted from the payload.
    accounts.store.db.prepare('INSERT INTO lesson_owners(lesson_id,user_id) VALUES(?,?) ON CONFLICT(lesson_id) DO NOTHING').run(lesson.id,user.id)
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
  const user=accounts.currentUser(c)
  if(!user)return c.json({error:'Connexion requise.'},401)
  if(c.req.header('x-account-id')!==user.id)return c.json({error:'Le compte a changé dans un autre onglet.',code:'ACCOUNT_CHANGED'},403)
  const ownerRows=accounts.store.db.prepare('SELECT lesson_id FROM lesson_owners WHERE user_id=?').all(user.id) as {lesson_id:string}[]
  const ownIds=new Set(ownerRows.map(row=>row.lesson_id))
  const username=c.req.query('username')
  const lessons=Object.values(loadFileLessons()).filter(lesson=>ownIds.has(lesson.id)&&(!username||lesson.username.toLowerCase()===username.toLowerCase()))
  return c.json({lessons})
})

// 4. Supprimer / Dépublier une leçon
app.delete('/api/share/lessons/:id', async (c) => {
  const user=accounts.currentUser(c)
  if(!user)return c.json({error:'Connexion requise.'},401)
  if(c.req.header('x-account-id')!==user.id)return c.json({error:'Le compte a changé dans un autre onglet.',code:'ACCOUNT_CHANGED'},403)
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'ID manquant' }, 400)

  const owner=accounts.store.db.prepare('SELECT user_id FROM lesson_owners WHERE lesson_id=?').get(id) as {user_id:string}|undefined
  if(!owner||owner.user_id!==user.id)return c.json({error:'Leçon introuvable pour ce compte.'},404)
  // Suppression fichier
  const fileLessons = loadFileLessons()
  delete fileLessons[id]
  saveFileLessons(fileLessons)
  accounts.store.db.prepare('DELETE FROM lesson_owners WHERE lesson_id=?').run(id)

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
  if(accounts.rateLimit(c,'lesson-interaction',60))return c.json({error:'Too many requests'},429)
  const id = c.req.param('id')
  const { emoji } = await c.req.json()
  if (!id || typeof emoji !== 'string' || emoji.length > 32 || !emoji || ['__proto__', 'constructor', 'prototype'].includes(emoji)) return c.json({ error: 'Paramètres invalides' }, 400)

  const fileLessons = loadFileLessons()
  const lesson = fileLessons[id]
  if (!lesson) return c.json({ error: 'Leçon introuvable' }, 404)

  const reactions: Record<string, number> = { ...(lesson.reactions || {}) }
  if (!Object.hasOwn(reactions, emoji) && Object.keys(reactions).length >= 50) return c.json({ error: 'Reaction limit reached' }, 413)
  if (reactions[emoji] !== undefined && typeof reactions[emoji] !== 'number') return c.json({ error: 'Invalid reaction count' }, 400)
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
  if(accounts.rateLimit(c,'lesson-interaction',60))return c.json({error:'Too many requests'},429)
  const id = c.req.param('id')
  const { authorName, text } = await c.req.json()
  if (!id || typeof text !== 'string' || !text.trim() || text.length > 4000 || (authorName !== undefined && (typeof authorName !== 'string' || authorName.length > 80))) return c.json({ error: 'Commentaire invalide' }, 400)

  const fileLessons = loadFileLessons()
  const lesson = fileLessons[id]
  if (!lesson) return c.json({ error: 'Leçon introuvable' }, 404)

  if (!Array.isArray(lesson.studentComments || [])) return c.json({ error: 'Invalid lesson collection' }, 400)
  if ((lesson.studentComments || []).length >= 500) return c.json({ error: 'Interaction limit reached' }, 413)

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
  if(accounts.rateLimit(c,'lesson-interaction',60))return c.json({error:'Too many requests'},429)
  const id = c.req.param('id')
  const { pageIndex, xPercent, yPercent, authorName, text } = await c.req.json()
  if (!id || typeof text !== 'string' || !text.trim() || text.length > 4000 || (authorName !== undefined && (typeof authorName !== 'string' || authorName.length > 80))) return c.json({ error: 'Commentaire invalide' }, 400)
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || !Number.isFinite(xPercent) || xPercent < 0 || xPercent > 100 || !Number.isFinite(yPercent) || yPercent < 0 || yPercent > 100) return c.json({ error: 'Position invalide' }, 400)

  const fileLessons = loadFileLessons()
  const lesson = fileLessons[id]
  if (!lesson) return c.json({ error: 'Leçon introuvable' }, 404)

  if (!Array.isArray(lesson.figmaComments || [])) return c.json({ error: 'Invalid lesson collection' }, 400)
  if ((lesson.figmaComments || []).length >= 500) return c.json({ error: 'Interaction limit reached' }, 413)

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
  if(accounts.rateLimit(c,'lesson-interaction',60))return c.json({error:'Too many requests'},429)
  const id = c.req.param('id')
  const { pageIndex, xPercent, yPercent, emoji } = await c.req.json()
  if (!id || typeof emoji !== 'string' || !emoji || emoji.length > 32 || !Number.isInteger(pageIndex) || pageIndex < 0 || !Number.isFinite(xPercent) || xPercent < 0 || xPercent > 100 || !Number.isFinite(yPercent) || yPercent < 0 || yPercent > 100) return c.json({ error: 'Sticker invalide' }, 400)

  const fileLessons = loadFileLessons()
  const lesson = fileLessons[id]
  if (!lesson) return c.json({ error: 'Leçon introuvable' }, 404)

  if (!Array.isArray(lesson.stickers || [])) return c.json({ error: 'Invalid lesson collection' }, 400)
  if ((lesson.stickers || []).length >= 500) return c.json({ error: 'Interaction limit reached' }, 413)

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
app.all('/api/*', (c) => c.json({ error: 'Route not found' }, 404))

app.get('*', (c) => {
  const url = new URL(c.req.url)
  let filePath = resolve(DIST_DIR, '.' + url.pathname)

  if (!filePath.startsWith(resolve(DIST_DIR) + sep) || url.pathname.split('/').some((part) => part.startsWith('.'))) {
    filePath = resolve(DIST_DIR, 'index.html')
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = resolve(DIST_DIR, 'index.html')
  }

  if (!existsSync(filePath)) {
    return c.text('Application en cours de construction ou index.html introuvable.', 404)
  }

  const ext = extname(filePath)
  if (ext === '.html') {
    const htmlContent = readFileSync(filePath, 'utf-8')
    return c.html(htmlContent)
  }

  const contentType = mimeTypes[ext] || 'application/octet-stream'
  const content = readFileSync(filePath)
  return c.body(content, 200, { 'Content-Type': contentType })
})

const port = parseInt(process.env.PORT || '3001')
serve({ fetch: app.fetch, port, hostname: process.env.HOST || '127.0.0.1' }, (info) => {
  console.log(`Server running on port ${info.port}`)
})
