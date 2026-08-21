import React from 'react'

/**
 * Parses and renders phonetic IPA strings containing Markdown emphasis (e.g. `**tʃɪ**`, `*stress*`, `__bold__`).
 * Also ensures surrounding brackets `[...]` or `/.../` are cleanly formatted without duplicates.
 */
export function renderPhoneticFormatted(raw?: string): React.ReactNode {
  if (!raw || !raw.trim()) return null
  const trimmed = raw.trim()

  // Remove outermost brackets/slashes if they enclose the whole string, so we control the presentation
  let clean = trimmed
  let hasOuterBrackets = false
  let hasOuterSlashes = false

  if (clean.startsWith('[') && clean.endsWith(']') && clean.length > 2) {
    clean = clean.slice(1, -1).trim()
    hasOuterBrackets = true
  } else if (clean.startsWith('/') && clean.endsWith('/') && clean.length > 2) {
    clean = clean.slice(1, -1).trim()
    hasOuterSlashes = true
  }

  // Parse markdown bold (**...** or __...__) and italic (*...* or _..._)
  const parts = clean.split(/(\*\*[\s\S]*?\*\*|__[\s\S]*?__|\*[\s\S]*?\*|_[\s\S]*?_)/g)

  const elements = parts.map((part, idx) => {
    if ((part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
        (part.startsWith('__') && part.endsWith('__') && part.length >= 4)) {
      const inner = part.slice(2, -2)
      return (
        <strong key={idx} className="phonetic-stress" style={{ fontWeight: 700, color: 'inherit' }}>
          {inner}
        </strong>
      )
    }
    if ((part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2)) {
      const inner = part.slice(1, -1)
      return (
        <em key={idx} className="phonetic-italic" style={{ fontStyle: 'italic', color: 'inherit' }}>
          {inner}
        </em>
      )
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>
  })

  // Format with consistent wrapping if it originally had slashes or brackets
  if (hasOuterSlashes) {
    return <span className="phonetic-wrapper">/{elements}/</span>
  }
  return <span className="phonetic-wrapper">[{elements}]</span>
}
