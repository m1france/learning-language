import React, { useRef, useEffect } from 'react'

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Convert markdown text to HTML for rich contentEditable display.
 */
export function markdownToHtml(md: string): string {
  if (!md) return ''

  let escaped = escapeHtml(md)

  escaped = escaped
    .replace(/&lt;u&gt;/gi, '<u>')
    .replace(/&lt;\/u&gt;/gi, '</u>')
    .replace(/&lt;ins&gt;/gi, '<u>')
    .replace(/&lt;\/ins&gt;/gi, '</u>')

  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>')
  escaped = escaped.replace(/\n/g, '<br>')

  return escaped
}

/**
 * Serialize rich contentEditable HTML back to clean markdown.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return ''

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')

  function traverse(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tag = el.tagName.toLowerCase()

      let inner = ''
      el.childNodes.forEach((child) => {
        inner += traverse(child)
      })

      if (tag === 'br') return '\n'
      if (tag === 'strong' || tag === 'b') {
        const clean = inner.trim()
        if (!clean) return inner
        return `**${clean}**`
      }
      if (tag === 'em' || tag === 'i') {
        const clean = inner.trim()
        if (!clean) return inner
        return `*${clean}*`
      }
      if (tag === 'u' || tag === 'ins') {
        const clean = inner.trim()
        if (!clean) return inner
        return `<u>${clean}</u>`
      }
      if (tag === 'div' || tag === 'p') {
        if (!inner || inner === '\n') return '\n'
        return `\n${inner}`
      }

      return inner
    }
    return ''
  }

  let result = traverse(doc.body)
  result = result.replace(/^\n+/, '').replace(/\n+$/, '')
  return result
}

export type RichInputFieldProps = {
  value: string
  placeholder?: string
  multiline?: boolean
  className?: string
  autoFocus?: boolean
  onChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

/**
 * Rich editable field rendering bold (**), italic (*), and underline (<u>) directly in-place.
 * Handles Cmd/Ctrl+B, Cmd/Ctrl+I, and Cmd/Ctrl+U shortcuts seamlessly.
 */
export function RichInputField({
  value,
  placeholder,
  multiline = false,
  className,
  autoFocus,
  onChange,
  onKeyDown,
}: RichInputFieldProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastEmittedRef = useRef(value)
  const isComposingRef = useRef(false)

  useEffect(() => {
    if (editorRef.current) {
      const currentMd = htmlToMarkdown(editorRef.current.innerHTML)
      if (value !== currentMd && value !== lastEmittedRef.current) {
        editorRef.current.innerHTML = markdownToHtml(value)
        lastEmittedRef.current = value
      }
    }
  }, [value])

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(value)
      lastEmittedRef.current = value
      if (autoFocus) {
        editorRef.current.focus()
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = () => {
    if (!editorRef.current || isComposingRef.current) return
    const md = htmlToMarkdown(editorRef.current.innerHTML)
    lastEmittedRef.current = md
    onChange(md)
  }

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase()
      if (key === 'b') {
        e.preventDefault()
        document.execCommand('bold', false)
        handleInput()
        return
      }
      if (key === 'i') {
        e.preventDefault()
        document.execCommand('italic', false)
        handleInput()
        return
      }
      if (key === 'u') {
        e.preventDefault()
        document.execCommand('underline', false)
        handleInput()
        return
      }
    }

    if (!multiline && e.key === 'Enter') {
      e.preventDefault()
    }

    onKeyDown?.(e)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    const clean = multiline ? text : text.replace(/[\r\n]+/g, ' ')
    document.execCommand('insertText', false, clean)
    handleInput()
  }

  const isEmpty = !value || value.trim() === ''

  return (
    <div
      ref={editorRef}
      contentEditable
      role="textbox"
      aria-multiline={multiline}
      data-placeholder={placeholder}
      data-empty={isEmpty ? 'true' : undefined}
      className={className}
      onInput={handleInput}
      onKeyDown={handleKeyDownInternal}
      onPaste={handlePaste}
      onCompositionStart={() => {
        isComposingRef.current = true
      }}
      onCompositionEnd={() => {
        isComposingRef.current = false
        handleInput()
      }}
    />
  )
}
