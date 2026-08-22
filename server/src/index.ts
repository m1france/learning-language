import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { readFileSync, existsSync, statSync } from 'fs'
import { mkdtemp, readdir, readFile, rm } from 'fs/promises'
import { resolve, extname, join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const app = new Hono()
const DIST_DIR = '/app/dist'
const execFileAsync = promisify(execFile)

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

type YouTubeCaptionTrack = { baseUrl?: string; languageCode?: string; name?: { simpleText?: string } }

const youtubeIdFromUrl = (value: string) => {
    try {
        const url = new URL(value)
        if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0]
        if (url.hostname.endsWith('youtube.com')) return url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop() || ''
    } catch {}
    return ''
}

const downloadYouTubeAudio = async (videoId: string) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vivre-listening-'))
    try {
        const output = join(tempDir, 'audio.%(ext)s')
        await execFileAsync('yt-dlp', [
            '--no-playlist', '--no-warnings', '--extract-audio', '--audio-format', 'mp3',
            '--output', output, `https://www.youtube.com/watch?v=${videoId}`,
        ], { maxBuffer: 1024 * 1024 })
        const file = (await readdir(tempDir)).find((name) => name.endsWith('.mp3'))
        if (!file) throw new Error('Audio YouTube introuvable après extraction.')
        return { bytes: await readFile(join(tempDir, file)), tempDir }
    } catch (error) {
        await rm(tempDir, { recursive: true, force: true })
        throw error
    }
}

const transcribeYouTubeAudio = async (videoId: string, language: string, apiKey: string) => {
    const { bytes, tempDir } = await downloadYouTubeAudio(videoId)
    try {
        const form = new FormData()
        form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'youtube.mp3')
        form.append('model', 'whisper-1')
        form.append('response_format', 'verbose_json')
        form.append('language', language)
        form.append('timestamp_granularities[]', 'segment')
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST', headers: { Authorization: apiKey }, body: form,
        })
        if (!response.ok) throw new Error(`Transcription OpenAI impossible (${response.status}).`)
        const payload = await response.json() as { segments?: Array<{ start?: number; end?: number; text?: string }> }
        return (payload.segments ?? []).flatMap((segment, index) => {
            const text = segment.text?.trim() || ''
            const start = segment.start ?? 0
            const end = segment.end ?? start + 2.5
            return text ? [{ id: `asr-${index}`, start, end, text }] : []
        })
    } finally {
        await rm(tempDir, { recursive: true, force: true })
    }
}

const decodeHtml = (value: string) => value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

type TimedTextEvent = { tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }
type Cue = { id: string; start: number; end: number; text: string }

const cuesFromJson3 = (payload: { events?: TimedTextEvent[] }, prefix: string): Cue[] =>
    (payload.events ?? []).flatMap((event, index) => {
        const text = decodeHtml((event.segs ?? []).map((segment) => segment.utf8 ?? '').join('')).replace(/\n/g, ' ').trim()
        const start = (event.tStartMs ?? 0) / 1000
        const end = start + Math.max(0.4, (event.dDurationMs ?? 2500) / 1000)
        return text && end > start ? [{ id: `${prefix}-${index}`, start, end, text }] : []
    })

const timestampToSeconds = (value: string) => {
    const parts = value.trim().replace(',', '.').split(':').map(Number)
    if (parts.some(Number.isNaN)) return 0
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]
}

const parseVttToCues = (vtt: string, prefix: string): Cue[] => {
    const normalized = vtt.replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n?/i, '')
    const blocks = normalized.split(/\n{2,}/)
    return blocks.flatMap((block, blockIndex) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
        const timingIndex = lines.findIndex((line) => line.includes('-->'))
        if (timingIndex < 0) return []
        const [startRaw, endRaw] = lines[timingIndex].split('-->')
        const start = timestampToSeconds(startRaw)
        const end = timestampToSeconds(endRaw.trim().split(/\s+/)[0])
        const text = lines.slice(timingIndex + 1).join(' ').replace(/<[^>]+>/g, '').trim()
        return text && end > start ? [{ id: `${prefix}-${blockIndex}`, start, end, text }] : []
    })
}

/**
 * Primary technique: yt-dlp handles YouTube's anti-bot protections (signed
 * timedtext URLs, consent cookies) that break naive fetches — it reliably gets
 * either manual or auto-generated captions as json3/vtt.
 * Note: request ONLY the exact language track (+ its -orig variant); wildcards
 * like "en.*" fan out to dozens of auto-translated variants and trip HTTP 429s.
 */
const extractCaptionsWithYtDlp = async (videoId: string, language: string): Promise<Cue[] | null> => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vivre-captions-'))
    try {
        const base = join(tempDir, 'subs')
        const run = async (langs: string) => {
            try {
                await execFileAsync('yt-dlp', [
                    '--no-playlist', '--no-warnings', '--skip-download',
                    '--write-subs', '--write-auto-subs',
                    '--sub-langs', langs,
                    '--sub-format', 'json3/vtt/best',
                    '--sleep-requests', '1',
                    '--retries', '2',
                    '--output', base,
                    `https://www.youtube.com/watch?v=${videoId}`,
                ], { maxBuffer: 4 * 1024 * 1024 })
            } catch (error) {
                console.warn(`[youtube-transcript] yt-dlp (${langs}) failed:`, error instanceof Error ? error.message.split('\n').pop() : error)
            }
        }
        const listFiles = () => readdir(tempDir).then((names) => names.filter((name) => name.startsWith('subs.') && (name.endsWith('.json3') || name.endsWith('.vtt'))))

        await run(`${language},${language}-orig`)
        let files = await listFiles()
        // One gentle retry with any-language tracks before giving up to the next technique.
        if (!files.length) {
            await run('*')
            files = await listFiles()
        }
        if (!files.length) return null

        // Prefer an exact-language file, then the ASR variant of that language, then anything.
        const score = (name: string) => {
            const lower = name.toLowerCase()
            if (lower.startsWith(`subs.${language.toLowerCase()}.`)) return 0
            if (lower.startsWith(`subs.${language.toLowerCase()}-`)) return 1
            return 2
        }
        files.sort((a, b) => score(a) - score(b))
        const chosen = files[0]
        const content = await readFile(join(tempDir, chosen), 'utf8')
        const cues = chosen.endsWith('.json3')
            ? cuesFromJson3(JSON.parse(content) as { events?: TimedTextEvent[] }, 'ytdlp')
            : parseVttToCues(content, 'ytdlp')
        return cues.length ? cues : null
    } catch {
        return null
    } finally {
        await rm(tempDir, { recursive: true, force: true })
    }
}

// Public oEmbed endpoint — no API key required, CORS-open, highly reliable.
const fetchYoutubeMeta = async (videoId: string): Promise<{ title: string; thumbnail: string }> => {
    const fallback = { title: '', thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }
    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VivreLaLangue/1.0)' },
        })
        if (!response.ok) return fallback
        const payload = await response.json() as { title?: string; thumbnail_url?: string }
        return {
            title: payload.title || '',
            thumbnail: payload.thumbnail_url || fallback.thumbnail,
        }
    } catch {
        return fallback
    }
}

app.get('/api/youtube-meta', async (c) => {
    const videoId = youtubeIdFromUrl(c.req.query('url') || '')
    if (!/^[\w-]{6,}$/.test(videoId)) return c.json({ error: 'Lien YouTube invalide.' }, 400)
    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VivreLaLangue/1.0)' },
        })
        if (!response.ok) return c.json({ error: 'Vidéo introuvable ou privée.' }, response.status === 404 ? 404 : 502)
        const payload = await response.json() as { title?: string; thumbnail_url?: string; author_name?: string }
        return c.json({
            videoId,
            title: payload.title || '',
            thumbnail: payload.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            channel: payload.author_name || '',
        })
    } catch {
        // Even without oEmbed the watch page still gives us a usable thumbnail.
        return c.json({ videoId, title: '', thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, channel: '' })
    }
})

app.post('/api/youtube-transcript', async (c) => {
    const body: { url?: string; language?: string } = await c.req.json<{ url?: string; language?: string }>().catch(() => ({}))
    const videoId = youtubeIdFromUrl(body.url || '')
    if (!/^[\w-]{6,}$/.test(videoId)) return c.json({ error: 'Lien YouTube invalide.' }, 400)

    try {
        // 1. yt-dlp — the reliable path (handles anti-bot, signed URLs, consent).
        const ytdlpCues = await extractCaptionsWithYtDlp(videoId, body.language || 'en')
        if (ytdlpCues) {
            const meta = await fetchYoutubeMeta(videoId)
            return c.json({ videoId, cues: ytdlpCues, language: body.language || 'en', title: meta.title, thumbnail: meta.thumbnail })
        }

        // 2. Raw watch-page scrape + timedtext fetch (works when YouTube allows it).
        const page = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=${body.language === 'fr' ? 'fr' : 'en'}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VivreLaLangue/1.0)' },
        }).then(async (response) => response.ok ? response.text() : '')
        const captionsMatch = page.match(/"captionTracks":(\[[\s\S]*?\])(?=,"audioTracks"|,"translationLanguages"|})/)
        if (!captionsMatch) {
            const authorization = c.req.header('Authorization')
            if (!authorization?.startsWith('Bearer ')) return c.json({ error: 'Cette vidéo ne propose pas de sous-titres. Ajoute une clé OpenAI pour lancer la transcription complète.' }, 422)
            const cues = await transcribeYouTubeAudio(videoId, body.language || 'en', authorization)
            if (!cues.length) return c.json({ error: 'La transcription ne contient aucun texte.' }, 422)
            const meta = await fetchYoutubeMeta(videoId)
            return c.json({ videoId, cues, transcribed: true, title: meta.title, thumbnail: meta.thumbnail })
        }

        const tracks = JSON.parse(captionsMatch[1]) as YouTubeCaptionTrack[]
        const preferred = tracks.find((track) => track.languageCode?.startsWith(body.language || '')) || tracks[0]
        if (!preferred?.baseUrl) return c.json({ error: 'Aucune piste de sous-titres disponible.' }, 422)
        const captionUrl = new URL(preferred.baseUrl)
        captionUrl.searchParams.set('fmt', 'json3')
        const captions = await fetch(captionUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VivreLaLangue/1.0)' } })
        if (!captions.ok) return c.json({ error: 'Impossible de récupérer les sous-titres de cette vidéo.' }, 502)
        const captionsBody = await captions.text()
        // YouTube sometimes answers 200 with an empty body when it flags the client — fall through to Whisper.
        if (!captionsBody.trim()) {
            const authorization = c.req.header('Authorization')
            if (!authorization?.startsWith('Bearer ')) return c.json({ error: 'Sous-titres bloqués par YouTube. Ajoute une clé OpenAI pour lancer la transcription complète.' }, 422)
            const cues = await transcribeYouTubeAudio(videoId, body.language || 'en', authorization)
            if (!cues.length) return c.json({ error: 'La transcription ne contient aucun texte.' }, 422)
            const meta = await fetchYoutubeMeta(videoId)
            return c.json({ videoId, cues, transcribed: true, title: meta.title, thumbnail: meta.thumbnail })
        }
        const payload = JSON.parse(captionsBody) as { events?: TimedTextEvent[] }
        const cues = cuesFromJson3(payload, 'yt')
        if (!cues.length) return c.json({ error: 'La piste de sous-titres ne contient aucun texte.' }, 422)
        // Enrich with title + thumbnail (oEmbed, keyless) so the theater can show a real preview card.
        const meta = await fetchYoutubeMeta(videoId)
        return c.json({ videoId, cues, language: preferred.languageCode, label: preferred.name?.simpleText || preferred.languageCode, title: meta.title, thumbnail: meta.thumbnail })
    } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Impossible de préparer cette vidéo.' }, 502)
    }
})

app.get('*', (c) => {
    const url = new URL(c.req.url)
    let filePath = resolve(DIST_DIR, '.' + url.pathname)

    if (!filePath.startsWith(DIST_DIR)) {
        filePath = resolve(DIST_DIR, 'index.html')
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
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
