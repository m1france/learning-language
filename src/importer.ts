import type { Chapter, Difficulty, Resource } from './domain'
import { id } from './domain'

/**
 * URL / file import for the reading library.
 * Direct fetch is tried first (works for sites with permissive CORS), then a
 * chain of public CORS relays. Wikipédia uses its REST API, which is CORS-open.
 * Files: .txt / .md read directly, .epub unzipped (spine order), .pdf via pdf.js.
 */

type ImportedText = { title: string; author: string; paragraphs: string[] }

const CORS_RELAYS = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
]

const wikipediaApi = (url: URL): string | null => {
  if (!/(^|\.)wikipedia\.org$/i.test(url.hostname)) return null
  const match = /\/wiki\/([^#?]+)/.exec(url.pathname)
  if (!match) return null
  const lang = url.hostname.split('.')[0] || 'fr'
  return `https://${lang}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(decodeURIComponent(match[1]))}`
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally {
    window.clearTimeout(timer)
  }
}

function htmlToParagraphs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, nav, footer, header, form, iframe, figure, table, aside, sup').forEach((node) => node.remove())
  return [...doc.querySelectorAll('p, h2, h3, h4, li, blockquote')]
    .map((node) => node.textContent?.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim() ?? '')
    .filter((text) => text.length > 1)
}

function extractReadable(html: string, pageUrl: string): ImportedText | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, noscript, nav, footer, header, form, iframe, figure, table, aside, .mw-editsection, sup.reference, .navbox').forEach((node) => node.remove())
  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.title.replace(/\s*[|–-]\s*[^|–-]*$/, '').trim() ||
    new URL(pageUrl).hostname
  const author =
    doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
    new URL(pageUrl).hostname.replace(/^www\./, '')

  const root =
    doc.querySelector('#mw-content-text') ||
    doc.querySelector('article') ||
    doc.querySelector('main') ||
    doc.querySelector('[role="main"]') ||
    doc.body

  const blocks = [...root.querySelectorAll('p, h2, h3, li, blockquote')]
    .map((node) => node.textContent?.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim() ?? '')
    .filter((text) => text.length > 60 || /^.{30,}[.!?…]$/.test(text))
  const paragraphs = blocks.filter((text, index) => blocks.indexOf(text) === index).slice(0, 400)
  if (paragraphs.length < 1) return null
  return { title: title.slice(0, 90), author, paragraphs }
}

export function toChapters(paragraphs: string[]): Chapter[] {
  const perChapter = 12
  const chapters: Chapter[] = []
  for (let start = 0; start < paragraphs.length; start += perChapter) {
    const slice = paragraphs.slice(start, start + perChapter)
    chapters.push({ id: id('chapter'), title: `Partie ${chapters.length + 1}`, paragraphs: slice })
  }
  return chapters.length ? chapters : [{ id: id('chapter'), title: 'Texte importé', paragraphs }]
}

export const autoDifficulty = (words: number): Difficulty =>
  words > 1400 ? 'advanced' : words > 500 ? 'intermediate' : 'beginner'

export function paragraphsToResource(args: {
  title: string
  author?: string
  paragraphs: string[]
  type?: string
  difficulty?: Difficulty
  language: 'en' | 'fr'
  sourceUrl?: string
}): Resource {
  const words = args.paragraphs.join(' ').split(/\s+/).filter(Boolean).length
  return {
    id: id('resource'),
    title: args.title.trim() || 'Sans titre',
    author: args.author?.trim() ?? '',
    type: args.type ?? 'article',
    difficulty: args.difficulty ?? autoDifficulty(words),
    minutes: Math.max(1, Math.round(words / 180)),
    cover: (['coral', 'blue', 'gold', 'green'] as const)[Math.floor(Math.random() * 4)],
    language: args.language,
    chapters: toChapters(args.paragraphs),
    sourceUrl: args.sourceUrl,
    createdAt: new Date().toISOString(),
    imported: true,
  }
}

export type ImportOptions = { type?: string; difficulty?: Difficulty }
export type ImportResult = { ok: true; resource: Resource } | { ok: false; reason: 'invalid' | 'unreadable' | 'empty' }

export async function importFromUrl(rawUrl: string, language: 'en' | 'fr', options: ImportOptions = {}): Promise<ImportResult> {
  let url: URL
  try {
    url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
  } catch {
    return { ok: false, reason: 'invalid' }
  }

  const attempts: string[] = []
  const wiki = wikipediaApi(url)
  if (wiki) attempts.push(wiki)
  attempts.push(url.toString(), ...CORS_RELAYS.map((relay) => relay(url.toString())))

  for (const attempt of attempts) {
    try {
      const html = await fetchText(attempt)
      const readable = extractReadable(html, url.toString())
      if (readable && readable.paragraphs.length) {
        const isWiki = Boolean(wiki)
        return {
          ok: true,
          resource: paragraphsToResource({
            title: readable.title,
            author: isWiki ? 'Wikipédia' : readable.author,
            paragraphs: readable.paragraphs,
            language,
            type: options.type,
            difficulty: options.difficulty,
            sourceUrl: url.toString(),
          }),
        }
      }
    } catch {
      // try the next relay
    }
  }
  return { ok: false, reason: 'unreadable' }
}

// ---------------------------------------------------------------------------
// EPUB — zip de fichiers XHTML lus dans l'ordre de la spine (JSZip, local)
// ---------------------------------------------------------------------------

async function importEpub(file: File): Promise<ImportedText | null> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)
  const containerText = await zip.file('META-INF/container.xml')?.async('text')
  if (!containerText) return null
  const container = new DOMParser().parseFromString(containerText, 'text/xml')
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) return null
  const opfText = await zip.file(opfPath)?.async('text')
  if (!opfText) return null
  const opf = new DOMParser().parseFromString(opfText, 'text/xml')
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const manifest = new Map<string, string>()
  opf.querySelectorAll('manifest item').forEach((item) => {
    const itemId = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (itemId && href) manifest.set(itemId, href)
  })
  const spine: string[] = []
  opf.querySelectorAll('spine itemref').forEach((ref) => {
    const idref = ref.getAttribute('idref')
    const href = idref ? manifest.get(idref) : undefined
    if (href) spine.push(href)
  })

  const title =
    opf.querySelector('metadata title')?.textContent?.trim() ||
    file.name.replace(/\.epub$/i, '')
  const author = opf.querySelector('metadata creator')?.textContent?.trim() ?? ''

  const chapters: { title: string; paragraphs: string[] }[] = []
  for (const href of spine.slice(0, 120)) {
    const entry = zip.file(base + href) ?? zip.file(href)
    if (!entry) continue
    const html = await entry.async('text')
    const paragraphs = htmlToParagraphs(html)
    if (paragraphs.length) chapters.push({ title: paragraphs[0].length < 90 ? paragraphs[0] : '', paragraphs })
    if (chapters.reduce((sum, chapter) => sum + chapter.paragraphs.length, 0) > 1500) break
  }
  const paragraphs = chapters.flatMap((chapter) => chapter.paragraphs)
  if (!paragraphs.length) return null
  return { title: title.slice(0, 90), author, paragraphs }
}

// ---------------------------------------------------------------------------
// PDF — texte extrait page par page avec pdf.js (local, aucun envoi réseau)
// ---------------------------------------------------------------------------

async function importPdf(file: File): Promise<ImportedText | null> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const lines: string[] = []
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 250); pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += (line && !line.endsWith(' ') && item.str ? ' ' : '') + item.str
      if (item.hasEOL) { lines.push(line.trim()); line = '' }
    }
    if (line.trim()) lines.push(line.trim())
    lines.push('') // page break = paragraph break
  }
  const paragraphs = lines
    .join('\n')
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter((block) => block.length > 40)
    .slice(0, 800)
  if (!paragraphs.length) return null
  return { title: file.name.replace(/\.pdf$/i, ''), author: '', paragraphs }
}

export async function importFromFile(file: File, language: 'en' | 'fr', options: ImportOptions = {}): Promise<ImportResult> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const title = file.name.replace(/\.[^.]+$/, '')

  if (extension === 'epub') {
    try {
      const imported = await importEpub(file)
      if (!imported) return { ok: false, reason: 'unreadable' }
      return { ok: true, resource: paragraphsToResource({ ...imported, title: imported.title || title, language, type: options.type ?? 'book', difficulty: options.difficulty }) }
    } catch {
      return { ok: false, reason: 'unreadable' }
    }
  }

  if (extension === 'pdf') {
    try {
      const imported = await importPdf(file)
      if (!imported) return { ok: false, reason: 'unreadable' }
      return { ok: true, resource: paragraphsToResource({ ...imported, title: imported.title || title, language, type: options.type ?? 'book', difficulty: options.difficulty }) }
    } catch {
      return { ok: false, reason: 'unreadable' }
    }
  }

  if (extension !== 'txt' && extension !== 'md' && file.type !== 'text/plain') {
    return { ok: false, reason: 'unreadable' }
  }
  const text = await file.text()
  const paragraphs = text
    .split(/\n{2,}|\r?\n(?=\S)/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 1)
  if (!paragraphs.length) return { ok: false, reason: 'empty' }
  return {
    ok: true,
    resource: paragraphsToResource({
      title,
      paragraphs,
      type: options.type ?? 'book',
      difficulty: options.difficulty,
      language,
    }),
  }
}
