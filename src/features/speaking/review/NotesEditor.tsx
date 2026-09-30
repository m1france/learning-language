import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import {
  Bold,
  Clock,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Type,
  Underline,
} from 'lucide-react'
import { editorToMarkdown, formatClock, markdownToHtml, timestampChipHtml } from './notesMarkdown'
import type { ReviewCopy } from '../../../i18n/reviewCopy'

/**
 * Block-based notes editor (Notion-like, kept deliberately small):
 * "/" command menu, Markdown shortcuts, floating format bar, to-dos,
 * callouts and clickable video timestamps (@ or ⌘J).
 */

export type NotesEditorHandle = {
  insertTimestamp: (seconds: number) => void
  insertQuote: (text: string, seconds?: number) => void
  focus: () => void
}

type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'todo' | 'quote' | 'callout' | 'hr' | 'ts'

type Command = { id: BlockType; label: string; hint: string; icon: React.ReactNode; keywords: string }

type Props = {
  initialMarkdown: string
  /** Reads the player position (a function, so the editor doesn't re-render every frame). */
  getTime: () => number
  onSeek: (seconds: number) => void
  onChange: (markdown: string) => void
  c: ReviewCopy
}

const FORMAT_TAGS = { mark: 'MARK', code: 'CODE' } as const

export const NotesEditor = forwardRef<NotesEditorHandle, Props>(function NotesEditor({ initialMarkdown, getTime, onSeek, onChange, c }, ref) {
  const rootRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const [slash, setSlash] = useState<{ x: number; y: number; query: string; index: number } | null>(null)
  const slashAnchor = useRef<{ node: Text; offset: number } | null>(null)
  const [atMenu, setAtMenu] = useState<{ x: number; y: number } | null>(null)
  const [toolbar, setToolbar] = useState<{ x: number; y: number; active: Record<string, boolean> } | null>(null)
  const hintRef = useRef(c.editorHint)
  hintRef.current = c.editorHint

  const commands: Command[] = [
    { id: 'p', label: c.cmdText, hint: '', icon: <Type size={15} />, keywords: 'text texte paragraph' },
    { id: 'h1', label: c.cmdH1, hint: '#', icon: <Heading1 size={15} />, keywords: 'heading titre title h1' },
    { id: 'h2', label: c.cmdH2, hint: '##', icon: <Heading2 size={15} />, keywords: 'heading titre subtitle h2' },
    { id: 'h3', label: c.cmdH3, hint: '###', icon: <Heading3 size={15} />, keywords: 'heading titre h3' },
    { id: 'ul', label: c.cmdBullets, hint: '-', icon: <List size={15} />, keywords: 'list liste bullet puces' },
    { id: 'ol', label: c.cmdNumbered, hint: '1.', icon: <ListOrdered size={15} />, keywords: 'list liste numbered numérotée' },
    { id: 'todo', label: c.cmdTodo, hint: '[]', icon: <ListChecks size={15} />, keywords: 'todo checkbox tâche case' },
    { id: 'quote', label: c.cmdQuote, hint: '>', icon: <Quote size={15} />, keywords: 'quote citation' },
    { id: 'callout', label: c.cmdCallout, hint: '', icon: <Lightbulb size={15} />, keywords: 'callout note encadré tip astuce' },
    { id: 'hr', label: c.cmdDivider, hint: '---', icon: <Minus size={15} />, keywords: 'divider séparateur line ligne' },
    { id: 'ts', label: c.cmdTimestamp, hint: '⌘J', icon: <Clock size={15} />, keywords: 'time timestamp horodatage moment' },
  ]
  const query = slash?.query.toLowerCase() ?? ''
  const filtered = commands.filter((cmd) => !query || cmd.label.toLowerCase().includes(query) || cmd.keywords.includes(query))

  const emit = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    if (!root.firstElementChild) root.innerHTML = '<p><br></p>'
    root.querySelectorAll('ul[data-todo] > li:not([data-checked])').forEach((li) => li.setAttribute('data-checked', 'false'))
    root.classList.toggle('is-empty', root.textContent === '' && root.querySelectorAll('.nb-ts, hr, li').length === 0)
    onChange(editorToMarkdown(root))
  }, [onChange])

  // Mount once: the DOM is the source of truth while editing.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.innerHTML = markdownToHtml(initialMarkdown)
    root.classList.toggle('is-empty', !initialMarkdown.trim())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Caret helpers ─────────────────────────────────────────────────────────
  const selectionInside = () => {
    const sel = window.getSelection()
    const root = rootRef.current
    if (!sel || !sel.rangeCount || !root) return null
    return root.contains(sel.anchorNode) ? sel : null
  }

  /** The top-level block (or list item) holding the caret. */
  const caretBlock = (): HTMLElement | null => {
    const sel = selectionInside()
    const root = rootRef.current
    if (!sel || !root) return null
    let node: Node | null = sel.anchorNode
    if (node === root) return (root.children[Math.max(0, sel.anchorOffset - 1)] as HTMLElement) ?? null
    let li: HTMLElement | null = null
    while (node && node.parentNode !== root) {
      if (node instanceof HTMLElement && node.tagName === 'LI') li = node
      node = node.parentNode
    }
    return li ?? (node as HTMLElement | null)
  }

  /** Empty blocks need a <br> to be focusable and keep their height. */
  const ensureFilled = (el: HTMLElement) => {
    Array.from(el.childNodes).forEach((node) => { if (node.nodeType === Node.TEXT_NODE && !node.textContent) node.remove() })
    if (!el.textContent && !el.querySelector('.nb-ts, br')) el.innerHTML = '<br>'
  }

  const placeCaretAtEnd = (el: Node) => {
    const range = document.createRange()
    if (el instanceof HTMLElement && !el.textContent && !el.querySelector('.nb-ts')) {
      ensureFilled(el)
      range.setStart(el, 0)
    } else {
      range.selectNodeContents(el)
    }
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  const caretRect = (): DOMRect | null => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return null
    const range = sel.getRangeAt(0).cloneRange()
    range.collapse(true)
    const rects = range.getClientRects()
    if (rects.length) return rects[0]
    const block = caretBlock()
    return block?.getBoundingClientRect() ?? null
  }

  const relativePoint = (rect: DOMRect) => {
    const wrap = wrapRef.current!.getBoundingClientRect()
    return { x: rect.left - wrap.left, y: rect.bottom - wrap.top }
  }

  const caretAtBlockStart = (block: HTMLElement) => {
    const sel = window.getSelection()
    if (!sel?.rangeCount || !sel.isCollapsed) return false
    const range = sel.getRangeAt(0)
    const probe = document.createRange()
    probe.selectNodeContents(block)
    probe.setEnd(range.startContainer, range.startOffset)
    return probe.toString().length === 0 && !probe.cloneContents().querySelector?.('.nb-ts')
  }

  // ── Block transforms ──────────────────────────────────────────────────────
  /** Turns a list item into a paragraph placed right after its list (splitting it). */
  const liToParagraph = (li: HTMLElement): HTMLElement => {
    const list = li.parentElement as HTMLElement
    const tail = list.cloneNode(false) as HTMLElement
    while (li.nextSibling) tail.appendChild(li.nextSibling)
    const p = document.createElement('p')
    while (li.firstChild) p.appendChild(li.firstChild)
    ensureFilled(p)
    list.after(p)
    if (tail.childNodes.length) p.after(tail)
    li.remove()
    if (!list.childNodes.length) list.remove()
    return p
  }

  const convertBlock = (source: HTMLElement, type: BlockType): HTMLElement => {
    let block = source.tagName === 'LI' ? liToParagraph(source) : source
    const root = rootRef.current!
    if (type === 'hr') {
      const hr = document.createElement('hr')
      block.before(hr)
      if (block.tagName !== 'P') {
        const p = document.createElement('p')
        while (block.firstChild) p.appendChild(block.firstChild)
        block.replaceWith(p)
        block = p
      }
      if (!block.textContent) block.innerHTML = '<br>'
      return block
    }
    let next: HTMLElement
    if (type === 'ul' || type === 'ol' || type === 'todo') {
      const list = document.createElement(type === 'ol' ? 'ol' : 'ul')
      if (type === 'todo') list.setAttribute('data-todo', 'true')
      const li = document.createElement('li')
      if (type === 'todo') li.setAttribute('data-checked', 'false')
      while (block.firstChild) li.appendChild(block.firstChild)
      ensureFilled(li)
      list.appendChild(li)
      block.replaceWith(list)
      // Merge with a neighbouring list of the same kind.
      const prev = list.previousElementSibling as HTMLElement | null
      if (prev && prev.tagName === list.tagName && prev.hasAttribute('data-todo') === list.hasAttribute('data-todo')) {
        prev.appendChild(li)
        list.remove()
      }
      placeCaretAtEnd(li)
      return li
    }
    const tag = type === 'quote' ? 'blockquote' : type === 'callout' ? 'aside' : type
    next = document.createElement(tag)
    if (type === 'callout') next.className = 'nb-callout'
    while (block.firstChild) next.appendChild(block.firstChild)
    ensureFilled(next)
    if (block.parentNode === root || block.parentNode) block.replaceWith(next)
    placeCaretAtEnd(next)
    return next
  }

  /** Inserts a timestamp chip at the caret (execCommand('insertHTML') strips non-editable spans). */
  const insertTimestamp = (seconds: number) => {
    const root = rootRef.current
    if (!root) return
    const sel = window.getSelection()
    if (!selectionInside()) {
      if (savedRange.current && root.contains(savedRange.current.startContainer)) {
        sel?.removeAllRanges()
        sel?.addRange(savedRange.current)
      } else {
        placeCaretAtEnd(root.lastElementChild ?? root)
      }
    }
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const holder = document.createElement('span')
    holder.innerHTML = timestampChipHtml(seconds)
    const chip = holder.firstChild as HTMLElement
    const space = document.createTextNode('\u00a0')
    // Never nest a chip inside another one, and drop a lone <br> placeholder.
    const container = range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement
    const inChip = container?.closest('.nb-ts')
    if (inChip) range.setStartAfter(inChip)
    range.insertNode(space)
    range.insertNode(chip)
    const block = chip.parentElement
    block?.querySelectorAll(':scope > br').forEach((br) => { if (block.textContent?.trim()) br.remove() })
    const after = document.createRange()
    after.setStart(space, 1)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
    emit()
  }

  useImperativeHandle(ref, () => ({
    insertTimestamp,
    insertQuote: (text: string, seconds?: number) => {
      const root = rootRef.current
      if (!root) return
      const quote = document.createElement('blockquote')
      const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      quote.innerHTML = `${seconds !== undefined ? `${timestampChipHtml(seconds)} ` : ''}${safe}`
      const after = document.createElement('p')
      after.innerHTML = '<br>'
      const anchor = caretBlock()
      const target = anchor?.tagName === 'LI' ? anchor.parentElement : anchor
      if (target && target.parentElement === root && target.textContent?.trim()) target.after(quote)
      else if (target && target.parentElement === root) target.replaceWith(quote)
      else root.appendChild(quote)
      quote.after(after)
      placeCaretAtEnd(after)
      emit()
    },
    focus: () => {
      const root = rootRef.current
      if (!root) return
      root.focus()
      placeCaretAtEnd(root.lastElementChild ?? root)
    },
  }))

  // ── Commands ──────────────────────────────────────────────────────────────
  const removeSlashText = () => {
    const anchor = slashAnchor.current
    const sel = window.getSelection()
    if (!anchor || !sel?.rangeCount) return
    const range = document.createRange()
    try {
      range.setStart(anchor.node, anchor.offset)
      const caret = sel.getRangeAt(0)
      range.setEnd(caret.startContainer, caret.startOffset)
      range.deleteContents()
    } catch { /* caret moved elsewhere */ }
  }

  const runCommand = (cmd: Command) => {
    removeSlashText()
    setSlash(null)
    slashAnchor.current = null
    if (cmd.id === 'ts') { insertTimestamp(getTime()); return }
    const block = caretBlock()
    if (block) convertBlock(block, cmd.id)
    emit()
  }

  const format = (kind: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'mark' | 'code') => {
    if (kind === 'mark' || kind === 'code') {
      const sel = window.getSelection()
      if (!sel?.rangeCount || sel.isCollapsed) return
      const range = sel.getRangeAt(0)
      const tag = FORMAT_TAGS[kind]
      const existing = (range.commonAncestorContainer instanceof HTMLElement ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest(tag.toLowerCase())
      if (existing && rootRef.current?.contains(existing)) {
        existing.replaceWith(...Array.from(existing.childNodes))
      } else {
        const wrapper = document.createElement(tag.toLowerCase())
        wrapper.appendChild(range.extractContents())
        range.insertNode(wrapper)
        sel.removeAllRanges()
        const after = document.createRange()
        after.selectNodeContents(wrapper)
        sel.addRange(after)
      }
    } else {
      document.execCommand(kind)
    }
    emit()
    updateToolbar()
  }

  const updateToolbar = useCallback(() => {
    const sel = selectionInside()
    if (!sel || sel.isCollapsed || !wrapRef.current) { setToolbar(null); return }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect.width && !rect.height) { setToolbar(null); return }
    const wrap = wrapRef.current.getBoundingClientRect()
    const within = (tag: string) => Boolean((sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode?.parentElement)?.closest(tag))
    setToolbar({
      x: Math.max(8, Math.min(wrap.width - 8, rect.left + rect.width / 2 - wrap.left)),
      y: rect.top - wrap.top,
      active: {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        mark: within('mark'),
        code: within('code'),
      },
    })
  }, [])

  useEffect(() => {
    const onSelection = () => {
      const sel = selectionInside()
      if (sel?.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange()
      updateToolbar()
      // Notion-style hint on the empty line holding the caret.
      const root = rootRef.current
      if (!root) return
      root.querySelectorAll('.nb-hint').forEach((el) => el.classList.remove('nb-hint'))
      const block = sel ? caretBlock() : null
      if (block && block.tagName === 'P' && !block.textContent && !block.querySelector('.nb-ts') && !root.classList.contains('is-empty')) {
        block.classList.add('nb-hint')
        block.setAttribute('data-hint', hintRef.current)
      }
    }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [updateToolbar])

  // ── Events ────────────────────────────────────────────────────────────────
  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    const native = event.nativeEvent as InputEvent
    const block = caretBlock()
    const sel = window.getSelection()

    // Markdown shortcuts typed at the start of a paragraph.
    if (native.data === ' ' && block && (block.tagName === 'P' || block.tagName === 'DIV')) {
      const text = (block.textContent || '').replace(/ /g, ' ')
      const shortcuts: Record<string, BlockType> = { '# ': 'h1', '## ': 'h2', '### ': 'h3', '- ': 'ul', '* ': 'ul', '1. ': 'ol', '[] ': 'todo', '[ ] ': 'todo', '> ': 'quote', '! ': 'callout' }
      const type = shortcuts[text]
      if (type) {
        block.textContent = ''
        convertBlock(block, type)
        emit()
        return
      }
    }
    if (native.data === '-' && block?.tagName === 'P' && block.textContent === '---') {
      block.textContent = ''
      convertBlock(block, 'hr')
      emit()
      return
    }

    // Slash menu.
    if (native.data === '/' && sel?.anchorNode?.nodeType === Node.TEXT_NODE) {
      const node = sel.anchorNode as Text
      const offset = sel.anchorOffset - 1
      const before = node.data.slice(0, offset)
      if (!before.trim() || /\s$/.test(before)) {
        slashAnchor.current = { node, offset }
        const rect = caretRect()
        if (rect) setSlash({ ...relativePoint(rect), query: '', index: 0 })
      }
    } else if (slash && slashAnchor.current && sel?.anchorNode === slashAnchor.current.node) {
      const typed = slashAnchor.current.node.data.slice(slashAnchor.current.offset + 1, sel.anchorOffset)
      if (typed.includes(' ') && !commands.some((cmd) => cmd.label.toLowerCase().startsWith(typed.toLowerCase()))) setSlash(null)
      else setSlash((prev) => (prev ? { ...prev, query: typed, index: 0 } : prev))
    } else if (slash) {
      setSlash(null)
    }

    // "@" offers to drop the current video time.
    if (native.data === '@') {
      const rect = caretRect()
      if (rect) setAtMenu(relativePoint(rect))
    } else if (atMenu) {
      setAtMenu(null)
    }

    emit()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key.toLowerCase() === 'j') {
      event.preventDefault()
      insertTimestamp(getTime())
      return
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'h') {
      event.preventDefault()
      format('mark')
      return
    }

    if (slash) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setSlash({ ...slash, index: (slash.index + 1) % Math.max(1, filtered.length) }); return }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSlash({ ...slash, index: (slash.index - 1 + filtered.length) % Math.max(1, filtered.length) }); return }
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (filtered[slash.index]) { event.preventDefault(); runCommand(filtered[slash.index]); return }
      }
      if (event.key === 'Escape') { event.preventDefault(); setSlash(null); return }
    }

    if (atMenu) {
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        document.execCommand('delete') // the "@"
        setAtMenu(null)
        insertTimestamp(getTime())
        return
      }
      if (event.key === 'Escape') { setAtMenu(null); return }
    }

    const block = caretBlock()
    if (!block) return

    if (event.key === 'Enter' && !event.shiftKey) {
      const empty = !block.textContent?.trim() && !block.querySelector('.nb-ts')
      // Leave a list / quote / callout on an empty line.
      if (empty && ['LI', 'BLOCKQUOTE', 'ASIDE', 'H1', 'H2', 'H3'].includes(block.tagName)) {
        event.preventDefault()
        convertBlock(block, 'p')
        emit()
        return
      }
      // Headings, quotes and callouts are single-line: continue with a paragraph.
      if (['H1', 'H2', 'H3', 'BLOCKQUOTE', 'ASIDE'].includes(block.tagName)) {
        const sel = window.getSelection()
        const range = sel?.getRangeAt(0)
        if (range) {
          const tail = document.createRange()
          tail.selectNodeContents(block)
          tail.setStart(range.endContainer, range.endOffset)
          if (!tail.toString()) {
            event.preventDefault()
            const p = document.createElement('p')
            p.innerHTML = '<br>'
            block.after(p)
            placeCaretAtEnd(p)
            emit()
            return
          }
        }
      }
    }

    if (event.key === 'Backspace' && ['LI', 'BLOCKQUOTE', 'ASIDE', 'H1', 'H2', 'H3'].includes(block.tagName) && caretAtBlockStart(block)) {
      event.preventDefault()
      const p = convertBlock(block, 'p')
      const range = document.createRange()
      range.setStart(p, 0)
      range.collapse(true)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      emit()
    }
  }

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const chip = target.closest('.nb-ts') as HTMLElement | null
    if (chip) {
      event.preventDefault()
      onSeek(Number(chip.dataset.seconds) || 0)
      return
    }
    if (target.tagName === 'LI' && target.parentElement?.hasAttribute('data-todo')) {
      const box = target.getBoundingClientRect()
      if (event.clientX - box.left < 26) {
        event.preventDefault()
        target.dataset.checked = target.dataset.checked === 'true' ? 'false' : 'true'
        emit()
      }
    }
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    if (text) document.execCommand('insertText', false, text)
  }

  const handleFocus = () => {
    document.execCommand('defaultParagraphSeparator', false, 'p')
  }

  const formatButtons: { kind: Parameters<typeof format>[0]; icon: React.ReactNode; label: string }[] = [
    { kind: 'bold', icon: <Bold size={14} />, label: c.fmtBold },
    { kind: 'italic', icon: <Italic size={14} />, label: c.fmtItalic },
    { kind: 'underline', icon: <Underline size={14} />, label: c.fmtUnderline },
    { kind: 'strikeThrough', icon: <Strikethrough size={14} />, label: c.fmtStrike },
    { kind: 'mark', icon: <Highlighter size={14} />, label: c.fmtHighlight },
    { kind: 'code', icon: <Code size={14} />, label: c.fmtCode },
  ]

  return (
    <div className="nb-wrap" ref={wrapRef}>
      <div
        ref={rootRef}
        className="nb-editor"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        role="textbox"
        aria-multiline="true"
        aria-label={c.notesTitle}
        data-placeholder={c.notesPlaceholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onPaste={handlePaste}
        onFocus={handleFocus}
        onBlur={() => { setSlash(null); setAtMenu(null) }}
      />

      {toolbar && (
        <div className="nb-toolbar" style={{ left: toolbar.x, top: toolbar.y }} onMouseDown={(e) => e.preventDefault()}>
          {formatButtons.map((button) => (
            <button key={button.kind} type="button" title={button.label} aria-label={button.label}
              className={toolbar.active[button.kind] ? 'on' : ''} onClick={() => format(button.kind)}>
              {button.icon}
            </button>
          ))}
          <span className="nb-toolbar-sep" />
          <button type="button" title={c.cmdH2} aria-label={c.cmdH2} onClick={() => { const b = caretBlock(); if (b) { convertBlock(b, b.tagName === 'H2' ? 'p' : 'h2'); emit() } }}>
            <Heading2 size={14} />
          </button>
          <button type="button" title={c.cmdTodo} aria-label={c.cmdTodo} onClick={() => { const b = caretBlock(); if (b) { convertBlock(b, 'todo'); emit() } }}>
            <ListChecks size={14} />
          </button>
        </div>
      )}

      {slash && filtered.length > 0 && (
        <div className="nb-menu" style={{ left: slash.x, top: slash.y + 6 }} onMouseDown={(e) => e.preventDefault()} role="listbox">
          <div className="nb-menu-label">{c.blocks}</div>
          {filtered.map((cmd, index) => (
            <button key={cmd.id} type="button" role="option" aria-selected={index === slash.index}
              className={index === slash.index ? 'active' : ''}
              onMouseEnter={() => setSlash({ ...slash, index })}
              onClick={() => runCommand(cmd)}>
              <span className="nb-menu-icon">{cmd.icon}</span>
              <span className="nb-menu-name">{cmd.id === 'ts' ? `${cmd.label} · ${formatClock(getTime())}` : cmd.label}</span>
              {cmd.hint && <kbd>{cmd.hint}</kbd>}
            </button>
          ))}
        </div>
      )}

      {atMenu && (
        <div className="nb-menu nb-at" style={{ left: atMenu.x, top: atMenu.y + 6 }} onMouseDown={(e) => e.preventDefault()}>
          <button type="button" className="active" onClick={() => { document.execCommand('delete'); setAtMenu(null); insertTimestamp(getTime()) }}>
            <span className="nb-menu-icon"><Clock size={15} /></span>
            <span className="nb-menu-name">{c.insertMoment} {formatClock(getTime())}</span>
            <kbd>↵</kbd>
          </button>
        </div>
      )}
    </div>
  )
})
