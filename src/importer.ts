import type { Chapter, Resource, ResourceType } from './domain'
import { id } from './domain'

/**
 * URL / file import for the reading library.
 * Direct fetch is tried first (works for sites with permissive CORS), then a
 * chain of public CORS relays. Wikipédia uses its REST API, which is CORS-open.
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

function toChapters(paragraphs: string[]): Chapter[] {
  const perChapter = 12
  const chapters: Chapter[] = []
  for (let start = 0; start < paragraphs.length; start += perChapter) {
    const slice = paragraphs.slice(start, start + perChapter)
    chapters.push({ id: id('chapter'), title: `Partie ${chapters.length + 1}`, paragraphs: slice })
  }
  return chapters.length ? chapters : [{ id: id('chapter'), title: 'Texte importé', paragraphs }]
}

export function paragraphsToResource(args: {
  title: string
  author?: string
  paragraphs: string[]
  type?: ResourceType
  language: 'en' | 'fr'
  sourceUrl?: string
}): Resource {
  const words = args.paragraphs.join(' ').split(/\s+/).filter(Boolean).length
  return {
    id: id('resource'),
    title: args.title.trim() || 'Sans titre',
    author: args.author?.trim() || 'Importé',
    type: args.type ?? 'article',
    difficulty: words > 1400 ? 'advanced' : words > 500 ? 'intermediate' : 'beginner',
    minutes: Math.max(1, Math.round(words / 180)),
    cover: (['coral', 'blue', 'gold', 'green'] as const)[Math.floor(Math.random() * 4)],
    language: args.language,
    chapters: toChapters(args.paragraphs),
    sourceUrl: args.sourceUrl,
    createdAt: new Date().toISOString(),
    imported: true,
  }
}

export type ImportResult = { ok: true; resource: Resource } | { ok: false; reason: 'invalid' | 'unreadable' | 'empty' }

export async function importFromUrl(rawUrl: string, language: 'en' | 'fr'): Promise<ImportResult> {
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

export async function importFromFile(file: File, language: 'en' | 'fr'): Promise<ImportResult> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (extension !== 'txt' && extension !== 'md' && file.type !== 'text/plain') {
    // .epub / .docx / .pdf need heavier parsers; ask for pasted text instead.
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
      title: file.name.replace(/\.(txt|md)$/i, ''),
      author: 'Fichier importé',
      paragraphs,
      type: 'book',
      language,
    }),
  }
}
