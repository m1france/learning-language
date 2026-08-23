import React from 'react'

/**
 * Formats a raw IPA pronunciation string so that:
 * - The primary stressed syllable (originally indicated with ' or ˈ) is formatted in Markdown bold (**syllable**).
 * - Syllable breaks (dots, commas, low commas ˌ) are replaced by ' · ' (space before and after).
 * - Stress markers (' or ˈ) are stripped out.
 * - Outermost slashes /.../ are preserved or normalized.
 */
export function formatIpaPronunciation(raw?: string): string {
  if (!raw || !raw.trim()) return ''
  let str = raw.trim()

  // Remove outer slashes / brackets
  if ((str.startsWith('/') && str.endsWith('/')) || (str.startsWith('[') && str.endsWith(']'))) {
    str = str.slice(1, -1).trim()
  }

  // If already formatted with **bold**, normalize separators
  if (str.includes('**')) {
    const normalized = str
      .replace(/[ˈ']/g, '')
      .replace(/[.,ˌ]\s*/g, ' · ')
      .replace(/\s*·\s*/g, ' · ')
      .trim()
    return `/${normalized}/`
  }

  // Syllable boundary detection
  const hasSeparators = /[.,·\-\sˌ]/.test(str)

  if (hasSeparators) {
    const rawTokens = str.split(/[.,·\-\sˌ]+/).filter(Boolean)
    const formattedSyllables = rawTokens.map((token) => {
      if (token.includes('ˈ') || token.includes("'")) {
        const cleaned = token.replace(/[ˈ']/g, '').trim()
        return cleaned ? `**${cleaned}**` : ''
      }
      return token.replace(/[ˈ']/g, '').trim()
    }).filter(Boolean)
    return `/${formattedSyllables.join(' · ')}/`
  }

  // If there are no syllable separators, but has ˈ or '
  if (str.includes('ˈ') || str.includes("'")) {
    const stressIdx = str.search(/[ˈ']/)
    const before = str.slice(0, stressIdx).trim()
    const after = str.slice(stressIdx + 1).trim()
    if (before) {
      return `/${before} · **${after}**/`
    }
    return `/**${after}**/`
  }

  return `/${str}/`
}

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

/**
 * Safely parses simple markdown like **bold**, *italic*, __bold__, _italic_, <u>underline</u>.
 * Returns formatted React nodes without raw markdown syntax characters.
 */
export function renderStyledMarkdown(text?: string): React.ReactNode {
  if (!text || !text.trim()) return null
  const regex = /(\*\*[\s\S]+?\*\*|__[\s\S]+?__|<u>[\s\S]*?<\/u>|\*[^*]+?\*|_[^_]+?_)/i
  const parts = text.split(regex)

  return parts.map((part, index) => {
    const key = `md-${index}`
    if (!part) return null

    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.toLowerCase().startsWith('<u>') && part.toLowerCase().endsWith('</u>') && part.length >= 7) {
      return <u key={key}>{part.slice(3, -4)}</u>
    }
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return part
  })
}
