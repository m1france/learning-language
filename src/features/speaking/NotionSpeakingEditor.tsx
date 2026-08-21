import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Clock, CornerDownLeft, Sparkles } from 'lucide-react'

type NotionSpeakingEditorProps = {
  initialContent: string
  currentTime: number
  onSeek: (seconds: number) => void
  onChange: (serializedContent: string) => void
  placeholder?: string
}

function parseSecondsFromStr(str: string): number {
  const clean = str.replace(/[^0-9:]/g, '')
  const parts = clean.split(':').map((p) => parseInt(p, 10))
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return 0
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Convert plain markdown/text into rich HTML with styled timestamp chips
function textToHtml(raw: string): string {
  if (!raw || !raw.trim()) return '<p><br></p>'

  const normalized = raw.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const htmlLines = lines.map((line) => {
    if (!line.trim()) return '<p><br></p>'

    // Replace @MM:SS or [MM:SS] with styled inline non-editable chip
    let processed = line.replace(
      /(@[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?|\[[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\])/g,
      (match) => {
        const secs = parseSecondsFromStr(match)
        const label = match.replace(/^[@\[\]]/g, '').trim()
        return `<span class="notion-ts-chip" contenteditable="false" data-seconds="${secs}"><span class="chip-icon">▶</span> ${label}</span>`
      },
    )

    // Basic markdown tags conversion for initial load
    if (processed.startsWith('### ')) {
      return `<h3>${processed.substring(4)}</h3>`
    }
    if (processed.startsWith('## ')) {
      return `<h2>${processed.substring(3)}</h2>`
    }
    if (processed.startsWith('# ')) {
      return `<h1>${processed.substring(2)}</h1>`
    }
    if (processed.startsWith('> ')) {
      return `<blockquote>${processed.substring(2)}</blockquote>`
    }
    if (processed.startsWith('- ') || processed.startsWith('* ')) {
      return `<ul><li>${processed.substring(2)}</li></ul>`
    }

    // Bold **text**
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic *text*
    processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>')

    return `<p>${processed}</p>`
  })

  return htmlLines.join('')
}

// Recursive helper to get text + inline markdown from a DOM node
function nodeToText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || ''
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (tag === 'br') return '\n'

    let inner = ''
    el.childNodes.forEach((child) => {
      inner += nodeToText(child)
    })

    if (tag === 'strong' || tag === 'b') return `**${inner}**`
    if (tag === 'em' || tag === 'i') return `*${inner}*`
    if (tag === 'u') return `<u>${inner}</u>`
    if (tag === 'code') return `\`${inner}\``

    return inner
  }
  return ''
}

// Serialize contentEditable HTML back to clean text/markdown with @MM:SS
function htmlToText(html: string): string {
  if (!html || !html.trim()) return ''

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Convert all timestamp chips to clean @MM:SS text
  const chips = doc.querySelectorAll('.notion-ts-chip')
  chips.forEach((chip) => {
    const secs = parseInt(chip.getAttribute('data-seconds') || '0', 10)
    const textNode = doc.createTextNode(`@${formatTime(secs)}`)
    chip.replaceWith(textNode)
  })

  const lines: string[] = []

  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').replace(/\u00A0/g, ' ')
      if (text.trim()) {
        lines.push(text.trim())
      }
      return
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tag = el.tagName.toLowerCase()

      if (tag === 'h1') {
        const text = nodeToText(el).replace(/\u00A0/g, ' ').trim()
        lines.push(`# ${text}`)
        return
      }
      if (tag === 'h2') {
        const text = nodeToText(el).replace(/\u00A0/g, ' ').trim()
        lines.push(`## ${text}`)
        return
      }
      if (tag === 'h3') {
        const text = nodeToText(el).replace(/\u00A0/g, ' ').trim()
        lines.push(`### ${text}`)
        return
      }
      if (tag === 'blockquote') {
        const text = nodeToText(el).replace(/\u00A0/g, ' ').trim()
        lines.push(`> ${text}`)
        return
      }
      if (tag === 'ul' || tag === 'ol') {
        const lis = el.querySelectorAll('li')
        if (lis.length > 0) {
          lis.forEach((li) => {
            const text = nodeToText(li).replace(/\u00A0/g, ' ').trim()
            lines.push(`- ${text}`)
          })
        } else {
          const text = nodeToText(el).replace(/\u00A0/g, ' ').trim()
          lines.push(`- ${text}`)
        }
        return
      }
      if (tag === 'li') {
        const text = nodeToText(el).replace(/\u00A0/g, ' ').trim()
        lines.push(`- ${text}`)
        return
      }

      // Paragraphs / divs / generic containers
      const text = nodeToText(el).replace(/\u00A0/g, ' ')
      // Check if it represents an empty paragraph / blank line
      if (!text.trim() && (el.querySelector('br') || !text)) {
        lines.push('')
      } else {
        const sublines = text.split('\n')
        sublines.forEach((s) => lines.push(s.trim()))
      }
    }
  })

  // Remove trailing blank lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines.join('\n')
}

export function NotionSpeakingEditor({
  initialContent,
  currentTime,
  onSeek,
  onChange,
  placeholder = 'Tape tes notes ici... Utilise @ pour insérer un horodatage vidéo.',
}: NotionSpeakingEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [showAtMenu, setShowAtMenu] = useState(false)
  const [atMenuCoords, setAtMenuCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const savedRangeRef = useRef<Range | null>(null)

  // Initialize content on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = textToHtml(initialContent)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle clicking on interactive timestamp chips
  const handleEditorClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      const chip = target.closest('.notion-ts-chip') as HTMLElement | null
      if (chip) {
        e.preventDefault()
        e.stopPropagation()
        const secs = parseInt(chip.getAttribute('data-seconds') || '0', 10)
        onSeek(secs)
      }
    },
    [onSeek],
  )

  // Emit changes
  const handleInput = useCallback(() => {
    if (!editorRef.current) return
    const serialized = htmlToText(editorRef.current.innerHTML)
    onChange(serialized)
  }, [onChange])

  // Insert timestamp chip at saved cursor position
  const insertTimestampAtCaret = useCallback(
    (seconds: number) => {
      const sel = window.getSelection()
      if (!sel) return

      let range = savedRangeRef.current
      if (!range && sel.rangeCount > 0) {
        range = sel.getRangeAt(0)
      }
      if (!range || !editorRef.current?.contains(range.commonAncestorContainer)) {
        // Fallback to end of editor
        if (editorRef.current) {
          editorRef.current.focus()
          range = document.createRange()
          range.selectNodeContents(editorRef.current)
          range.collapse(false)
        }
      }

      if (range) {
        sel.removeAllRanges()
        sel.addRange(range)

        // If the range ends with '@', delete it
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
          const textNode = range.startContainer as Text
          const text = textNode.textContent || ''
          const pos = range.startOffset
          if (pos > 0 && text[pos - 1] === '@') {
            textNode.deleteData(pos - 1, 1)
          }
        }

        const formatted = formatTime(seconds)
        const chip = document.createElement('span')
        chip.className = 'notion-ts-chip'
        chip.contentEditable = 'false'
        chip.setAttribute('data-seconds', String(seconds))
        chip.innerHTML = `<span class="chip-icon">▶</span> ${formatted}`

        const space = document.createTextNode('\u00A0') // Non-breaking space

        range.insertNode(space)
        range.insertNode(chip)

        // Place caret after space
        const newRange = document.createRange()
        newRange.setStartAfter(space)
        newRange.collapse(true)
        sel.removeAllRanges()
        sel.addRange(newRange)

        handleInput()
      }

      setShowAtMenu(false)
      savedRangeRef.current = null
    },
    [handleInput],
  )

  // Handle key events: shortcuts (Cmd+B, Cmd+I, @ popup, Enter on popup, markdown triggers)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If @ menu is open, handle Enter or Escape
    if (showAtMenu) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        insertTimestampAtCaret(Math.floor(currentTime))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowAtMenu(false)
        return
      }
    }

    // Handle Enter: Exit blockquote / heading to normal paragraph <p>
    if (e.key === 'Enter') {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const blockquote = (range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement
        )?.closest('blockquote')

        const heading = (range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement
        )?.closest('h1, h2, h3')

        // Inside blockquote
        if (blockquote) {
          // Shift+Enter: soft break inside blockquote
          if (e.shiftKey) {
            e.preventDefault()
            document.execCommand('insertLineBreak')
            handleInput()
            return
          }

          // Enter: Exit blockquote and create a normal paragraph <p> right after it
          e.preventDefault()
          const text = (blockquote.textContent || '').replace(/[\u200B\u00A0]/g, '').trim()

          // If the blockquote was completely empty, replace it directly with <p>
          if (!text) {
            const p = document.createElement('p')
            p.innerHTML = '<br>'
            blockquote.replaceWith(p)
            const newRange = document.createRange()
            newRange.setStart(p, 0)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
            handleInput()
            return
          }

          // If it has content, append a new <p> after the blockquote and move focus there
          const p = document.createElement('p')
          p.innerHTML = '<br>'
          blockquote.insertAdjacentElement('afterend', p)
          const newRange = document.createRange()
          newRange.setStart(p, 0)
          newRange.collapse(true)
          sel.removeAllRanges()
          sel.addRange(newRange)
          handleInput()
          return
        }

        // Inside heading
        if (heading && !e.shiftKey) {
          e.preventDefault()
          const p = document.createElement('p')
          p.innerHTML = '<br>'
          heading.insertAdjacentElement('afterend', p)
          const newRange = document.createRange()
          newRange.setStart(p, 0)
          newRange.collapse(true)
          sel.removeAllRanges()
          sel.addRange(newRange)
          handleInput()
          return
        }
      }
    }

    // Handle Backspace: Convert empty blockquote/heading back to normal paragraph
    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const blockquote = (range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement
        )?.closest('blockquote')

        const heading = (range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement
        )?.closest('h1, h2, h3')

        if (blockquote) {
          const text = (blockquote.textContent || '').replace(/[\u200B\u00A0]/g, '').trim()
          if (!text || (range.startOffset === 0 && range.collapsed)) {
            e.preventDefault()
            const p = document.createElement('p')
            p.innerHTML = text ? text : '<br>'
            blockquote.replaceWith(p)
            const newRange = document.createRange()
            newRange.setStart(p, 0)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
            handleInput()
            return
          }
        }

        if (heading) {
          const text = (heading.textContent || '').replace(/[\u200B\u00A0]/g, '').trim()
          if (!text || (range.startOffset === 0 && range.collapsed)) {
            e.preventDefault()
            const p = document.createElement('p')
            p.innerHTML = text ? text : '<br>'
            heading.replaceWith(p)
            const newRange = document.createRange()
            newRange.setStart(p, 0)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
            handleInput()
            return
          }
        }
      }
    }

    // Markdown Shortcut: Cmd+B / Ctrl+B
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      document.execCommand('bold', false)
      handleInput()
      return
    }

    // Markdown Shortcut: Cmd+I / Ctrl+I
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault()
      document.execCommand('italic', false)
      handleInput()
      return
    }

    // Markdown Shortcut: Cmd+U / Ctrl+U
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault()
      document.execCommand('underline', false)
      handleInput()
      return
    }

    // Markdown auto-transforms on Space (e.g. "# ", "## ", "> ", "- ")
    if (e.key === ' ') {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const node = range.startContainer
        if (node.nodeType === Node.TEXT_NODE) {
          const textBefore = (node.textContent || '').substring(0, range.startOffset).trim()

          // Heading 1: "#"
          if (textBefore === '#') {
            e.preventDefault()
            node.textContent = '\u200B'
            document.execCommand('formatBlock', false, 'h1')
            handleInput()
            return
          }
          // Heading 2: "##"
          if (textBefore === '##') {
            e.preventDefault()
            node.textContent = '\u200B'
            document.execCommand('formatBlock', false, 'h2')
            handleInput()
            return
          }
          // Heading 3: "###"
          if (textBefore === '###') {
            e.preventDefault()
            node.textContent = '\u200B'
            document.execCommand('formatBlock', false, 'h3')
            handleInput()
            return
          }
          // Blockquote: ">"
          if (textBefore === '>') {
            e.preventDefault()
            node.textContent = '\u200B'
            document.execCommand('formatBlock', false, 'blockquote')
            handleInput()
            return
          }
          // Bullet list: "-" or "*"
          if (textBefore === '-' || textBefore === '*') {
            e.preventDefault()
            node.textContent = '\u200B'
            document.execCommand('insertUnorderedList', false)
            handleInput()
            return
          }
        }
      }
    }
  }

  // Detect typing of '@' to show contextual autocomplete
  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === '@') {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        savedRangeRef.current = range.cloneRange()

        const rect = range.getBoundingClientRect()
        if (rect && editorRef.current) {
          const editorRect = editorRef.current.getBoundingClientRect()
          setAtMenuCoords({
            top: rect.bottom - editorRect.top + 8,
            left: Math.max(10, rect.left - editorRect.left),
          })
          setShowAtMenu(true)
        }
      }
    } else if (showAtMenu && e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
      // If user typed something other than @ and didn't confirm, check if caret is still right after @
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const text = range.startContainer.textContent || ''
        const pos = range.startOffset
        if (pos === 0 || text[pos - 1] !== '@') {
          setShowAtMenu(false)
        }
      }
    }
  }

  return (
    <div className="notion-speaking-editor-container">
      {/* Contextual @ Menu Popup */}
      {showAtMenu && (
        <div
          className="notion-at-menu-popup"
          style={{ top: `${atMenuCoords.top}px`, left: `${atMenuCoords.left}px` }}
        >
          <div className="at-menu-header">
            <Clock size={13} className="at-icon" />
            <span>Horodatage vidéo</span>
          </div>
          <button
            className="at-menu-item active"
            onMouseDown={(e) => {
              e.preventDefault()
              insertTimestampAtCaret(Math.floor(currentTime))
            }}
          >
            <span className="at-item-badge">@{formatTime(currentTime)}</span>
            <span className="at-item-label">Insérer le moment actuel</span>
            <CornerDownLeft size={13} className="at-enter-icon" />
          </button>
        </div>
      )}

      {/* Live Notion-like ContentEditable Document */}
      <div
        ref={editorRef}
        className="notion-live-document"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onClick={handleEditorClick}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        data-placeholder={placeholder}
      />
    </div>
  )
}
