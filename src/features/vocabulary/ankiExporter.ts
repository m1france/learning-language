import type { LearnedWord, Resource } from '../../domain'

export type AnkiExportFormat = 'tsv' | 'csv' | 'json'

/**
 * Builds a TSV string formatted for easy import into Anki.
 * Fields: 
 * 1. Word / Expression
 * 2. Translation & Pronunciation
 * 3. Context Sentence
 * 4. Source Resource (if any)
 * 5. Level / Knowledge (1-6)
 * 6. Tags
 */
export function generateAnkiTsv(words: LearnedWord[], resources: Resource[] = []): string {
  const resourceMap = new Map(resources.map((r) => [r.id, r.title]))

  const rows = words.map((w) => {
    const wordField = w.word
    const phoneticPart = w.phonetic ? `<span style="color:#888; font-size:0.9em;">[${w.phonetic}]</span>` : ''
    const translationPart = `<b>${w.translation || (w.definitions?.[0]?.translation ?? '')}</b>`
    const backField = [translationPart, phoneticPart].filter(Boolean).join(' ')
    const contextField = w.contextSentence ? `<i>« ${w.contextSentence} »</i>` : ''
    const sourceField = w.sourceResourceId ? resourceMap.get(w.sourceResourceId) || '' : ''
    const knowledgeField = `Niveau ${w.knowledge ?? 1}/6`
    const tagsField = (w.tags || []).join(' ')

    return [wordField, backField, contextField, sourceField, knowledgeField, tagsField]
      .map((col) => col.replace(/\t/g, ' ').replace(/\n/g, '<br>'))
      .join('\t')
  })

  // Anki TSV metadata header
  const header = '#separator:tab\n#html:true\n#tags column:6\n'
  return header + rows.join('\n')
}

/**
 * Triggers a client-side file download of the generated Anki TSV.
 */
export function downloadAnkiExport(words: LearnedWord[], resources: Resource[] = [], filename = 'vivre-vocabulaire-anki.tsv') {
  const tsv = generateAnkiTsv(words, resources)
  const blob = new Blob(['\ufeff' + tsv], { type: 'text/tab-separated-values;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * AnkiConnect Integration:
 * Attempts to ping AnkiConnect (running locally on port 8765) and sync notes into a deck.
 */
export async function syncWithAnkiConnect(
  words: LearnedWord[],
  deckName = 'Vivre la Langue',
  modelName = 'Basic (and reversed card)',
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    // 1. Check if AnkiConnect is alive
    const versionRes = await fetch('http://127.0.0.1:8765', {
      method: 'POST',
      body: JSON.stringify({ action: 'version', version: 6 }),
    }).catch(() => null)

    if (!versionRes || !versionRes.ok) {
      return {
        success: false,
        error: 'AnkiConnect n’est pas détecté. Assure-toi qu’Anki est ouvert avec le plugin AnkiConnect installé (port 8765).',
      }
    }

    // 2. Ensure deck exists
    await fetch('http://127.0.0.1:8765', {
      method: 'POST',
      body: JSON.stringify({
        action: 'createDeck',
        version: 6,
        params: { deck: deckName },
      }),
    })

    // 3. Format notes for AnkiConnect
    const notes = words.map((w) => {
      const phoneticPart = w.phonetic ? `<br><small style="color:#777">[${w.phonetic}]</small>` : ''
      const contextPart = w.contextSentence ? `<br><br><small><i>« ${w.contextSentence} »</i></small>` : ''
      const front = `<strong>${w.word}</strong>${phoneticPart}`
      const back = `<strong>${w.translation || w.definitions?.[0]?.translation || ''}</strong>${contextPart}`

      return {
        deckName,
        modelName,
        fields: {
          Front: front,
          Back: back,
        },
        tags: w.tags || ['vivre-la-langue'],
      }
    })

    // 4. Add notes
    const addNotesRes = await fetch('http://127.0.0.1:8765', {
      method: 'POST',
      body: JSON.stringify({
        action: 'addNotes',
        version: 6,
        params: { notes },
      }),
    })

    const data = await addNotesRes.json()
    const addedCount = Array.isArray(data.result) ? data.result.filter(Boolean).length : 0

    return {
      success: true,
      count: addedCount,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur inconnue lors de la connexion à Anki',
    }
  }
}
