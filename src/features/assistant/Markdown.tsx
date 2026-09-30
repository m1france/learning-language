import React, { useMemo, useState } from 'react'
import { AlertTriangle, BookOpen, Check, Copy, Info, Lightbulb, Scale } from 'lucide-react'
import { BLOCK_TYPES } from './assistantPrompt'

/**
 * Small, safe Markdown renderer (React elements only, never innerHTML) with
 * the extras the tutor uses: callouts, ==tap-to-hear== phrases and hooks for
 * interactive fenced blocks.
 */

type Align = 'left' | 'center' | 'right' | null

export type MdBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'hr' }
  | { type: 'code'; lang: string; body: string; partial: boolean; special: number | null }
  | { type: 'quote'; alert: string | null; children: MdBlock[] }
  | { type: 'list'; ordered: boolean; start: number; items: MdListItem[] }
  | { type: 'table'; header: string[]; align: Align[]; rows: string[][] }

type MdListItem = { text: string; task: boolean; checked: boolean; children: MdBlock[] }

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*([\w-]*)/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const LIST_ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

const indentOf = (line: string) => (line.match(/^\s*/)?.[0].replace(/\t/g, '    ').length ?? 0)
const splitRow = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))

const isBlockStart = (line: string, next?: string) =>
  FENCE_OPEN.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || LIST_ITEM.test(line) || (line.includes('|') && next !== undefined && TABLE_SEP.test(next))

export function parseMarkdown(source: string): MdBlock[] {
  const counter = { n: -1 }
  return parseLines(source.replace(/\r\n?/g, '\n').split('\n'), counter)
}

function parseLines(lines: string[], counter: { n: number }): MdBlock[] {
  const blocks: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i += 1; continue }

    const fence = line.match(FENCE_OPEN)
    if (fence) {
      const marker = fence[2]
      const lang = fence[3].toLowerCase()
      const body: string[] = []
      i += 1
      let closed = false
      while (i < lines.length) {
        if (lines[i].trim().startsWith(marker) && lines[i].trim().replace(/[`~]/g, '') === '') { closed = true; i += 1; break }
        body.push(lines[i])
        i += 1
      }
      const special = (BLOCK_TYPES as readonly string[]).includes(lang) ? (counter.n += 1) : null
      blocks.push({ type: 'code', lang, body: body.join('\n'), partial: !closed, special })
      continue
    }

    const heading = line.match(HEADING)
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); i += 1; continue }

    if (HR.test(line)) { blocks.push({ type: 'hr' }); i += 1; continue }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) { inner.push(lines[i].match(QUOTE)![1]); i += 1 }
      const alert = inner[0]?.match(/^\[!(\w+)\]\s*(.*)$/)
      if (alert) inner[0] = alert[2]
      blocks.push({ type: 'quote', alert: alert ? alert[1].toUpperCase() : null, children: parseLines(inner, counter) })
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const header = splitRow(line)
      const align: Align[] = splitRow(lines[i + 1]).map((cell) => (cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : null))
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(splitRow(lines[i])); i += 1 }
      blocks.push({ type: 'table', header, align, rows })
      continue
    }

    if (LIST_ITEM.test(line)) {
      const result = parseList(lines, i, counter)
      blocks.push(result.block)
      i = result.next
      continue
    }

    const paragraph: string[] = [line.trim()]
    i += 1
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) { paragraph.push(lines[i].trim()); i += 1 }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') })
  }
  return blocks
}

function parseList(lines: string[], start: number, counter: { n: number }): { block: MdBlock; next: number } {
  const first = lines[start].match(LIST_ITEM)!
  const base = indentOf(first[1])
  const ordered = /\d/.test(first[2])
  const items: { text: string; sub: string[] }[] = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    const match = line.match(LIST_ITEM)
    if (match && indentOf(match[1]) <= base + 1 && /\d/.test(match[2]) === ordered) {
      items.push({ text: match[3], sub: [] })
      i += 1
      continue
    }
    if (!line.trim()) {
      const nextIndex = lines.slice(i + 1).findIndex((l) => l.trim())
      if (nextIndex === -1) break
      const next = lines[i + 1 + nextIndex]
      const nextMatch = next.match(LIST_ITEM)
      if (indentOf(next) > base + 1 || (nextMatch && indentOf(nextMatch[1]) <= base + 1 && /\d/.test(nextMatch[2]) === ordered)) {
        items[items.length - 1]?.sub.push('')
        i += 1
        continue
      }
      break
    }
    if (indentOf(line) > base + 1) {
      items[items.length - 1]?.sub.push(line.slice(Math.min(indentOf(line), base + 2)))
      i += 1
      continue
    }
    // Lazy continuation of the item's first line.
    if (items.length && !items[items.length - 1].sub.length && !isBlockStart(line, lines[i + 1])) {
      items[items.length - 1].text += `\n${line.trim()}`
      i += 1
      continue
    }
    break
  }
  return {
    next: i,
    block: {
      type: 'list',
      ordered,
      start: ordered ? parseInt(first[2], 10) || 1 : 1,
      items: items.map((item) => {
        const task = item.text.match(/^\[([ xX])\]\s+(.*)$/s)
        return { text: task ? task[2] : item.text, task: Boolean(task), checked: task ? task[1] !== ' ' : false, children: parseLines(item.sub, counter) }
      }),
    },
  }
}

// ── Inline ──────────────────────────────────────────────────────────────────

const INLINE = /(`[^`\n]+`)|(\*\*[^\n]+?\*\*|__[^_\n]+?__)|(~~[^\n]+?~~)|(==[^=\n]+?==)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))|(\*[^*\s](?:[^*\n]*?[^*\s])?\*|(?<![\p{L}\p{N}_])_[^_\s](?:[^_\n]*?[^_\s])?_(?![\p{L}\p{N}_]))|(\n)/u

type InlineContext = { onSpeak?: (text: string) => void }

export function Inline({ text, ctx }: { text: string; ctx: InlineContext }): React.ReactElement {
  return <>{renderInline(text, ctx, 'i')}</>
}

function renderInline(text: string, ctx: InlineContext, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let rest = text
  let n = 0
  while (rest) {
    const match = rest.match(INLINE)
    if (!match || match.index === undefined) { out.push(rest); break }
    if (match.index > 0) out.push(rest.slice(0, match.index))
    const token = match[0]
    const key = `${keyBase}-${n++}`
    if (match[1]) out.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (match[2]) out.push(<strong key={key}>{renderInline(token.slice(2, -2), ctx, key)}</strong>)
    else if (match[3]) out.push(<del key={key}>{renderInline(token.slice(2, -2), ctx, key)}</del>)
    else if (match[4]) {
      const phrase = token.slice(2, -2)
      out.push(ctx.onSpeak
        ? <button key={key} type="button" className="md-say" onClick={() => ctx.onSpeak?.(phrase.replace(/[*_`]/g, ''))} title="▶">{renderInline(phrase, ctx, key)}</button>
        : <mark key={key}>{renderInline(phrase, ctx, key)}</mark>)
    } else if (match[5]) {
      const link = token.match(/^\[([^\]]+)\]\((.+)\)$/)!
      out.push(<a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">{renderInline(link[1], ctx, key)}</a>)
    } else if (match[6]) out.push(<em key={key}>{renderInline(token.slice(1, -1), ctx, key)}</em>)
    else if (match[7]) out.push(<br key={key} />)
    rest = rest.slice(match.index + token.length)
  }
  return out
}

// ── Blocks ──────────────────────────────────────────────────────────────────

export type SpecialRenderer = (block: Extract<MdBlock, { type: 'code' }>) => React.ReactNode

const ALERTS: Record<string, { icon: React.ReactNode; className: string }> = {
  RULE: { icon: <Scale size={15} />, className: 'rule' },
  TIP: { icon: <Lightbulb size={15} />, className: 'tip' },
  WARNING: { icon: <AlertTriangle size={15} />, className: 'warning' },
  CAUTION: { icon: <AlertTriangle size={15} />, className: 'warning' },
  IMPORTANT: { icon: <Info size={15} />, className: 'note' },
  NOTE: { icon: <Info size={15} />, className: 'note' },
  EXAMPLE: { icon: <BookOpen size={15} />, className: 'example' },
}

function CodeBlock({ lang, body }: { lang: string; body: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span>{lang || 'text'}</span>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(body).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) }) }} aria-label="Copy">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre><code>{body}</code></pre>
    </div>
  )
}

function BlockView({ block, ctx, special, keyId }: { block: MdBlock; ctx: InlineContext; special?: SpecialRenderer; keyId: string }): React.ReactElement | null {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${Math.min(6, block.level + 1)}` as 'h2'
      return <Tag className={`md-h${block.level}`}>{renderInline(block.text, ctx, keyId)}</Tag>
    }
    case 'paragraph':
      return <p>{renderInline(block.text, ctx, keyId)}</p>
    case 'hr':
      return <hr />
    case 'code':
      if (block.special !== null && special) return <>{special(block)}</>
      return <CodeBlock lang={block.lang} body={block.body} />
    case 'quote': {
      const alert = block.alert ? ALERTS[block.alert] ?? ALERTS.NOTE : null
      if (alert) {
        return (
          <aside className={`md-callout ${alert.className}`}>
            <span className="md-callout-icon">{alert.icon}</span>
            <div>{block.children.map((child, index) => <BlockView key={index} block={child} ctx={ctx} special={special} keyId={`${keyId}-${index}`} />)}</div>
          </aside>
        )
      }
      return <blockquote>{block.children.map((child, index) => <BlockView key={index} block={child} ctx={ctx} special={special} keyId={`${keyId}-${index}`} />)}</blockquote>
    }
    case 'list': {
      const items = block.items.map((item, index) => (
        <li key={index} className={item.task ? `md-task${item.checked ? ' done' : ''}` : undefined}>
          {item.task && <span className="md-check" aria-hidden>{item.checked ? <Check size={11} /> : null}</span>}
          <span>{renderInline(item.text, ctx, `${keyId}-${index}`)}</span>
          {item.children.map((child, childIndex) => <BlockView key={childIndex} block={child} ctx={ctx} special={special} keyId={`${keyId}-${index}-${childIndex}`} />)}
        </li>
      ))
      return block.ordered ? <ol start={block.start}>{items}</ol> : <ul>{items}</ul>
    }
    case 'table':
      return (
        <div className="md-table-wrap">
          <table>
            <thead><tr>{block.header.map((cell, index) => <th key={index} style={block.align[index] ? { textAlign: block.align[index]! } : undefined}>{renderInline(cell, ctx, `${keyId}-h${index}`)}</th>)}</tr></thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{block.header.map((_, index) => <td key={index} style={block.align[index] ? { textAlign: block.align[index]! } : undefined}>{renderInline(row[index] ?? '', ctx, `${keyId}-${rowIndex}-${index}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

export function Markdown({ text, onSpeak, special, className }: { text: string; onSpeak?: (text: string) => void; special?: SpecialRenderer; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  const ctx = useMemo(() => ({ onSpeak }), [onSpeak])
  return (
    <div className={`md ${className ?? ''}`}>
      {blocks.map((block, index) => <BlockView key={index} block={block} ctx={ctx} special={special} keyId={`b${index}`} />)}
    </div>
  )
}
