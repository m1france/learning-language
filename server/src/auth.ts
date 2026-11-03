import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { createHash, randomInt } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'
import { AccountStore, digest, opaque, safeEqual } from './account-store.js'

const SESSION_COOKIE = 'vivre_session'
const OAUTH_COOKIE = 'vivre_oauth'
const TEN_MINUTES = 600000
const isRecord = (value: unknown): value is Record<string,unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const goodKey = (key:string) => !['__proto__','constructor','prototype'].includes(key)

export function createAccounts(dataPath:string) {
 const store = new AccountStore(dataPath)
 const app = new Hono()
 const production = process.env.NODE_ENV === 'production'
 const cookieOptions = {httpOnly:true,secure:production,sameSite:'Lax' as const,path:'/'}
 const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
 const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM)
 const phoneConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID)
 const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
 const currentUser = (c:Context) => store.session(getCookie(c,SESSION_COOKIE))
 const ip = (c:Context) => process.env.TRUST_PROXY === '1' ? (c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown') : 'direct'
 let nextCleanup=Date.now()+600000
 app.use('*', async (_c,next)=>{if(Date.now()>nextCleanup){store.cleanup();nextCleanup=Date.now()+600000} await next()})
 const establish = (c:Context,userId:string) => setCookie(c,SESSION_COOKIE,store.issueSession(userId,getCookie(c,SESSION_COOKIE)),{...cookieOptions,maxAge:30*86400})
 const limited = (c:Context,key:string,max:number,window=3600000) => {
  if(store.rateLimit(key,max,window))return false
  c.header('Retry-After',String(Math.ceil(window/1000)))
  return true
 }
 const twilio = async (resource:string,body:Record<string,string>) => {
  const response=await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(process.env.TWILIO_VERIFY_SERVICE_SID!)}/${resource}`,{
   method:'POST', headers:{Authorization:`Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(15000)
  })
  const result=await response.json() as {status?:string;sid?:string}
  if(!response.ok)throw new Error('SMS provider unavailable')
  return result
 }
 const authError=(c:Context,message='Connexion requise.')=>c.json({error:message},401)
 const normalizeIdentifier=(value:unknown):{identifier:string,channel:'email'|'phone'}|null=>{
  if(typeof value!=='string'||value.length>254)return null
  const trimmed=value.trim()
  if(trimmed.includes('@')) {
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed))return null
   return {identifier:trimmed.toLowerCase(),channel:'email'}
  }
  if(!trimmed.startsWith('+'))return null
  const phone=parsePhoneNumberFromString(trimmed)
  return phone?.isValid()?{identifier:phone.number,channel:'phone'}:null
 }
 app.get('/api/auth/config',c=>c.json({google:googleConfigured,email:emailConfigured,phone:phoneConfigured}))
 app.get('/api/auth/session',c=>c.json({user:currentUser(c)}))
 app.post('/api/auth/logout',c=>{
  const user=currentUser(c)
  if(user && c.req.header('x-account-id') && c.req.header('x-account-id')!==user.id)return c.json({error:'Le compte a changé dans un autre onglet.',code:'ACCOUNT_CHANGED'},403)
  store.revoke(getCookie(c,SESSION_COOKIE));deleteCookie(c,SESSION_COOKIE,cookieOptions);return c.json({ok:true})})
 app.post('/api/auth/code/request',async c=>{
  const input=normalizeIdentifier((await c.req.json()).identifier)
  if(!input)return c.json({error:'Saisissez une adresse e-mail ou un numéro de téléphone international valide.'},400)
  const {identifier,channel}=input
  if(channel==='email'?!emailConfigured:!phoneConfigured)return c.json({error:channel==='email'?"La connexion par e-mail n’est pas encore configurée.":"La connexion par SMS n’est pas encore configurée."},503)
  if(limited(c,`send-ip:${ip(c)}`,20)||limited(c,`send-identity-hour:${identifier}`,5)||limited(c,`send-identity-day:${identifier}`,10,86400000)||limited(c,`send-cooldown:${identifier}`,1,60000))return c.json({error:'Trop de demandes. Patientez avant de réessayer.'},429)
  const id=opaque(),now=Date.now(),code=String(randomInt(100000,1000000))
  // Reserve cooldown before contacting providers, preventing parallel sends.
  store.db.prepare('UPDATE challenges SET consumed=1 WHERE identifier=?').run(identifier)
  store.db.prepare('INSERT INTO challenges(id,identifier,channel,code_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)').run(id,identifier,channel,digest(`${id}:${code}`),now+TEN_MINUTES,now)
  try {
   if(channel==='email') {
    const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.AUTH_EMAIL_FROM,to:[identifier],subject:'Votre code de connexion — Vivre la langue',text:`Votre code de connexion : ${code}\n\nIl expire dans 10 minutes. Ne communiquez ce code à personne. Si vous n’avez pas demandé ce code, ignorez ce message.`}),signal:AbortSignal.timeout(15000)})
    if(!result.ok)throw new Error('Email provider unavailable')
   } else await twilio('Verifications',{To:identifier,Channel:'sms'})
  } catch {
   store.consumeChallenge(id)
   return c.json({error:'Impossible d’envoyer le code pour le moment. Réessayez plus tard.'},502)
  }
  return c.json({challengeId:id,channel,destination:channel==='email'?identifier.replace(/^(.).+(@.*)$/,'$1•••$2'):`••• ${identifier.slice(-4)}`,retryAfter:60})
 })
 app.post('/api/auth/code/verify',async c=>{
  const {challengeId,code}=await c.req.json()
  if(typeof challengeId!=='string'||!/^[\w-]{43}$/.test(challengeId)||typeof code!=='string'||!/^\d{6}$/.test(code))return c.json({error:'Saisissez le code à six chiffres.'},400)
  if(limited(c,`verify-ip:${ip(c)}`,60))return c.json({error:'Trop de tentatives. Réessayez plus tard.'},429)
  const challenge=store.challenge(challengeId)
  if(!challenge||challenge.consumed||challenge.expires_at<=Date.now()||challenge.attempts>=5)return c.json({error:'Code expiré ou invalide. Demandez un nouveau code.'},400)
  store.db.prepare('UPDATE challenges SET attempts=attempts+1 WHERE id=?').run(challengeId)
  let approved=false
  if(challenge.channel==='email') approved=safeEqual(challenge.code_hash,digest(`${challengeId}:${code}`))
  else {
   try {approved=(await twilio('VerificationCheck',{To:challenge.identifier,Code:code})).status==='approved'} catch {return c.json({error:'Vérification SMS indisponible. Réessayez.'},502)}
  }
  if(!approved)return c.json({error:'Code incorrect. Vérifiez les six chiffres.'},400)
  if(!store.consumeChallenge(challengeId))return c.json({error:'Ce code a déjà été utilisé.'},400)
  const user=store.findOrCreate(challenge.channel,challenge.identifier,challenge.channel==='email'?challenge.identifier:null,challenge.channel==='phone'?challenge.identifier:null)
  establish(c,user.id)
  return c.json({user})
 })
 app.patch('/api/auth/profile',async c=>{
  const user=currentUser(c);if(!user)return authError(c)
  if(c.req.header('x-account-id') && c.req.header('x-account-id')!==user.id)return c.json({error:'Le compte a changé dans un autre onglet.',code:'ACCOUNT_CHANGED'},403)
  const {name}=await c.req.json()
  if(typeof name!=='string'||name.trim().length<1||name.trim().length>80||/[\x00-\x1f\x7f]/.test(name))return c.json({error:'Choisissez un prénom de 1 à 80 caractères.'},400)
  store.db.prepare('UPDATE users SET name=?,onboarding_complete=1 WHERE id=?').run(name.trim(),user.id)
  return c.json({user:store.user(user.id)})
 })
 app.get('/api/auth/google',c=>{
  if(!googleConfigured)return c.redirect('/?auth_error=google_unavailable')
  if(limited(c,`google:${ip(c)}`,40))return c.json({error:'Trop de demandes. Réessayez plus tard.'},429)
  const state=opaque(),verifier=opaque(),nonce=opaque()
  store.db.prepare('INSERT INTO oauth_states(state_hash,verifier,nonce,expires_at) VALUES(?,?,?,?)').run(digest(state),verifier,nonce,Date.now()+TEN_MINUTES)
  setCookie(c,OAUTH_COOKIE,state,{...cookieOptions,path:'/api/auth/google',maxAge:600})
  const redirectUri=`${process.env.APP_ORIGIN || new URL(c.req.url).origin}/api/auth/google/callback`
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:redirectUri,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString()
  return c.redirect(url.toString())
 })
 app.get('/api/auth/google/callback',async c=>{
  const state=c.req.query('state'),cookie=getCookie(c,OAUTH_COOKIE),code=c.req.query('code')
  deleteCookie(c,OAUTH_COOKIE,{...cookieOptions,path:'/api/auth/google'})
  if(!state||!cookie||state.length!==43||!safeEqual(state,cookie)||!code||code.length>4096)return c.redirect('/?auth_error=google_failed')
  const row=store.db.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING verifier,nonce').get(digest(state),Date.now()) as {verifier:string;nonce:string}|undefined
  if(!row||!googleConfigured)return c.redirect('/?auth_error=google_failed')
  try {
   const redirectUri=`${process.env.APP_ORIGIN || new URL(c.req.url).origin}/api/auth/google/callback`
   const result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,redirect_uri:redirectUri,code_verifier:row.verifier}),signal:AbortSignal.timeout(15000)})
   const token=await result.json() as {id_token?:string}
   if(!result.ok||!token.id_token)throw new Error('Invalid Google response')
   const {payload}=await jwtVerify(token.id_token,jwks,{issuer:['https://accounts.google.com','accounts.google.com'],audience:process.env.GOOGLE_CLIENT_ID!,algorithms:['RS256'],maxTokenAge:'10m'})
   if(!payload.sub||payload.nonce!==row.nonce||payload.email_verified!==true||typeof payload.email!=='string')throw new Error('Invalid Google identity')
   const user=store.findOrCreate('google',payload.sub,payload.email.toLowerCase(),null,typeof payload.name==='string'?payload.name:'')
   establish(c,user.id)
   return c.redirect('/')
  }catch{return c.redirect('/?auth_error=google_failed')}
 })
 app.get('/api/account/progress',c=>{
  const user=currentUser(c);if(!user)return authError(c)
  if(c.req.header('x-account-id')!==user.id)return c.json({error:'Le compte a changé dans un autre onglet. Rechargez la page.',code:'ACCOUNT_CHANGED'},403)
  return c.json(store.readProgress(user.id))
 })
 app.put('/api/account/progress',async c=>{
  const user=currentUser(c);if(!user)return authError(c)
  if(c.req.header('x-account-id')!==user.id)return c.json({error:'Le compte a changé dans un autre onglet. Rechargez la page.',code:'ACCOUNT_CHANGED'},403)
  const {payload,expectedRevision}=await c.req.json()
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!isRecord(payload)||!isRecord(payload.state)||!isRecord(payload.state.settings)||!Array.isArray(payload.state.resources)||!Array.isArray(payload.state.words)||!isRecord(payload.state.progress)||!isRecord(payload.extraStorage || {}))return c.json({error:'Progression invalide.'},400)
  // Secrets are device-local even if a modified client tries to upload them.
  if(isRecord(payload.state.settings.api)) {
   for(const [key,value] of Object.entries(payload.state.settings.api)) if(/key$|token$|secret$|password$/i.test(key)&&value!==''&&value!==null&&value!==undefined)return c.json({error:'Les clés API doivent rester sur votre appareil.'},400)
  }
  const extras=payload.extraStorage as Record<string,unknown>|undefined
  if(extras&&(Object.keys(extras).length>5000||Object.entries(extras).some(([key,value])=>!goodKey(key)||!/^vivre[-:_]/.test(key)||/auth|token|scope|account|guest|sync|state/i.test(key)||key.length>256||typeof value!=='string'||value.length>1000000)))return c.json({error:'Stockage complémentaire invalide.'},400)
  if(payload.auxiliary !== undefined) {
   if(!isRecord(payload.auxiliary)||Object.keys(payload.auxiliary).some(key=>!['conversations','exercises','speaking'].includes(key))||Object.values(payload.auxiliary).some(items=>!Array.isArray(items)||items.length>10000||items.some(item=>!isRecord(item))))return c.json({error:'Données complémentaires invalides.'},400)
  }
  const revision=store.writeProgress(user.id,payload,expectedRevision)
  return revision===null?c.json({error:'La progression a changé sur un autre appareil. Rechargez avant de réessayer.',revision:store.readProgress(user.id).revision},409):c.json({revision})
 })
 return {app,store,currentUser,rateLimit:(c:Context,key:string,max=120,window=60000)=>limited(c,`${key}:${ip(c)}`,max,window)}
}
