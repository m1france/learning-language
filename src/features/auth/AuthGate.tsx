import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, ArrowRight, BookOpen } from 'lucide-react'
import { createState, loadState, saveState } from '../../store'
import { AuthContext, authRequest, type AuthConfig, type AuthUser } from './authService'
import { Onboarding, ProfileOnboarding } from './Onboarding'
import { appStorage, setStorageScope } from './storageScope'
import { getExtraStorageSnapshot, syncService } from '../sync/syncService'
import { getAuxiliarySnapshot, restoreAuxiliarySnapshot } from '../sync/auxiliaryStorage'
import { parseSharedLessonFromUrl, isShareSubdomain } from '../teacherExport/teacherExportService'

const GUEST_CONSENT = 'vivre:guest-consent:v1'
const STATE_KEY = 'vivre-la-langue:state:v2'
const noProviders: AuthConfig = { google: false, email: false, phone: false }
function guestProgressExists() {
  try {
    const state = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
    return Boolean(state && (state.resources?.length || state.words?.length || state.writings?.length || state.sessions?.length))
  } catch { return false }
}
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [guest, setGuest] = useState(false)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState(noProviders)
  const [error, setError] = useState<string>()
  const [importAvailable, setImportAvailable] = useState(false)
  const [mount, setMount] = useState(0)
  const userRef = useRef<AuthUser | null>(null)
  const epoch = useRef(0)
  const broadcast = useRef<BroadcastChannel | null>(null)
  const publicLesson = Boolean(parseSharedLessonFromUrl()?.lessonId || isShareSubdomain())

  const prepare = async (account: AuthUser, offerImport = false) => {
    const operation = ++epoch.current
    setLoading(true); setError(undefined); setReady(false); setImportAvailable(false)
    localStorage.removeItem(GUEST_CONSENT)
    userRef.current = account; setUser(account); setGuest(false); setStorageScope(account.id)
    if (!account.onboardingComplete) { setLoading(false); return }
    try {
      await syncService.connect(account.id, account.name)
      if (operation !== epoch.current || userRef.current?.id !== account.id) return
      const state = loadState()
      const empty = state && !state.resources.length && !state.words.length && !state.writings.length && !state.sessions.length
      if (offerImport && empty && guestProgressExists() && !appStorage.getItem('vivre:import-decided')) setImportAvailable(true)
      else setReady(true)
      setMount(value => value + 1)
    } catch (cause) { if (operation === epoch.current) setError(cause instanceof Error ? cause.message : 'Impossible de charger votre progression.') }
    finally { if (operation === epoch.current) setLoading(false) }
  }
  const enterGuest = () => {
    epoch.current++
    syncService.stop(); setStorageScope('guest'); setUser(null); userRef.current = null
    localStorage.setItem(GUEST_CONSENT, 'accepted')
    if (!loadState()) saveState(createState())
    setGuest(true); setReady(true); setLoading(false); setMount(value => value + 1)
  }
  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(window.location.search)
    if (params.has('auth_error')) {
      setError(params.get('auth_error') === 'google_unavailable' ? 'La connexion Google est temporairement indisponible.' : 'La connexion Google a été interrompue. Vous pouvez réessayer.')
      params.delete('auth_error')
      window.history.replaceState({}, '', window.location.pathname + (params.size ? `?${params}` : '') + window.location.hash)
    }
    try {
      const channel = new BroadcastChannel('vivre-auth')
      broadcast.current = channel
      channel.onmessage = () => window.location.reload()
    } catch {}
    if (publicLesson) { setStorageScope('guest'); setReady(true); setGuest(true); setLoading(false) }
    else void Promise.all([
      authRequest<AuthConfig>('/api/auth/config'),
      authRequest<{ user: AuthUser | null }>('/api/auth/session'),
    ]).then(async ([providers, session]) => {
      if (cancelled) return
      setConfig(providers)
      if (session.user) await prepare(session.user, true)
      else if (localStorage.getItem(GUEST_CONSENT) === 'accepted') enterGuest()
      else setLoading(false)
    }).catch(cause => {
      if (cancelled) return
      setError(cause instanceof Error ? cause.message : 'Connexion indisponible.'); setLoading(false)
      if (localStorage.getItem(GUEST_CONSENT) === 'accepted') enterGuest()
    })
    const expire = () => {
      epoch.current++
      syncService.stop(); setReady(false); setGuest(false); setUser(null); userRef.current = null
      setStorageScope('guest'); setError('Votre session a expiré. Reconnectez-vous pour retrouver votre progression.'); setLoading(false)
    }
    const recheck = () => {
      if (!userRef.current) return
      void authRequest<{ user: AuthUser | null }>('/api/auth/session').then(session => {
        if (session.user?.id !== userRef.current?.id) window.location.reload()
      }).catch(() => {})
    }
    const remoteStart = () => { setLoading(true) }
    const remote = () => { setMount(value => value + 1); setLoading(false) }
    window.addEventListener('vivre-auth-expired', expire)
    window.addEventListener('focus', recheck)
    window.addEventListener('vivre-remote-restoring', remoteStart)
    window.addEventListener('vivre-remote-restored', remote)
    return () => {
      cancelled = true; broadcast.current?.close()
      window.removeEventListener('vivre-auth-expired', expire); window.removeEventListener('focus', recheck)
      window.removeEventListener('vivre-remote-restoring', remoteStart)
      window.removeEventListener('vivre-remote-restored', remote)
    }
  }, [])
  const signOut = async () => {
    setError(undefined)
    try {
      // Keep failed uploads in this account's local cache for the next sign-in.
      if (user) await syncService.push()
      await authRequest('/api/auth/logout', { method: 'POST', body: '{}', headers: { 'X-Account-ID': user?.id || '' } })
      epoch.current++
      syncService.stop(); broadcast.current?.postMessage('session-changed')
      localStorage.removeItem(GUEST_CONSENT)
      setReady(false); setGuest(false); setUser(null); userRef.current = null; setStorageScope('guest')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Déconnexion impossible. Réessayez.') }
  }
  const openSignIn = async () => {
    epoch.current++
    syncService.stop(); localStorage.removeItem(GUEST_CONSENT)
    setReady(false); setGuest(false); setUser(null); userRef.current = null; setStorageScope('guest')
    setConfig(await authRequest<AuthConfig>('/api/auth/config').catch(() => noProviders))
  }
  const authenticated = (account: AuthUser) => {
    broadcast.current?.postMessage('session-changed')
    void prepare(account, true)
  }
  const finishImport = async (include: boolean) => {
    if (!user) return
    const account = user.id, operation = epoch.current
    setLoading(true)
    try {
      if (include) {
        setStorageScope('guest')
        const state = loadState(), extras = getExtraStorageSnapshot(), auxiliary = await getAuxiliarySnapshot()
        if (operation !== epoch.current || userRef.current?.id !== account) return
        setStorageScope(account)
        if (state) saveState({ ...state, settings: { ...state.settings, name: user.name, api: createState().settings.api } })
        for (const [key, value] of Object.entries(extras)) appStorage.setItem(key, value)
        await restoreAuxiliarySnapshot(auxiliary)
      }
      if (operation !== epoch.current || userRef.current?.id !== account) return
      appStorage.setItem('vivre:import-decided', '1')
      setImportAvailable(false); setReady(true); setMount(value => value + 1)
    } catch { if (operation === epoch.current) { setError('L’import a été interrompu. Votre progression invitée est conservée.'); setStorageScope(account) } }
    finally { if (operation === epoch.current) setLoading(false) }
  }
  if (loading) return <main className="auth-shell"><div className="auth-card" role="status"><Loader2 className="spin" size={24} /><p>Préparons votre espace…</p></div></main>
  if (importAvailable) return <main className="auth-shell"><section className="auth-card"><BookOpen size={26} /><p className="auth-eyebrow">Votre progression</p><h1>Gardons le fil.</h1><p>Une progression invitée existe dans ce navigateur. Souhaitez-vous en copier les ressources, le vocabulaire et les historiques dans votre compte ?</p><p className="auth-note">Les enregistrements audio et vidéo restent sur cet appareil.</p>{error && <p role="alert">{error}</p>}<button className="auth-primary" onClick={() => void finishImport(true)}>Importer ma progression <ArrowRight size={16} /></button><button className="auth-guest-button" onClick={() => void finishImport(false)}>Commencer avec un compte vide</button></section></main>
  if (user && !user.onboardingComplete) return <ProfileOnboarding user={user} onComplete={authenticated} onBack={() => { void signOut() }} />
  if (user && !ready) return <main className="auth-shell"><section className="auth-card"><h1>Votre espace vous attend.</h1><p role="alert">{error}</p><button className="auth-primary" onClick={() => void prepare(user)}>Réessayer</button><button className="auth-guest-button" onClick={() => void signOut()}>Se déconnecter</button></section></main>
  if (!ready) return <Onboarding config={config} onAuthenticated={authenticated} onGuest={enterGuest} initialError={error} />
  return <AuthContext.Provider value={{ user, guest, signOut, openSignIn }}><div key={`${user?.id || 'guest'}:${mount}`}>{error && <div className="account-error" role="alert">{error}</div>}{children}</div></AuthContext.Provider>
}
