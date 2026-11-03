import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Globe2, Loader2, Mail, Search, ShieldCheck, Smartphone, Sprout, X } from 'lucide-react'
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max'
import type { Language, UiLanguage } from '../../domain'
import { detectUiLanguage, UI_LANGUAGES } from '../../i18n'
import { TOP_LEARNING_LANGUAGES } from '../../languages'
import { createState, loadState, saveState } from '../../store'
import type { AuthUser } from './authService'
import { getStorageScope } from './storageScope'
import { countryFromInternationalNumber, isPhoneInput, normalizeIdentifier, phoneCountries } from './identifier'
import './onboarding.css'

type AuthConfig = { google: boolean; email: boolean; phone: boolean }
type Challenge = { challengeId: string; channel: 'email' | 'phone'; destination: string; retryAfter: number; identifier: string }
type OnboardingProps = { config: AuthConfig; onAuthenticated: (user: AuthUser) => void; onGuest: () => void; initialError?: string }

async function authRequest<T>(path: string, body: unknown, method = 'POST', accountId?: string): Promise<T> {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(accountId ? { 'X-Account-ID': accountId } : {}) }, body: JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'La connexion a échoué. Réessayez dans un instant.')
  return result as T
}

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.7 4.7 0 0 1-2 3v2.6h3.3c1.9-1.7 3-4.3 3-7.5Z" /><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.8-2.4l-3.3-2.6c-.9.6-2.1 1-3.5 1a6 6 0 0 1-5.6-4.2H3v2.7A10.3 10.3 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.4 13.8a6 6 0 0 1 0-3.6V7.5H3a10 10 0 0 0 0 9l3.4-2.7Z" /><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2a10.3 10.3 0 0 0-9 5.5l3.4 2.7A6 6 0 0 1 12 6Z" /></svg>
}

function OnboardingFrame({ children }: { children: React.ReactNode }) {
  return <main className="auth-shell">
    <aside className="auth-story" aria-label="Bienvenue dans Vivre la langue">
      <div className="auth-brand"><span><BookOpen size={21} strokeWidth={1.5} /></span>Vivre la langue<span className="auth-brand-dot">.</span></div>
      <div className="auth-story-content">
        <p className="auth-eyebrow">UN PEU CHAQUE JOUR, UN MONDE À SOI</p>
        <h1>Les langues ouvrent<br />de nouvelles <em>histoires.</em></h1>
        <p className="auth-story-description">Lisez ce qui vous inspire. Trouvez vos mots.<br />Prenez plaisir à progresser, à votre rythme.</p>
        <div className="auth-story-notes" aria-hidden="true"><div><span>hello</span><small>un premier mot</small></div><span className="auth-story-line" /><div><span>bonjour</span><small>une nouvelle rencontre</small></div></div>
      </div>
      <div className="auth-story-footer"><Sprout size={17} strokeWidth={1.5} />Votre curiosité est le meilleur point de départ.</div>
    </aside>
    <section className="auth-main"><div className="auth-card">{children}</div><p className="auth-footer"><ShieldCheck size={13} />Un espace personnel pour votre apprentissage.</p></section>
  </main>
}

export function Onboarding({ config, onAuthenticated, onGuest, initialError }: OnboardingProps) {
  const [value, setValue] = useState('')
  const [country, setCountry] = useState<CountryCode>('FR')
  const [countryOpen, setCountryOpen] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')
  const [guestOpen, setGuestOpen] = useState(false)
  const [error, setError] = useState(initialError || '')
  const [busy, setBusy] = useState(false)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [code, setCode] = useState('')
  const [remaining, setRemaining] = useState(0)
  const countryRef = useRef<HTMLDivElement>(null)
  const countryButtonRef = useRef<HTMLButtonElement>(null)
  const guestRef = useRef<HTMLDivElement>(null)
  const guestButtonRef = useRef<HTMLButtonElement>(null)
  const guestCheckboxRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const phone = isPhoneInput(value)
  const selectedCountry = phoneCountries.find((entry) => entry.code === country)!
  const channelAvailable = phone ? config.phone : config.email
  const searchText = countrySearch.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const matchingCountries = phoneCountries.filter((entry) => `${entry.name} ${entry.code} ${entry.dialCode}`.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(searchText))

  useEffect(() => {
    if (!remaining) return
    const timer = window.setTimeout(() => setRemaining((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [remaining])
  useEffect(() => { if (countryOpen) searchRef.current?.focus() }, [countryOpen])
  useEffect(() => { if (guestOpen) guestCheckboxRef.current?.focus() }, [guestOpen])
  useEffect(() => { if (challenge) codeRef.current?.focus() }, [challenge])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!countryRef.current?.contains(event.target as Node)) setCountryOpen(false)
      if (!guestRef.current?.contains(event.target as Node)) setGuestOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (countryOpen) { setCountryOpen(false); countryButtonRef.current?.focus() }
      if (guestOpen) { setGuestOpen(false); guestButtonRef.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [countryOpen, guestOpen])

  const requestCode = async (event?: FormEvent) => {
    event?.preventDefault()
    if (busy) return
    setError('')
    let identifier: string
    try { identifier = challenge?.identifier || normalizeIdentifier(value, country).identifier } catch (cause) { setError((cause as Error).message); return }
    setBusy(true)
    try {
      const result = await authRequest<Omit<Challenge, 'identifier'>>('/api/auth/code/request', { identifier })
      setChallenge({ ...result, identifier })
      setCode('')
      setRemaining(result.retryAfter || 60)
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  const verifyCode = async (event: FormEvent) => {
    event.preventDefault()
    if (!challenge || busy) return
    setError('')
    if (!/^\d{6}$/.test(code)) { setError('Saisissez les 6 chiffres du code reçu.'); return }
    setBusy(true)
    try {
      const result = await authRequest<{ user: AuthUser }>('/api/auth/code/verify', { challengeId: challenge.challengeId, code })
      onAuthenticated(result.user)
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }

  return <OnboardingFrame>
    {challenge ? <>
      <button type="button" className="auth-back" disabled={busy} onClick={() => { setChallenge(null); setCode(''); setError('') }}><ArrowLeft size={15} />Modifier mes coordonnées</button>
      <div className="auth-step-icon">{challenge.channel === 'phone' ? <Smartphone size={23} strokeWidth={1.5} /> : <Mail size={23} strokeWidth={1.5} />}</div>
      <p className="auth-eyebrow">PLUS QU’UNE PETITE ÉTAPE</p>
      <h2>Regardez vos {challenge.channel === 'phone' ? 'messages' : 'e-mails'}.</h2>
      <p className="auth-intro">Un code de connexion à 6 chiffres a été envoyé à <strong>{challenge.destination}</strong>.</p>
      <form className="auth-form" onSubmit={verifyCode}>
        <label htmlFor="auth-code">Votre code de connexion</label>
        <input ref={codeRef} id="auth-code" className="auth-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '')); setError('') }} placeholder="000000" aria-invalid={Boolean(error)} aria-describedby={error ? 'auth-error' : 'auth-code-hint'} disabled={busy} />
        <p id="auth-code-hint" className="auth-field-hint">Ce code est valable 10 minutes.</p>
        {error && <p className="auth-error" id="auth-error" role="alert">{error}</p>}
        <button className="auth-primary" type="submit" disabled={busy || code.length !== 6}>{busy ? <Loader2 size={18} className="spin" /> : <>Me connecter<ArrowRight size={17} /></>}</button>
      </form>
      <p className="auth-resend">Vous n’avez rien reçu ? <button type="button" disabled={busy || remaining > 0} onClick={() => void requestCode()}>{remaining > 0 ? `Renvoyer dans ${remaining} s` : 'Renvoyer le code'}</button></p>
      {challenge.channel === 'email' && <p className="auth-field-hint auth-center">Pensez à vérifier vos courriers indésirables.</p>}
    </> : <>
      <span className="auth-welcome-mark"><Globe2 size={23} strokeWidth={1.5} /></span>
      <p className="auth-eyebrow">VOTRE PROCHAINE HISTOIRE COMMENCE ICI</p>
      <h2>Bienvenue chez vous.</h2>
      <p className="auth-intro">Créez votre compte ou retrouvez votre espace.<br />Votre progression vous suit d’un appareil à l’autre.</p>
      <button type="button" className="auth-google" disabled={!config.google || busy} onClick={() => window.location.assign('/api/auth/google')}><GoogleMark />Continuer avec Google</button>
      {!config.google && <p className="auth-provider-note">La connexion Google sera bientôt disponible.</p>}
      {(config.email || config.phone) && <>
      <div className="auth-divider"><span />ou avec vos coordonnées<span /></div>
      <form className="auth-form" onSubmit={(event) => void requestCode(event)} noValidate>
        <label htmlFor="auth-identifier">Adresse e-mail ou numéro de téléphone</label>
        <div className={`auth-identifier ${error ? 'has-error' : ''}`}>
          {phone && <div className="auth-country" ref={countryRef}>
            <button type="button" className="auth-country-trigger" ref={countryButtonRef} disabled={busy} aria-label={`Pays : ${selectedCountry.name}, indicatif ${selectedCountry.dialCode}`} aria-haspopup="dialog" aria-expanded={countryOpen} aria-controls="auth-country-menu" onClick={() => { setCountryOpen(!countryOpen); setCountrySearch(''); setGuestOpen(false) }}><span aria-hidden="true">{selectedCountry.flag}</span><span>{selectedCountry.dialCode}</span><ChevronDown size={12} /></button>
            {countryOpen && <div className="auth-country-menu" id="auth-country-menu" role="dialog" aria-label="Choisir l’indicatif du pays">
              <div className="auth-country-search"><Search size={15} /><input ref={searchRef} type="search" aria-label="Rechercher un pays ou un indicatif" placeholder="Pays ou indicatif" value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} /></div>
              <div className="auth-country-options">{matchingCountries.map((entry) => <button type="button" key={entry.code} className={entry.code === country ? 'is-selected' : ''} onClick={() => {
                if (value.trim().startsWith('+')) { const parsed = parsePhoneNumberFromString(value); if (parsed) setValue(parsed.nationalNumber) }
                setCountry(entry.code); setCountryOpen(false); countryButtonRef.current?.focus(); setError('')
              }}><span aria-hidden="true">{entry.flag}</span><span>{entry.name}</span><small>{entry.dialCode}</small>{entry.code === country && <Check size={13} />}</button>)}{matchingCountries.length === 0 && <p>Aucun pays trouvé.</p>}</div>
            </div>}
          </div>}
          <input id="auth-identifier" type="text" inputMode={phone ? 'tel' : 'email'} autoComplete={phone ? 'tel' : 'username'} autoCapitalize="none" spellCheck={false} placeholder="vous@exemple.com ou 06 12 34 56 78" value={value} maxLength={254} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? 'auth-error' : 'auth-identifier-hint'} onChange={(event) => {
            const next = event.target.value
            setValue(next); setError('')
            const detectedCountry = countryFromInternationalNumber(next)
            if (detectedCountry) {
              setCountry(detectedCountry)
              const parsed = parsePhoneNumberFromString(next)
              if (parsed?.isValid()) setValue(parsed.nationalNumber)
            }
          }} />
        </div>
        <p className="auth-field-hint" id="auth-identifier-hint">{phone ? 'Un code vous sera envoyé par SMS.' : 'Nous vous enverrons un code. Aucun mot de passe à retenir.'}</p>
        {!channelAvailable && <p className="auth-provider-note">La connexion par {phone ? 'téléphone' : 'e-mail'} sera bientôt disponible. Vous pouvez continuer en invité.</p>}
        {error && <p className="auth-error" id="auth-error" role="alert">{error}</p>}
        <button className="auth-primary" type="submit" disabled={busy || !channelAvailable}>{busy ? <Loader2 size={18} className="spin" /> : <>Continuer<ArrowRight size={17} /></>}</button>
      </form>
      </>}
      {!config.email && !config.phone && error && <p className="auth-error" role="alert">{error}</p>}
      <div className="auth-guest" ref={guestRef}>
        <button className="auth-guest-trigger" ref={guestButtonRef} type="button" aria-expanded={guestOpen} aria-controls="auth-guest-disclosure" aria-haspopup="dialog" onClick={() => { setGuestOpen(!guestOpen); setCountryOpen(false) }}>Continuer en invité<ArrowRight size={14} /></button>
        {guestOpen && <div className="auth-guest-popover" id="auth-guest-disclosure" role="dialog" aria-label="Continuer sans compte" aria-describedby="auth-guest-warning">
          <button className="auth-popover-close" type="button" aria-label="Fermer" onClick={() => { setGuestOpen(false); guestButtonRef.current?.focus() }}><X size={14} /></button>
          <p id="auth-guest-warning">En continuant sans vous connecter, toute votre progression sera enregistrée dans votre navigateur. En cas de problème ou si vous supprimez les cookies, votre progression risque d’être perdue</p>
          <label className="auth-guest-consent"><input ref={guestCheckboxRef} type="checkbox" checked={false} onChange={(event) => { if (event.target.checked) onGuest() }} /> <span>J’accepte</span></label>
        </div>}
      </div>
    </>}
  </OnboardingFrame>
}

export function ProfileOnboarding({ user, onComplete, onBack }: { user: AuthUser; onComplete: (user: AuthUser) => void; onBack: () => void }) {
  const [name, setName] = useState(user.name || '')
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(() => detectUiLanguage())
  const [learningLanguage, setLearningLanguage] = useState<Language>('en')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true); setError('')
    try {
      const result = await authRequest<{ user: AuthUser }>('/api/auth/profile', { name: name.trim() }, 'PATCH', user.id)
      if (getStorageScope() !== user.id || result.user.id !== user.id) return
      if (!loadState()) saveState(createState({ name: result.user.name || name.trim(), uiLanguage, learningLanguage }))
      onComplete(result.user)
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  return <OnboardingFrame>
    <button type="button" className="auth-back" disabled={busy} onClick={onBack}><ArrowLeft size={15} />Changer de compte</button>
    <div className="auth-step-icon"><Sprout size={25} strokeWidth={1.5} /></div>
    <p className="auth-eyebrow">FAISONS CONNAISSANCE</p>
    <h2>Un espace à votre image.</h2>
    <p className="auth-intro">Un prénom, une langue, et l’envie de découvrir.<br />Vous pourrez modifier ces choix à tout moment.</p>
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="auth-name">Votre prénom</label>
      <input id="auth-name" className="auth-name-input" autoFocus autoComplete="given-name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Votre prénom" required disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? 'auth-profile-error' : undefined} />
      <div className="auth-language-fields">
        <label htmlFor="auth-interface-language">Langue de l’interface
          <select id="auth-interface-language" value={uiLanguage} onChange={(event) => setUiLanguage(event.target.value as UiLanguage)} disabled={busy}>
            {UI_LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language.flag} {language.name}</option>)}
          </select>
        </label>
        <label htmlFor="auth-learning-language">Je souhaite apprendre
          <select id="auth-learning-language" value={learningLanguage} onChange={(event) => setLearningLanguage(event.target.value as Language)} disabled={busy}>
            {TOP_LEARNING_LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language.flag} {language.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="auth-error" id="auth-profile-error" role="alert">{error}</p>}
      <button className="auth-primary" type="submit" disabled={!name.trim() || busy}>{busy ? <Loader2 size={18} className="spin" /> : <>Ouvrir mon espace<ArrowRight size={17} /></>}</button>
    </form>
    <p className="auth-profile-note"><ShieldCheck size={15} />Votre compte est créé. Vos progrès seront sauvegardés dans votre espace personnel.</p>
  </OnboardingFrame>
}
