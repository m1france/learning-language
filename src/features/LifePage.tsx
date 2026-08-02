import { useMemo, useState } from 'react'
import type { AppState, CustomTool } from '../domain'
import { id } from '../domain'
import { culturalEntries, recommendedTools } from '../seed'

/**
 * Vivre — contexte natif.
 * 3.1 : le "Monologue intérieur" est supprimé, la rubrique culture ne tourne
 *       plus en boucle (navigation complète), et les outils sont éditables :
 *       on peut en ajouter et en supprimer.
 */

const L = {
  fr: {
    culture: 'Le contexte natif', sub: 'Pas une leçon à part. Les petites choses qui rendent la langue vivante.',
    seeMore: 'Voir le contexte →', tools: 'Les meilleurs outils', toolsSub: 'Utiles, pas bruyants.',
    addTool: '＋ Ajouter un outil', toolName: 'Nom', toolDesc: 'Description', toolCat: 'Catégorie', toolUrl: 'Lien (optionnel)',
    save: 'Enregistrer', cancel: 'Annuler', remove: 'Retirer', all: 'Tout le contexte', prev: '←', next: '→',
  },
  en: {
    culture: 'Native context', sub: 'Not a separate lesson. The little things that make language feel lived-in.',
    seeMore: 'See the context →', tools: 'Best tools', toolsSub: 'Useful, not noisy.',
    addTool: '＋ Add a tool', toolName: 'Name', toolDesc: 'Description', toolCat: 'Category', toolUrl: 'Link (optional)',
    save: 'Save', cancel: 'Cancel', remove: 'Remove', all: 'All context', prev: '←', next: '→',
  },
} as const

export function LifePage({ ui, state, onChange }: { ui: 'fr' | 'en'; state: AppState; onChange: (state: AppState) => void }) {
  const t = L[ui]
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', description: '', category: '', url: '' })

  const tools = useMemo(() => {
    const builtin = recommendedTools.filter((tool) => !state.removedTools.includes(tool.name))
    return [...builtin.map((tool) => ({ ...tool, custom: false })), ...state.customTools.map((tool) => ({ ...tool, custom: true }))]
  }, [state.removedTools, state.customTools])

  const entry = culturalEntries[((index % culturalEntries.length) + culturalEntries.length) % culturalEntries.length]

  const addTool = () => {
    if (!draft.name.trim()) return
    const tool: CustomTool = { id: id('tool'), name: draft.name.trim(), description: draft.description.trim(), category: draft.category.trim() || 'Perso', url: draft.url.trim() || undefined }
    onChange({ ...state, customTools: [...state.customTools, tool] })
    setDraft({ name: '', description: '', category: '', url: '' })
    setAdding(false)
  }

  const removeTool = (tool: { name: string; custom: boolean; id?: string }) => {
    if (tool.custom && tool.id) onChange({ ...state, customTools: state.customTools.filter((item) => item.id !== tool.id) })
    else onChange({ ...state, removedTools: [...state.removedTools, tool.name] })
  }

  return <div className="page life-page">
    <header className="page-header"><div><p className="eyebrow">{ui === 'fr' ? 'VIVRE' : 'LIVE'}</p><h1>{t.culture}</h1><p className="subhead">{t.sub}</p></div></header>

    <section className="culture-feature">
      <div>
        <p className="eyebrow">{entry.label} · {(index % culturalEntries.length + culturalEntries.length) % culturalEntries.length + 1}/{culturalEntries.length}</p>
        <h2>{entry.headline}</h2>
        <p>{entry.body}</p>
        {expanded && <p className="culture-more">{entry.more}</p>}
        <div className="culture-actions">
          <button className="text-button" onClick={() => setExpanded(!expanded)}>{t.seeMore}</button>
          <div className="culture-nav">
            <button onClick={() => { setIndex(index - 1); setExpanded(false) }}>{t.prev}</button>
            <button onClick={() => { setIndex(index + 1); setExpanded(false) }}>{t.next}</button>
          </div>
        </div>
      </div>
      <aside><span>{entry.title.toUpperCase()}</span><i>★</i></aside>
    </section>

    <section className="culture-strip">
      {culturalEntries.map((item, itemIndex) => <button key={item.id} className={itemIndex === ((index % culturalEntries.length + culturalEntries.length) % culturalEntries.length) ? 'culture-chip active' : 'culture-chip'} onClick={() => { setIndex(itemIndex); setExpanded(false) }}>{item.title}</button>)}
    </section>

    <section className="tools-section">
      <div className="section-title">
        <div><p className="eyebrow">{t.tools.toUpperCase()}</p><h2>{t.toolsSub}</h2></div>
        <button className="outline" onClick={() => setAdding(!adding)}>{adding ? t.cancel : t.addTool}</button>
      </div>
      {adding && <div className="tool-form">
        <input placeholder={t.toolName} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <input placeholder={t.toolDesc} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        <input placeholder={t.toolCat} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
        <input placeholder={t.toolUrl} value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} />
        <button className="primary" onClick={addTool} disabled={!draft.name.trim()}>{t.save} <span>→</span></button>
      </div>}
      <div className="tools-grid">
        {tools.map((tool, toolIndex) => <article key={tool.name}>
          <span className={`tool-icon i${toolIndex % 4}`}>{tool.name.slice(0, 1)}</span>
          <div><small>{tool.category}{tool.custom ? ' · perso' : ''}</small><h3>{tool.name}</h3><p>{tool.description}</p></div>
          <div className="tool-actions">
            {'url' in tool && tool.url && <a href={tool.url} target="_blank" rel="noreferrer" className="tool-link">↗</a>}
            <button className="tool-remove" title={t.remove} onClick={() => removeTool(tool)}>×</button>
          </div>
        </article>)}
      </div>
    </section>
  </div>
}
