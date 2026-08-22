import { useMemo, useState } from 'react'
import type { AppState, Difficulty, Language } from '../../domain'
import { ArrowRight, BookOpenCheck, BrainCircuit, Compass, Search, Sparkles, X } from 'lucide-react'
import { getAgentConfig } from '../speaking/wordAiService'

type Ui = 'fr' | 'en'
type ToolTab = 'experiments' | 'context' | 'science'

const labels = {
  fr: {
    title: 'Plus d’outils', close: 'Fermer', experiments: 'Experiments', context: 'Context search', science: 'Learning Science',
    expTitle: 'Construis une expérience d’apprentissage.', expBody: 'Pars de ton niveau, de ton temps et de ce que tu veux vraiment pouvoir faire.', goal: 'Mon objectif', goalHint: 'Ex. tenir une conversation professionnelle de 15 minutes', level: 'Niveau actuel', time: 'Temps par jour', build: 'Créer mon plan IA', plan: 'Ton prochain cycle', building: 'L’IA prépare ton cycle…',
    ctxTitle: 'Un mot, tous ses contextes.', ctxBody: 'Cherche dans tes lectures et tes écoutes ; chaque occurrence reste liée à sa phrase.', search: 'Chercher un mot, ex. run', occurrences: 'occurrences retrouvées', noOccurrence: 'Pas encore d’occurrence. Ajoute des écoutes ou des textes, puis reviens ici.', senses: 'Pistes de sens',
    scienceTitle: 'Learning Science', scienceBody: 'Des ressources à consulter quand tu veux comprendre — et améliorer — ta manière d’apprendre.', read: 'Ouvrir la ressource',
    beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé', native: 'Avancé / natif',
  },
  en: {
    title: 'More tools', close: 'Close', experiments: 'Experiments', context: 'Context search', science: 'Learning Science',
    expTitle: 'Build a learning experiment.', expBody: 'Start with your level, your time, and what you truly want to be able to do.', goal: 'My goal', goalHint: 'E.g. hold a 15-minute professional conversation', level: 'Current level', time: 'Time per day', build: 'Build my AI plan', plan: 'Your next cycle', building: 'AI is preparing your cycle…',
    ctxTitle: 'One word, every context.', ctxBody: 'Search through your reading and listening; every occurrence stays connected to its sentence.', search: 'Search a word, e.g. run', occurrences: 'occurrences found', noOccurrence: 'No occurrence yet. Add listening sessions or texts, then return here.', senses: 'Meaning leads',
    scienceTitle: 'Learning Science', scienceBody: 'Resources for the moments when you want to understand — and improve — how you learn.', read: 'Open resource',
    beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', native: 'Advanced / native',
  },
} as const

const resources = [
  { title: 'The Learning Scientists', type: 'Practical study strategies', description: 'Retrieval, spacing, interleaving and other evidence-informed techniques.', url: 'https://www.learningscientists.org/' },
  { title: 'Language Learning & Technology', type: 'Research journal', description: 'Open research on language learning, technology and classroom practice.', url: 'https://www.lltjournal.org/' },
  { title: 'Paul Nation — Vocabulary research', type: 'Vocabulary', description: 'Practical resources on high-frequency vocabulary and extensive input.', url: 'https://www.wgtn.ac.nz/lals/resources/vocabulary' },
  { title: 'The Learning Scientists Podcast', type: 'Audio', description: 'A listening-friendly way to understand how memory and practice work.', url: 'https://www.learningscientists.org/podcast' },
]

const examplesFor = (word: string, language: Language) => word.toLowerCase() === 'run'
  ? [
      { sense: 'move quickly', example: 'I run along the river before work.' },
      { sense: 'operate / manage', example: 'She runs a small design studio.' },
      { sense: 'continue / happen', example: 'The meeting ran longer than expected.' },
    ]
  : language === 'fr' && word.toLowerCase() === 'courir'
    ? [{ sense: 'se déplacer vite', example: 'Je cours dans le parc le matin.' }, { sense: 'fonctionner', example: 'Le train court jusqu’à minuit.' }]
    : []

export function ListeningTools({ ui, state, onClose }: { ui: Ui; state: AppState; onClose: () => void }) {
  const t = labels[ui]
  const [tab, setTab] = useState<ToolTab>('experiments')
  const [goal, setGoal] = useState('')
  const [level, setLevel] = useState<Difficulty>('intermediate')
  const [minutes, setMinutes] = useState('20')
  const [planReady, setPlanReady] = useState(false)
  const [plan, setPlan] = useState('')
  const [buildingPlan, setBuildingPlan] = useState(false)
  const [query, setQuery] = useState('run')
  const searchWord = query.trim().toLocaleLowerCase()
  const contexts = useMemo(() => {
    if (!searchWord) return []
    const fromListening = (state.listening?.lessons ?? []).flatMap((lesson) => lesson.transcript.map((cue) => ({ source: lesson.title, text: cue.text })))
    const fromReading = state.resources.flatMap((resource) => resource.chapters.flatMap((chapter) => chapter.paragraphs.map((text) => ({ source: resource.title, text }))))
    return [...fromListening, ...fromReading].filter((item) => new RegExp(`(^|[^\\p{L}])${searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(item.text)).slice(0, 24)
  }, [searchWord, state.listening?.lessons, state.resources])
  const examples = examplesFor(query.trim(), state.settings.learningLanguage)

  const buildPlan = async () => {
    setPlanReady(true)
    setBuildingPlan(true)
    const fallback = `${minutes} min : une écoute courte, sans pause.\n${minutes} min : relis la transcription et sauvegarde trois mots.\n${minutes} min : réécoute les phrases qui résistent.\n${minutes} min : réemploie une phrase à l’oral ou à l’écrit.`
    const config = getAgentConfig(state.settings.api)
    if (!config) { setPlan(fallback); setBuildingPlan(false); return }
    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.35,
          messages: [
            { role: 'system', content: 'You are an empathetic language-learning coach. Produce a concrete, low-pressure 7-day plan. Output only four short numbered actions, no preamble.' },
            { role: 'user', content: `Target language: ${state.settings.learningLanguage === 'fr' ? 'French' : 'English'}. Learner level: ${level}. Available time: ${minutes} minutes/day. Goal: ${goal || 'build natural listening confidence'}. Use listening, transcript analysis, speaking, and review.` },
          ],
        }),
      })
      const payload = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }> }
      setPlan(payload.choices?.[0]?.message?.content?.trim() || fallback)
    } catch { setPlan(fallback) } finally { setBuildingPlan(false) }
  }

  return <div className="listening-tools-overlay" role="dialog" aria-modal="true" aria-label={t.title}>
    <div className="listening-tools-sheet">
      <header><div><p className="eyebrow">{t.title.toUpperCase()}</p><h2>{t.title}</h2></div><button type="button" onClick={onClose} aria-label={t.close}><X size={18} /></button></header>
      <nav>{([['experiments', Sparkles], ['context', Search], ['science', BrainCircuit]] as const).map(([id, Icon]) => <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={15} /> {t[id]}</button>)}</nav>
      <main>
        {tab === 'experiments' && <section className="tool-experiment"><div className="tool-intro"><Sparkles size={22} /><h3>{t.expTitle}</h3><p>{t.expBody}</p></div><div className="experiment-form"><label>{t.goal}<input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder={t.goalHint} /></label><label>{t.level}<select value={level} onChange={(event) => setLevel(event.target.value as Difficulty)}>{(['beginner', 'intermediate', 'advanced', 'native'] as Difficulty[]).map((item) => <option value={item} key={item}>{t[item]}</option>)}</select></label><label>{t.time}<select value={minutes} onChange={(event) => setMinutes(event.target.value)}><option value="10">10 min</option><option value="20">20 min</option><option value="30">30 min</option><option value="45">45 min</option></select></label><button type="button" className="primary" onClick={buildPlan} disabled={buildingPlan}>{t.build} <ArrowRight size={15} /></button></div>{planReady && <article className="experiment-plan"><p className="eyebrow">{t.plan.toUpperCase()}</p><h3>{goal || (ui === 'fr' ? 'Construire une écoute naturelle' : 'Build natural listening')}</h3>{buildingPlan ? <p>{t.building}</p> : <pre>{plan}</pre>}</article>}</section>}
        {tab === 'context' && <section className="tool-context"><div className="tool-intro"><Compass size={22} /><h3>{t.ctxTitle}</h3><p>{t.ctxBody}</p></div><label className="tool-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} /></label>{examples.length > 0 && <div className="context-senses"><p className="eyebrow">{t.senses.toUpperCase()}</p>{examples.map((item) => <article key={item.example}><strong>{item.sense}</strong><span>« {item.example} »</span></article>)}</div>}<p className="context-count">{contexts.length} {t.occurrences}</p>{contexts.length ? <div className="context-results">{contexts.map((item, index) => <article key={`${item.source}-${index}`}><small>{item.source}</small><p>{item.text}</p></article>)}</div> : <div className="tool-empty"><BookOpenCheck size={21} /><p>{t.noOccurrence}</p></div>}</section>}
        {tab === 'science' && <section className="tool-science"><div className="tool-intro"><BrainCircuit size={22} /><h3>{t.scienceTitle}</h3><p>{t.scienceBody}</p></div><div className="science-grid">{resources.map((resource) => <article key={resource.title}><small>{resource.type}</small><h3>{resource.title}</h3><p>{resource.description}</p><a href={resource.url} target="_blank" rel="noreferrer">{t.read} <ArrowRight size={13} /></a></article>)}</div></section>}
      </main>
    </div>
  </div>
}
