/**
 * Notes are stored as light Markdown (backward compatible with older notes):
 *   # / ## / ###      headings
 *   - item, 1. item   lists        - [ ] / - [x]   to-dos
 *   > quote           > [!NOTE] …  callout          ---   divider
 *   **bold** *italic* <u>underline</u> ~~strike~~ ==highlight== `code`
 *   @01:23 or [01:23] clickable timestamps
 * These helpers convert it to the editor's HTML and back.
 */

export const TIMESTAMP_PATTERN = /@(\d{1,2}):(\d{2})(?::(\d{2}))?|\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function timestampSeconds(match: RegExpExecArray | string[]): number {
  const parts = (match[1] !== undefined ? [match[1], match[2], match[3]] : [match[4], match[5], match[6]]).filter((p) => p !== undefined).map(Number)
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function timestampChipHtml(seconds: number): string {
  return `<span class="nb-ts" contenteditable="false" data-seconds="${Math.floor(seconds)}">${formatClock(seconds)}</span>`
}

/** Inline Markdown → HTML (input is raw text; output is safe HTML). */
export function inlineToHtml(raw: string): string {
  let html = escapeHtml(raw)
  html = html.replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, '<u>$1</u>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>')
  html = html.replace(/==(.+?)==/g, '<mark>$1</mark>')
  html = html.replace(TIMESTAMP_PATTERN, (...args) => timestampChipHtml(timestampSeconds(args.slice(0, 7) as string[])))
  return html
}

type LineKind =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'ul' | 'ol'; text: string }
  | { kind: 'todo'; checked: boolean; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'callout'; text: string }
  | { kind: 'hr' }
  | { kind: 'p'; text: string }

function classify(line: string): LineKind {
  let match: RegExpMatchArray | null
  if ((match = line.match(/^(#{1,3})\s+(.*)$/))) return { kind: 'h', level: match[1].length as 1 | 2 | 3, text: match[2] }
  if ((match = line.match(/^\s*[-*]\s+\[( |x|X)\]\s?(.*)$/))) return { kind: 'todo', checked: match[1].toLowerCase() === 'x', text: match[2] }
  if ((match = line.match(/^\s*[-*]\s+(.*)$/))) return { kind: 'ul', text: match[1] }
  if ((match = line.match(/^\s*\d+[.)]\s+(.*)$/))) return { kind: 'ol', text: match[1] }
  if ((match = line.match(/^>\s*\[!(?:NOTE|TIP|INFO)\]\s?(.*)$/i))) return { kind: 'callout', text: match[1] }
  if ((match = line.match(/^>\s?(.*)$/))) return { kind: 'quote', text: match[1] }
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return { kind: 'hr' }
  return { kind: 'p', text: line }
}

export function markdownToHtml(markdown: string): string {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let list: { tag: 'ul' | 'ol' | 'todo'; items: string[] } | null = null
  const closeList = () => {
    if (!list) return
    if (list.tag === 'todo') out.push(`<ul data-todo="true">${list.items.join('')}</ul>`)
    else out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`)
    list = null
  }
  for (const line of lines) {
    const item = classify(line)
    if (item.kind === 'ul' || item.kind === 'ol' || item.kind === 'todo') {
      const tag = item.kind
      if (!list || list.tag !== tag) { closeList(); list = { tag, items: [] } }
      const body = inlineToHtml(item.text) || '<br>'
      list.items.push(item.kind === 'todo' ? `<li data-checked="${item.checked}">${body}</li>` : `<li>${body}</li>`)
      continue
    }
    closeList()
    switch (item.kind) {
      case 'h': out.push(`<h${item.level}>${inlineToHtml(item.text) || '<br>'}</h${item.level}>`); break
      case 'quote': out.push(`<blockquote>${inlineToHtml(item.text) || '<br>'}</blockquote>`); break
      case 'callout': out.push(`<aside class="nb-callout">${inlineToHtml(item.text) || '<br>'}</aside>`); break
      case 'hr': out.push('<hr>'); break
      default: out.push(`<p>${inlineToHtml(item.text) || '<br>'}</p>`)
    }
  }
  closeList()
  return out.join('') || '<p><br></p>'
}

/** Inline DOM → Markdown. */
function inlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/ /g, ' ').replace(/​/g, '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  if (el.classList.contains('nb-ts')) return `@${formatClock(Number(el.dataset.seconds) || 0)}`
  const tag = el.tagName.toLowerCase()
  if (tag === 'br') return ''
  const inner = Array.from(el.childNodes).map(inlineToMarkdown).join('')
  if (!inner.trim()) return inner
  switch (tag) {
    case 'strong': case 'b': return `**${inner}**`
    case 'em': case 'i': return `*${inner}*`
    case 'u': return `<u>${inner}</u>`
    case 's': case 'strike': case 'del': return `~~${inner}~~`
    case 'mark': return `==${inner}==`
    case 'code': return `\`${inner}\``
    case 'span': {
      const style = el.getAttribute('style') || ''
      if (/font-weight:\s*(bold|[6-9]00)/.test(style)) return `**${inner}**`
      if (/font-style:\s*italic/.test(style)) return `*${inner}*`
      return inner
    }
    default: return inner
  }
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote', 'aside', 'hr', 'pre'])

/** Editor DOM → Markdown (tolerates the <div>/<br> soup browsers produce). */
export function editorToMarkdown(root: HTMLElement): string {
  const lines: string[] = []
  let pendingInline = ''
  const flushInline = () => {
    if (pendingInline) { lines.push(pendingInline.trim()); pendingInline = '' }
  }
  const walkBlock = (el: HTMLElement) => {
    const tag = el.tagName.toLowerCase()
    const text = () => Array.from(el.childNodes).map(inlineToMarkdown).join('').trim()
    switch (tag) {
      case 'h1': lines.push(`# ${text()}`); return
      case 'h2': lines.push(`## ${text()}`); return
      case 'h3': case 'h4': lines.push(`### ${text()}`); return
      case 'blockquote': lines.push(`> ${text()}`); return
      case 'aside': lines.push(`> [!NOTE] ${text()}`); return
      case 'hr': lines.push('---'); return
      case 'ul': case 'ol': {
        const todo = el.hasAttribute('data-todo')
        let index = 1
        el.querySelectorAll(':scope > li').forEach((li) => {
          const body = Array.from(li.childNodes).map(inlineToMarkdown).join('').trim()
          if (todo) lines.push(`- [${(li as HTMLElement).dataset.checked === 'true' ? 'x' : ' '}] ${body}`)
          else if (tag === 'ol') lines.push(`${index++}. ${body}`)
          else lines.push(`- ${body}`)
        })
        return
      }
      default: {
        // Paragraphs and divs: may hold nested blocks.
        const hasBlocks = Array.from(el.children).some((child) => BLOCK_TAGS.has(child.tagName.toLowerCase()))
        if (hasBlocks) { walkChildren(el); return }
        lines.push(text())
      }
    }
  }
  const walkChildren = (parent: HTMLElement) => {
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as HTMLElement).tagName.toLowerCase())) {
        flushInline()
        walkBlock(node as HTMLElement)
      } else if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
        flushInline()
      } else {
        pendingInline += inlineToMarkdown(node)
      }
    })
    flushInline()
  }
  walkChildren(root)
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.join('\n')
}

/** Plain text for counters and the session card (no markers, timestamps count as nothing). */
export function notesPlainText(markdown: string): string {
  return (markdown || '')
    .replace(TIMESTAMP_PATTERN, '')
    .replace(/<\/?u>/g, '')
    .replace(/^\s*(#{1,3}\s|>\s*(\[!\w+\]\s*)?|[-*]\s+(\[[ xX]\]\s*)?|\d+[.)]\s)/gm, '')
    .replace(/\*\*|__|~~|==|`/g, '')
    .replace(/(^|\s)\*(\S[^*]*?)\*/g, '$1$2')
    .replace(/^\s*-{3,}\s*$/gm, '')
    .trim()
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length
}

export function timestampsIn(markdown: string): number[] {
  const out: number[] = []
  const pattern = new RegExp(TIMESTAMP_PATTERN.source, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(markdown || ''))) out.push(timestampSeconds(match))
  return out
}
