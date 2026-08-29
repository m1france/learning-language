import React, { useMemo, useState } from 'react'
import type { AppState, CustomTool, UiLanguage } from '../domain'
import { id } from '../domain'
import { culturalEntries, recommendedTools } from '../seed'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowRight,
  ExternalLink,
  Trash2,
  Sparkles,
} from 'lucide-react'

const L: Record<UiLanguage, {
  eyebrow: string
  culture: string
  sub: string
  seeMore: string
  tools: string
  toolsSub: string
  addTool: string
  toolName: string
  toolDesc: string
  toolCat: string
  toolUrl: string
  save: string
  cancel: string
  remove: string
  all: string
  prev: string
  next: string
}> = {
  fr: {
    eyebrow: 'VIVRE',
    culture: 'Le contexte natif', sub: 'Pas une leçon à part. Les petites choses qui rendent la langue vivante.',
    seeMore: 'Voir le contexte', tools: 'Les meilleurs outils', toolsSub: 'Utiles, pas bruyants.',
    addTool: 'Ajouter un outil', toolName: 'Nom', toolDesc: 'Description', toolCat: 'Catégorie', toolUrl: 'Lien (optionnel)',
    save: 'Enregistrer', cancel: 'Annuler', remove: 'Retirer', all: 'Tout le contexte',
    prev: 'Précédent', next: 'Suivant',
  },
  en: {
    eyebrow: 'LIVE',
    culture: 'Native context', sub: 'Not a separate lesson. The little things that make language feel lived-in.',
    seeMore: 'See the context', tools: 'Best tools', toolsSub: 'Useful, not noisy.',
    addTool: 'Add a tool', toolName: 'Name', toolDesc: 'Description', toolCat: 'Category', toolUrl: 'Link (optional)',
    save: 'Save', cancel: 'Cancel', remove: 'Remove', all: 'All context',
    prev: 'Previous', next: 'Next',
  },
  es: {
    eyebrow: 'VIVIR',
    culture: 'El contexto nativo', sub: 'No es una lección aparte. Los pequeños matices que hacen que el idioma cobre vida.',
    seeMore: 'Ver contexto', tools: 'Las mejores herramientas', toolsSub: 'Útiles y sin distracciones.',
    addTool: 'Añadir herramienta', toolName: 'Nombre', toolDesc: 'Descripción', toolCat: 'Categoría', toolUrl: 'Enlace (opcional)',
    save: 'Guardar', cancel: 'Cancelar', remove: 'Eliminar', all: 'Todo el contexto',
    prev: 'Anterior', next: 'Siguiente',
  },
  zh: {
    eyebrow: '融入语境',
    culture: '母语文化与生活语境', sub: '并非生硬的说教，而是让语言融入日常的点滴真实。',
    seeMore: '查看文化背景', tools: '精选实用工具', toolsSub: '高效实用，专注学习。',
    addTool: '添加自定义工具', toolName: '工具名称', toolDesc: '简介说明', toolCat: '分类', toolUrl: '链接地址（可选）',
    save: '保存', cancel: '取消', remove: '移除', all: '所有文化内容',
    prev: '上一篇', next: '下一篇',
  },
  ru: {
    eyebrow: 'ЖИЗНЬ',
    culture: 'Живой контекст языка', sub: 'Не отдельный урок, а те самые детали, которые делают язык живым и естественным.',
    seeMore: 'Узнать больше', tools: 'Лучшие инструменты', toolsSub: 'Полезные и без лишнего шума.',
    addTool: 'Добавить инструмент', toolName: 'Название', toolDesc: 'Описание', toolCat: 'Категория', toolUrl: 'Ссылка (необязательно)',
    save: 'Сохранить', cancel: 'Отмена', remove: 'Удалить', all: 'Весь контекст',
    prev: 'Назад', next: 'Вперёд',
  },
  pt: {
    eyebrow: 'VIVER',
    culture: 'O contexto nativo', sub: 'Não é uma lição à parte. Os pequenos detalhes que dão vida à língua.',
    seeMore: 'Ver contexto', tools: 'As melhores ferramentas', toolsSub: 'Úteis e sem ruído.',
    addTool: 'Adicionar ferramenta', toolName: 'Nome', toolDesc: 'Descrição', toolCat: 'Categoria', toolUrl: 'Hiperligação (opcional)',
    save: 'Guardar', cancel: 'Cancelar', remove: 'Remover', all: 'Todo o contexto',
    prev: 'Anterior', next: 'Seguinte',
  },
}

export function LifePage({ ui = 'fr', state, onChange }: { ui?: UiLanguage; state: AppState; onChange: (state: AppState) => void }) {
  const t = L[ui] || L.fr
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
    <header className="page-header"><div><p className="eyebrow">{t.eyebrow}</p><h1>{t.culture}</h1><p className="subhead">{t.sub}</p></div></header>

    <section className="culture-feature">
      <div>
        <p className="eyebrow">{entry.label} · {(index % culturalEntries.length + culturalEntries.length) % culturalEntries.length + 1}/{culturalEntries.length}</p>
        <h2>{entry.headline}</h2>
        <p>{entry.body}</p>
        {expanded && <p className="culture-more">{entry.more}</p>}
        <div className="culture-actions">
          <button className="text-button" onClick={() => setExpanded(!expanded)}>{t.seeMore} <ArrowRight size={13} /></button>
          <div className="culture-nav">
            <button onClick={() => { setIndex(index - 1); setExpanded(false) }} title={t.prev} aria-label={t.prev}><ChevronLeft size={16} /></button>
            <button onClick={() => { setIndex(index + 1); setExpanded(false) }} title={t.next} aria-label={t.next}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
      <aside><span>{entry.title.toUpperCase()}</span><i><Sparkles size={16} /></i></aside>
    </section>

    <section className="culture-strip">
      {culturalEntries.map((item, itemIndex) => <button key={item.id} className={itemIndex === ((index % culturalEntries.length + culturalEntries.length) % culturalEntries.length) ? 'culture-chip active' : 'culture-chip'} onClick={() => { setIndex(itemIndex); setExpanded(false) }}>{item.title}</button>)}
    </section>

    <section className="tools-section">
      <div className="section-title">
        <div><p className="eyebrow">{t.tools.toUpperCase()}</p><h2>{t.toolsSub}</h2></div>
        <button className="outline" onClick={() => setAdding(!adding)}>{adding ? t.cancel : <><Plus size={14} /> {t.addTool}</>}</button>
      </div>
      {adding && <div className="tool-form">
        <input placeholder={t.toolName} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <input placeholder={t.toolDesc} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        <input placeholder={t.toolCat} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
        <input placeholder={t.toolUrl} value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} />
        <button className="primary" onClick={addTool} disabled={!draft.name.trim()}>{t.save} <ArrowRight size={15} /></button>
      </div>}
      <div className="tools-grid">
        {tools.map((tool, toolIndex) => <article key={tool.name}>
          <span className={`tool-icon i${toolIndex % 4}`}>{tool.name.slice(0, 1)}</span>
          <div><small>{tool.category}{tool.custom ? ' · perso' : ''}</small><h3>{tool.name}</h3><p>{tool.description}</p></div>
          <div className="tool-actions">
            {'url' in tool && tool.url && <a href={tool.url} target="_blank" rel="noreferrer" className="tool-link" aria-label="Ouvrir le lien"><ExternalLink size={13} /></a>}
            <button className="tool-remove" title={t.remove} aria-label={t.remove} onClick={() => removeTool(tool)}><Trash2 size={13} /></button>
          </div>
        </article>)}
      </div>
    </section>
  </div>
}
