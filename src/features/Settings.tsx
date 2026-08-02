import { useEffect, useState } from 'react'
import type { Language, UserSettings } from '../domain'
import { listVoices } from '../ai'

type SettingsProps = {
  settings: UserSettings
  onSave: (settings: UserSettings) => void
  onResetData: () => void
}

type Tab = 'profile' | 'reading' | 'dictionary' | 'connections' | 'data'

const DICTIONARY_PRESETS: { id: string; name: string; detail: string; apply: (language: Language) => Partial<UserSettings['api']> }[] = [
  {
    id: 'local', name: 'Local & privé', detail: 'Dictionnaire intégré, marche hors ligne, rien ne quitte l’appareil.',
    apply: () => ({ dictionaryProvider: 'local' }),
  },
  {
    id: 'wiktionary', name: 'Wiktionary', detail: 'Gratuit et complet. Nécessite une connexion.',
    apply: (language) => ({ dictionaryProvider: 'wiktionary', dictionaryEndpoint: language === 'en' ? 'https://en.wiktionary.org/w/api.php' : 'https://fr.wiktionary.org/w/api.php' }),
  },
  {
    id: 'ai', name: 'IA contextuelle', detail: 'Explication adaptée au contexte exact de la phrase. Nécessite une clé OpenRouter.',
    apply: () => ({ dictionaryProvider: 'ai' }),
  },
]

const MODEL_PRESETS = [
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (gratuit)', detail: 'Bon équilibre qualité / vitesse.' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron Nano (gratuit)', detail: 'Rapide, léger.' },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini Flash (gratuit)', detail: 'Très rapide, bon en français.' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini (payant)', detail: 'Excellentes explications, faible coût.' },
]

const TTS_PRESETS = [
  { id: '', name: 'Voix du navigateur', detail: 'Gratuit, choisit automatiquement la voix la plus naturelle installée.' },
  { id: 'fish-audio/s2.1-pro-free:free', name: 'Fish Audio S2.1 (gratuit)', detail: 'Voix IA très naturelle via OpenRouter, nécessite une clé.' },
  { id: 'openai/gpt-4o-audio-preview', name: 'GPT-4o Audio (payant)', detail: 'Voix de très haute qualité via OpenRouter.' },
]

export function Settings({ settings, onSave, onResetData }: SettingsProps) {
  const [draft, setDraft] = useState<UserSettings>(settings)
  const [tab, setTab] = useState<Tab>('profile')
  const [saved, setSaved] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const updateApi = <K extends keyof UserSettings['api']>(key: K, value: UserSettings['api'][K]) => setDraft((current) => ({ ...current, api: { ...current.api, [key]: value } }))
  const save = () => { onSave(draft); setSaved(true); window.setTimeout(() => setSaved(false), 2200) }

  useEffect(() => {
    const load = () => setVoices(listVoices(draft.learningLanguage))
    load()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = load
    return () => { if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = null }
  }, [draft.learningLanguage])

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'profile', icon: '◌', label: 'Profil' },
    { id: 'reading', icon: '◫', label: 'Lecture' },
    { id: 'dictionary', icon: '❝', label: 'Dictionnaire' },
    { id: 'connections', icon: '⌁', label: 'Connexions' },
    { id: 'data', icon: '◐', label: 'Données' },
  ]

  return <div className="page settings-page">
    <header className="page-header settings-header">
      <div><p className="eyebrow">TON ESPACE</p><h1>Paramètres</h1><p className="subhead">Tout ce qui est privé reste sur cet appareil tant que tu ne connectes pas de service.</p></div>
      <button className="primary" onClick={save}>{saved ? '✓ Enregistré' : 'Enregistrer'} <span>→</span></button>
    </header>
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Sections">
        {tabs.map((item) => <button key={item.id} className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}><b>{item.icon}</b> {item.label}</button>)}
      </nav>
      <section className="settings-panel">
        {tab === 'profile' && <>
          <SettingHeading title="Ton espace d’apprentissage" detail="La langue de l’interface suit l’inverse de la langue apprise." />
          <div className="settings-fields">
            <label>Ton prénom<input value={draft.name} onChange={(event) => update('name', event.target.value)} /></label>
            <label>Langue apprise<select value={draft.learningLanguage} onChange={(event) => update('learningLanguage', event.target.value as Language)}><option value="en">English (américain)</option><option value="fr">Français</option></select></label>
            <label>Apparence<select value={draft.theme} onChange={(event) => update('theme', event.target.value as UserSettings['theme'])}><option value="light">Clair chaleureux</option><option value="dark">Sombre calme</option></select></label>
          </div>
          <aside className="settings-tip"><span>↔</span><p>{draft.learningLanguage === 'en' ? 'Tu apprends l’anglais américain : l’interface et les explications sont en français.' : 'Tu apprends le français : l’interface et les explications sont en anglais.'}</p></aside>
        </>}

        {tab === 'reading' && <>
          <SettingHeading title="Confort de lecture" detail="Fais du lecteur ton endroit calme." />
          <div className="settings-fields">
            <label>Taille du texte <div className="range-row"><input type="range" min="16" max="26" value={draft.readerFontSize} onChange={(event) => update('readerFontSize', Number(event.target.value))} /><output>{draft.readerFontSize}px</output></div></label>
            <label>Longueur des pages <div className="range-row"><input type="range" min="120" max="500" step="10" value={draft.readerPageSize} onChange={(event) => update('readerPageSize', Number(event.target.value))} /><output>{draft.readerPageSize} mots</output></div></label>
            <label>Largeur du texte<select value={draft.readerWidth} onChange={(event) => update('readerWidth', event.target.value as UserSettings['readerWidth'])}><option value="comfortable">Confortable</option><option value="wide">Large</option></select></label>
            <label className="toggle-field"><span><strong>Grammaire visuelle</strong><small>Surligne doucement les verbes dans le lecteur.</small></span><input type="checkbox" checked={draft.showGrammar} onChange={(event) => update('showGrammar', event.target.checked)} /></label>
          </div>
        </>}

        {tab === 'dictionary' && <>
          <SettingHeading title="Dictionnaire & explications" detail="Choisis un preset — tout est préconfiguré, tu peux ajuster ensuite." />
          <div className="preset-grid">
            {DICTIONARY_PRESETS.map((preset) => {
              const active = draft.api.dictionaryProvider === preset.apply(draft.learningLanguage).dictionaryProvider
              return <button key={preset.id} className={active ? 'preset-card selected' : 'preset-card'} onClick={() => setDraft((current) => ({ ...current, api: { ...current.api, ...preset.apply(current.learningLanguage) } }))}>
                <strong>{preset.name}</strong><p>{preset.detail}</p>{active && <span className="preset-check">✓ actif</span>}
              </button>
            })}
          </div>
          {draft.api.dictionaryProvider === 'wiktionary' && <label className="inline-field">Point d’accès Wiktionary<input value={draft.api.dictionaryEndpoint} onChange={(event) => updateApi('dictionaryEndpoint', event.target.value)} /></label>}
          {draft.api.dictionaryProvider === 'ai' && <>
            <label className="inline-field">Clé OpenRouter<input type="password" value={draft.api.openRouterKey} onChange={(event) => updateApi('openRouterKey', event.target.value)} placeholder="sk-or-…" autoComplete="off" /></label>
            <div className="preset-grid">
              {MODEL_PRESETS.map((preset) => <button key={preset.id} className={draft.api.openRouterModel === preset.id ? 'preset-card selected' : 'preset-card'} onClick={() => updateApi('openRouterModel', preset.id)}>
                <strong>{preset.name}</strong><p>{preset.detail}</p>
              </button>)}
            </div>
          </>}
        </>}

        {tab === 'connections' && <>
          <SettingHeading title="Connexions" detail="Les clés restent dans ce navigateur. Laisse vide pour utiliser les solutions locales." />
          <div className="connection-card">
            <div><h3>Voix (TTS)</h3><p>La voix qui lit les textes à voix haute.</p></div>
            <div className="preset-grid">
              {TTS_PRESETS.map((preset) => <button key={preset.id} className={draft.api.ttsModel === preset.id ? 'preset-card selected' : 'preset-card'} onClick={() => updateApi('ttsModel', preset.id)}>
                <strong>{preset.name}</strong><p>{preset.detail}</p>
              </button>)}
            </div>
            {draft.api.ttsModel === '' && voices.length > 0 && <label>Voix préférée<select value={draft.api.ttsVoice} onChange={(event) => updateApi('ttsVoice', event.target.value)}>
              <option value="">Automatique (la plus naturelle)</option>
              {voices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name} ({voice.lang})</option>)}
            </select></label>}
          </div>
          <div className="connection-card">
            <div><h3>Clés API (optionnel)</h3><p>Utilisées uniquement pour les fonctions IA et la recherche d’images.</p></div>
            <label>Clé OpenRouter<input type="password" value={draft.api.openRouterKey} onChange={(event) => updateApi('openRouterKey', event.target.value)} placeholder="sk-or-…" autoComplete="off" /></label>
            <label>Clé OpenAI <small>optionnel, transcription Whisper</small><input type="password" value={draft.api.openAiKey} onChange={(event) => updateApi('openAiKey', event.target.value)} placeholder="sk-…" autoComplete="off" /></label>
            <label>Clé Unsplash<input type="password" value={draft.api.unsplashKey} onChange={(event) => updateApi('unsplashKey', event.target.value)} autoComplete="off" /></label>
            <label>Clé Pexels<input type="password" value={draft.api.pexelsKey} onChange={(event) => updateApi('pexelsKey', event.target.value)} autoComplete="off" /></label>
          </div>
        </>}

        {tab === 'data' && <>
          <SettingHeading title="Tes données" detail="Ressources, deck, écrits et réglages sont stockés localement dans ce navigateur." />
          <div className="data-card"><h3>Local par défaut</h3><p>Pas de compte, pas d’envoi caché. Caméra et micro ne sont demandés qu’au moment où tu démarres une session.</p></div>
          <div className="danger-zone"><div><h3>Repartir de zéro</h3><p>Supprime les ressources, mots, écrits, réglages et l’historique de ce navigateur.</p></div>{confirmingReset ? <div className="confirm-row"><button className="outline" onClick={() => setConfirmingReset(false)}>Annuler</button><button className="danger" onClick={onResetData}>Supprimer les données</button></div> : <button className="outline" onClick={() => setConfirmingReset(true)}>Réinitialiser…</button>}</div>
        </>}
      </section>
    </div>
  </div>
}

function SettingHeading({ title, detail }: { title: string; detail: string }) { return <header className="setting-heading"><h2>{title}</h2><p>{detail}</p></header> }
