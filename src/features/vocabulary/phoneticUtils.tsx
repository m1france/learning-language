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

  // Remove outer slashes / brackets / quotes
  if ((str.startsWith('/') && str.endsWith('/') && str.length >= 2) ||
      (str.startsWith('[') && str.endsWith(']') && str.length >= 2)) {
    str = str.slice(1, -1).trim()
  }

  // Remove any remaining leading/trailing stray slashes, backslashes, or quotes
  str = str.replace(/^[/\\"'`]+|[/\\"'`]+$/g, '').trim()
  if (!str) return ''

  // Normalize syllable separator variants to uniform ' · '
  const normalizedSeparators = str
    .replace(/\s*·\s*/g, ' · ')
    .replace(/[ˌ]/g, ' · ')
    .replace(/\s*([.,\-])\s*/g, ' · ')

  const rawTokens = normalizedSeparators
    .split(/\s*·\s+|\s+/)
    .map((t) => t.trim())
    .filter(Boolean)

  if (rawTokens.length === 0) return ''

  // Single syllable word: clean IPA without stress marks or broken bold
  if (rawTokens.length === 1) {
    const cleanSyllable = rawTokens[0]
      .replace(/[ˈ']/g, '')
      .replace(/[*_~`]/g, '')
      .trim()
    return cleanSyllable ? `/${cleanSyllable}/` : ''
  }

  // Multi-syllable word: identify stressed syllables and enclose in balanced **...**
  const formattedSyllables = rawTokens.map((token) => {
    const hasStress = token.includes('ˈ') || token.includes("'") || token.includes('**') || token.startsWith('*')
    const cleanToken = token
      .replace(/[ˈ']/g, '')
      .replace(/[*_~`]/g, '')
      .trim()

    if (!cleanToken) return ''
    if (hasStress) {
      return `**${cleanToken}**`
    }
    return cleanToken
  }).filter(Boolean)

  if (formattedSyllables.length === 0) return ''
  return `/${formattedSyllables.join(' · ')}/`
}

/**
 * Parses and renders phonetic IPA strings containing Markdown emphasis (e.g. `**tʃɪ**`).
 * Automatically formats and cleans the phonetic string first to guarantee valid display.
 */
export function renderPhoneticFormatted(raw?: string): React.ReactNode {
  if (!raw || !raw.trim()) return null
  const formatted = formatIpaPronunciation(raw)
  if (!formatted) return null

  // Remove outermost brackets/slashes so we control the presentation
  let clean = formatted.trim()
  if (clean.startsWith('/') && clean.endsWith('/') && clean.length >= 2) {
    clean = clean.slice(1, -1).trim()
  } else if (clean.startsWith('[') && clean.endsWith(']') && clean.length >= 2) {
    clean = clean.slice(1, -1).trim()
  }

  // Parse markdown bold (**...**)
  const parts = clean.split(/(\*\*[\s\S]*?\*\*)/g)

  const elements = parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const inner = part.slice(2, -2)
      return (
        <strong key={idx} className="phonetic-stress" style={{ fontWeight: 700, color: 'inherit' }}>
          {inner}
        </strong>
      )
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>
  })

  return <span className="phonetic-wrapper">/{elements}/</span>
}

/**
 * Safely parses markdown bold (**...**, __...__), italic (*...*, _..._), and underline (<u>...</u>).
 * Automatically balances unclosed tokens and strips malformed characters.
 * Returns cleanly formatted React nodes without raw markdown syntax characters leaking.
 */
export function renderStyledMarkdown(text?: string): React.ReactNode {
  if (!text || !text.trim()) return null

  // Auto-balance unclosed <u>
  let sanitized = text.trim()
  const openU = (sanitized.match(/<u>/gi) || []).length
  const closeU = (sanitized.match(/<\/u>/gi) || []).length
  if (openU > closeU) {
    sanitized += '</u>'.repeat(openU - closeU)
  }

  // Balance unclosed ** (odd count)
  const countBold = (sanitized.match(/\*\*/g) || []).length
  if (countBold % 2 !== 0) {
    sanitized += '**'
  }

  // Balance unclosed __ (odd count)
  const countUnderBold = (sanitized.match(/__/g) || []).length
  if (countUnderBold % 2 !== 0) {
    sanitized += '__'
  }

  function parse(input: string, keyPrefix = ''): React.ReactNode[] {
    if (!input) return []

    const regex = /(\*\*(?:[\s\S]+?)\*\*|__(?:[\s\S]+?)__|<u>[\s\S]*?<\/u>|\*(?:[^*]+?)\*|_(?:[^_]+?)_)/i
    const parts = input.split(regex)

    return parts.map((part, index) => {
      const key = `${keyPrefix}-${index}`
      if (!part) return null

      if (
        (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
        (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
      ) {
        const inner = part.slice(2, -2)
        return <strong key={key}>{parse(inner, `${key}-b`)}</strong>
      }

      if (part.toLowerCase().startsWith('<u>') && part.toLowerCase().endsWith('</u>') && part.length >= 7) {
        const inner = part.slice(3, -4)
        return <u key={key}>{parse(inner, `${key}-u`)}</u>
      }

      if (
        (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
      ) {
        const inner = part.slice(1, -1)
        return <em key={key}>{parse(inner, `${key}-i`)}</em>
      }

      return part
    })
  }

  return <>{parse(sanitized, 'md')}</>
}

/**
 * Strips common markdown characters (*, _, **, __, <u>, </u>) from a string.
 */
export function stripMarkdown(text?: string): string {
  if (!text) return ''
  return text
    .replace(/(\*\*|__)([\s\S]+?)\1/g, '$2')
    .replace(/(\*|_)([\s\S]+?)\1/g, '$2')
    .replace(/<u>([\s\S]*?)<\/u>/gi, '$1')
    .replace(/[*_~`]/g, '')
    .trim()
}
