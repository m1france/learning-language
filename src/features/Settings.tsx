import { useState } from 'react'
import type { UserSettings } from '../domain'

type SettingsProps = {
  settings: UserSettings
  onSave: (settings: UserSettings) => void
  onResetData: () => void
}

type Tab = 'profile' | 'reading' | 'connections' | 'data'

export function Settings({ settings, onSave, onResetData }: SettingsProps) {
  const [draft, setDraft] = useState<UserSettings>(settings)
  const [tab, setTab] = useState<Tab>('profile')
  const [saved, setSaved] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const updateApi = <K extends keyof UserSettings['api']>(key: K, value: UserSettings['api'][K]) => setDraft((current) => ({ ...current, api: { ...current.api, [key]: value } }))
  const save = () => { onSave(draft); setSaved(true); window.setTimeout(() => setSaved(false), 2200) }

  return <div className="page settings-page">
    <header className="page-header settings-header">
      <div><p className="eyebrow">YOUR SPACE</p><h1>Settings</h1><p className="subhead">Everything private stays on this device until you connect a service.</p></div>
      <button className="primary" onClick={save}>{saved ? '✓ Saved' : 'Save changes'} <span>→</span></button>
    </header>
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Settings sections">
        <button className={tab === 'profile' ? 'selected' : ''} onClick={() => setTab('profile')}><b>◌</b> Profile</button>
        <button className={tab === 'reading' ? 'selected' : ''} onClick={() => setTab('reading')}><b>◫</b> Reading</button>
        <button className={tab === 'connections' ? 'selected' : ''} onClick={() => setTab('connections')}><b>⌁</b> Connections</button>
        <button className={tab === 'data' ? 'selected' : ''} onClick={() => setTab('data')}><b>◐</b> Data & privacy</button>
      </nav>
      <section className="settings-panel">
        {tab === 'profile' && <>
          <SettingHeading title="Your learning space" detail="The site language always follows the inverse of the language you are learning." />
          <div className="settings-fields">
            <label>Your name<input value={draft.name} onChange={(event) => update('name', event.target.value)} /></label>
            <label>Learning language<select value={draft.learningLanguage} onChange={(event) => update('learningLanguage', event.target.value as UserSettings['learningLanguage'])}><option value="en">English (American)</option><option value="fr">Français</option></select></label>
            <label>Appearance<select value={draft.theme} onChange={(event) => update('theme', event.target.value as UserSettings['theme'])}><option value="light">Warm light</option><option value="dark">Quiet dark</option></select></label>
          </div>
          <aside className="settings-tip"><span>↔</span><p>{draft.learningLanguage === 'en' ? 'You learn American English, so your controls and guidance are in French.' : 'You learn French, so your controls and guidance are in English.'}</p></aside>
        </>}
        {tab === 'reading' && <>
          <SettingHeading title="Reading comfort" detail="Make the reader feel like your own quiet place." />
          <div className="settings-fields">
            <label>Text size <div className="range-row"><input type="range" min="16" max="26" value={draft.readerFontSize} onChange={(event) => update('readerFontSize', Number(event.target.value))} /><output>{draft.readerFontSize}px</output></div></label>
            <label>Text width<select value={draft.readerWidth} onChange={(event) => update('readerWidth', event.target.value as UserSettings['readerWidth'])}><option value="comfortable">Comfortable</option><option value="wide">Wide</option></select></label>
            <label className="toggle-field"><span><strong>Visual grammar</strong><small>Gently highlight active grammar patterns in the reader.</small></span><input type="checkbox" checked={draft.showGrammar} onChange={(event) => update('showGrammar', event.target.checked)} /></label>
          </div>
        </>}
        {tab === 'connections' && <>
          <SettingHeading title="Connections" detail="Keys are kept only in this browser. Leave a key blank to use local, privacy-friendly fallbacks." />
          <div className="connection-card"><div><h3>Dictionary</h3><p>Use the local dictionary now, or configure a Wiktionary-compatible endpoint.</p></div><label>Provider<select value={draft.api.dictionaryProvider} onChange={(event) => updateApi('dictionaryProvider', event.target.value as UserSettings['api']['dictionaryProvider'])}><option value="local">Local contextual dictionary</option><option value="wiktionary">Wiktionary API</option></select></label><label>Endpoint<input value={draft.api.dictionaryEndpoint} onChange={(event) => updateApi('dictionaryEndpoint', event.target.value)} placeholder="https://…" /></label></div>
          <div className="connection-card"><div><h3>AI feedback</h3><p>Used only for optional contextual translation and speaking feedback.</p></div><label>OpenRouter API key<input type="password" value={draft.api.openRouterKey} onChange={(event) => updateApi('openRouterKey', event.target.value)} placeholder="sk-or-…" autoComplete="off" /></label><label>Model<input value={draft.api.openRouterModel} onChange={(event) => updateApi('openRouterModel', event.target.value)} /></label><label>OpenAI API key <small>Optional, for Whisper transcription</small><input type="password" value={draft.api.openAiKey} onChange={(event) => updateApi('openAiKey', event.target.value)} placeholder="sk-…" autoComplete="off" /></label></div>
          <div className="connection-card"><div><h3>Images & speech</h3><p>Optional image search and your preferred browser speech voice.</p></div><label>Unsplash access key<input type="password" value={draft.api.unsplashKey} onChange={(event) => updateApi('unsplashKey', event.target.value)} autoComplete="off" /></label><label>Pexels API key<input type="password" value={draft.api.pexelsKey} onChange={(event) => updateApi('pexelsKey', event.target.value)} autoComplete="off" /></label><label>TTS voice<input value={draft.api.ttsVoice} onChange={(event) => updateApi('ttsVoice', event.target.value)} placeholder="en-US" /></label></div>
        </>}
        {tab === 'data' && <>
          <SettingHeading title="Your data" detail="Resources, deck, writings, settings and session history are stored locally in this prototype." />
          <div className="data-card"><h3>Local-only by default</h3><p>No account, teacher space, native push notifications, or hidden upload is enabled. Camera and microphone are requested only after you explicitly start a session.</p></div>
          <div className="danger-zone"><div><h3>Start over</h3><p>Deletes local resources, words, writings, settings and history from this browser.</p></div>{confirmingReset ? <div className="confirm-row"><button className="outline" onClick={() => setConfirmingReset(false)}>Cancel</button><button className="danger" onClick={onResetData}>Delete local data</button></div> : <button className="outline" onClick={() => setConfirmingReset(true)}>Reset local data…</button>}</div>
        </>}
      </section>
    </div>
  </div>
}

function SettingHeading({ title, detail }: { title: string; detail: string }) { return <header className="setting-heading"><h2>{title}</h2><p>{detail}</p></header> }
