import { useEffect, useState } from 'react'
import type { Language, UiLanguage, UserSettings } from '../domain'
import { UI_LANGUAGES } from '../i18n'
import { listVoices } from '../ai'

type SettingsProps = {
  settings: UserSettings
  onSave: (settings: UserSettings) => void
  onResetData: () => void
}

type Tab = 'profile' | 'reading' | 'connections' | 'data'

const TTS_PROVIDERS: { id: UserSettings['api']['ttsProvider']; name: string; detail: string }[] = [
  { id: 'google', name: 'Voix naturelle (gratuit)', detail: 'Voix Google de bonne qualité, sans clé ni compte. Recommandé pour démarrer.' },
  { id: 'elevenlabs', name: 'ElevenLabs', detail: 'Voix IA haut de gamme. Colle ta clé API ElevenLabs ci-dessous.' },
  { id: 'fish', name: 'Fish Audio', detail: 'S2.1 et autres modèles Fish, avec ta clé API Fish Audio directe.' },
  { id: 'openrouter', name: 'OpenRouter (modèle audio)', detail: 'Un modèle compatible sortie audio via ta clé OpenRouter (ex. openai/gpt-4o-audio-preview).' },
  { id: 'browser', name: 'Voix du navigateur', detail: 'Fonctionne hors ligne, qualité variable selon l’appareil.' },
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
          <SettingHeading title="Ton espace d’apprentissage" detail="La langue d’interface est un choix libre, indépendant de la langue apprise." />
          <div className="settings-fields">
            <label>Ton prénom<input value={draft.name} onChange={(event) => update('name', event.target.value)} /></label>
            <label>Langue de l’interface<select value={draft.uiLanguage} onChange={(event) => update('uiLanguage', event.target.value as UiLanguage)}>{UI_LANGUAGES.map((language) => <option value={language.id} key={language.id}>{language.flag} {language.name}</option>)}</select></label>
            <label>Langue apprise<select value={draft.learningLanguage} onChange={(event) => update('learningLanguage', event.target.value as Language)}><option value="en">English (américain)</option><option value="fr">Français</option></select></label>
            <label>Apparence<select value={draft.theme} onChange={(event) => update('theme', event.target.value as UserSettings['theme'])}><option value="light">Clair chaleureux</option><option value="dark">Sombre calme</option></select></label>
          </div>
          <aside className="settings-tip"><span>🕊</span><p>La langue de l’interface traduit les menus, boutons et instructions — jamais le contenu de tes ressources importées.</p></aside>
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

        {tab === 'connections' && <>
          <SettingHeading title="Connexions" detail="Les clés restent dans ce navigateur. Laisse vide pour utiliser les solutions gratuites." />
          <div className="connection-card">
            <div><h3>Choix modèle Agent principal</h3><p>Le modèle qui pilotera les prochaines fonctionnalités IA. Écris directement l’identifiant du modèle (OpenRouter ou autre).</p></div>
            <label>Modèle principal<input value={draft.api.agentModel} onChange={(event) => updateApi('agentModel', event.target.value)} placeholder="nvidia/nemotron-3-ultra-550b-a55b:free" /></label>
            <p className="field-hint">Exemples : <code>nvidia/nemotron-3-ultra-550b-a55b:free</code>, <code>z-ai/glm-5.2</code>, <code>meta-llama/llama-3.3-70b-instruct:free</code></p>
          </div>
          <div className="connection-card">
            <div><h3>Voix (TTS)</h3><p>Choisis le fournisseur qui lit les textes à voix haute, puis colle la clé correspondante si besoin.</p></div>
            <div className="preset-grid">
              {TTS_PROVIDERS.map((provider) => <button key={provider.id} className={draft.api.ttsProvider === provider.id ? 'preset-card selected' : 'preset-card'} onClick={() => updateApi('ttsProvider', provider.id)}>
                <strong>{provider.name}</strong><p>{provider.detail}</p>
              </button>)}
            </div>
            {draft.api.ttsProvider === 'elevenlabs' && <>
              <label>Clé API ElevenLabs<input type="password" value={draft.api.elevenLabsKey} onChange={(event) => updateApi('elevenLabsKey', event.target.value)} placeholder="sk_…" autoComplete="off" /></label>
              <label>ID de voix <small>ex. 21m00Tcm4TlvDq8ikWAM (Rachel)</small><input value={draft.api.elevenLabsVoice} onChange={(event) => updateApi('elevenLabsVoice', event.target.value)} /></label>
            </>}
            {draft.api.ttsProvider === 'fish' && <>
              <label>Clé API Fish Audio<input type="password" value={draft.api.fishKey} onChange={(event) => updateApi('fishKey', event.target.value)} placeholder="Clé api.fish.audio" autoComplete="off" /></label>
              <label>ID de voix / modèle <small>optionnel — reference_id</small><input value={draft.api.fishReferenceId} onChange={(event) => updateApi('fishReferenceId', event.target.value)} placeholder="Laisser vide pour la voix S2 par défaut" /></label>
            </>}
            {draft.api.ttsProvider === 'openrouter' && <>
              <label>Modèle audio OpenRouter<input value={draft.api.ttsModel} onChange={(event) => updateApi('ttsModel', event.target.value)} placeholder="openai/gpt-4o-audio-preview" /></label>
              <p className="field-hint">Nécessite ta clé OpenRouter (carte « Clés API » ci-dessous) et un modèle qui accepte la sortie audio.</p>
            </>}
            {draft.api.ttsProvider === 'browser' && voices.length > 0 && <label>Voix préférée<select value={draft.api.ttsVoice} onChange={(event) => updateApi('ttsVoice', event.target.value)}>
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
