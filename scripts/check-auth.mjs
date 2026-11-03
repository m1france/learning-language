import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const temp=await mkdtemp(path.join(tmpdir(),'vivre-auth-'))
const data=path.join(temp,'data'),dist=path.join(temp,'dist'),capture=path.join(temp,'capture.json')
await mkdir(data);await mkdir(dist)
await writeFile(path.join(dist,'index.html'),'<!doctype html><head></head><body>public onboarding</body>')
await writeFile(capture,'[]')
const socket=net.createServer()
await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve))
const port=socket.address().port
await new Promise(resolve=>socket.close(resolve))
const base=`http://127.0.0.1:${port}`
const mock=path.join(temp,'providers.mjs')
await writeFile(mock,`
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SignJWT,exportJWK,generateKeyPair} from ${JSON.stringify(path.join(root,'server/node_modules/jose/dist/webapi/index.js'))};
const {publicKey,privateKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig'};
globalThis.fetch=async (input,init={})=>{
 const url=String(input instanceof Request?input.url:input);
 if(url==='https://api.resend.com/emails') {
  const body=JSON.parse(init.body);const list=JSON.parse(readFileSync(process.env.CAPTURE,'utf8'));
  list.push(body);writeFileSync(process.env.CAPTURE,JSON.stringify(list));
  return Response.json({id:'mail'});
 }
 if(url.includes('https://verify.twilio.com/v2/Services/')) {
  const params=new URLSearchParams(init.body);
  return Response.json({status:url.endsWith('VerificationCheck')?(params.get('Code')==='222222'?'approved':'pending'):'pending'});
 }
 if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[jwk]},{headers:{'cache-control':'max-age=3600'}});
 if(url==='https://oauth2.googleapis.com/token') {
  const params=new URLSearchParams(init.body),[nonce,challenge,audience='test-client']=params.get('code').split('|');
  if(createHash('sha256').update(params.get('code_verifier')).digest('base64url')!==challenge)throw Error('PKCE mismatch');
  const token=await new SignJWT({nonce,email:'google@example.com',email_verified:true,name:'Google learner'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('google-subject').setIssuer('https://accounts.google.com').setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  return Response.json({id_token:token});
 }
 throw Error('Unexpected upstream: '+url);
};
`)
let child,logs=''
const accountCookies=new Map()
const start=async(extraEnv={})=>{
 child=spawn(process.execPath,['--import',mock,'server/dist/index.js'],{cwd:root,env:{...process.env,DATABASE_URL:'',NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),APP_ORIGIN:base,DATA_DIR:data,DIST_DIR:dist,CAPTURE:capture,RESEND_API_KEY:'test-resend',AUTH_EMAIL_FROM:'test@example.com',TWILIO_ACCOUNT_SID:'ACtest',TWILIO_AUTH_TOKEN:'test-twilio',TWILIO_VERIFY_SERVICE_SID:'VAtest',GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-google-secret',...extraEnv},stdio:['ignore','pipe','pipe']})
 child.stdout.on('data',b=>{logs+=b});child.stderr.on('data',b=>{logs+=b})
 for(let i=0;i<150;i++) {
  if(child.exitCode!==null)throw new Error('Server exited: '+logs)
  try {await fetch(base+'/api/health');return}catch{await new Promise(resolve=>setTimeout(resolve,30))}
 }
 throw Error('Server not ready: '+logs)
}
const stop=async()=>{if(child?.exitCode===null){const exited=once(child,'exit');child.kill();await exited}}
const req=(url,{cookie,body,method,...init}={})=>fetch(base+url,{method:method||(body===undefined?'GET':'POST'),redirect:'manual',...init,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(method&&method!=='GET'||body!==undefined?{Origin:base}:{}),...(cookie?{Cookie:cookie,...(accountCookies.has(cookie)?{'X-Account-ID':accountCookies.get(cookie)}:{})}:{}),...init.headers},body:body===undefined?undefined:JSON.stringify(body)})
const cookieOf=response=>(response.headers.getSetCookie().find(cookie=>cookie.startsWith('vivre_session='))||response.headers.getSetCookie()[0])?.split(';')[0]
const readOtp=async email=>JSON.parse(await readFile(capture,'utf8')).findLast(mail=>mail.to[0]===email).text.match(/\b\d{6}\b/)[0]
const codeRequest=async identifier=>{const response=await req('/api/auth/code/request',{body:{identifier}});assert.equal(response.status,200,await response.clone().text());return response.json()}
const emailLogin=async email=>{
 const challenge=await codeRequest(email)
 const response=await req('/api/auth/code/verify',{body:{challengeId:challenge.challengeId,code:await readOtp(email)}})
 assert.equal(response.status,200,await response.clone().text())
 const cookie=cookieOf(response);assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/Secure/);assert.match(response.headers.get('set-cookie'),/SameSite=Lax/)
 const user=(await response.json()).user;accountCookies.set(cookie,user.id)
 return {cookie,user,challenge}
}
const payload=name=>({state:{version:3,settings:{name,api:{openRouterKey:''}},resources:[],words:[],progress:{}},extraStorage:{'vivre-page-resource':'1'},auxiliary:{conversations:[],exercises:[],speaking:[]}})
try {
 await start()
 assert.equal((await req('/')).status,200,'onboarding must be public')
 assert.deepEqual(await (await req('/api/auth/config')).json(),{google:true,email:true,phone:true})
 assert.deepEqual(await (await req('/api/auth/session')).json(),{user:null})
 assert.equal((await req('/api/account/progress')).status,401)
 assert.equal((await req('/api/share/lessons')).status,401)
 assert.equal((await req('/api/share/lessons',{body:{id:'public',username:'someone'}})).status,401)
 assert.equal((await req('/api/auth/code/request',{body:{identifier:'a@example.com'},headers:{Origin:'https://evil.example'}})).status,403)
 assert.equal((await req('/api/auth/code/request',{body:{identifier:'a@example.com'},headers:{Origin:''}})).status,403)
 assert.equal((await req('/api/auth/code/request',{body:{identifier:'not a number'}})).status,400)
 const a=await emailLogin('alice@example.com')
 assert.equal(a.user.email,'alice@example.com');assert.equal(a.user.onboardingComplete,false)
 assert.equal((await req('/api/auth/code/request',{body:{identifier:'alice@example.com'}})).status,429,'resend cooldown')
 assert.equal((await req('/api/auth/code/verify',{body:{challengeId:a.challenge.challengeId,code:await readOtp('alice@example.com')}})).status,400,'OTP single use')
 const profile=await req('/api/auth/profile',{method:'PATCH',cookie:a.cookie,body:{name:'Alice'}})
 assert.equal(profile.status,200);assert.equal((await profile.json()).user.onboardingComplete,true)
 assert.equal((await req('/api/auth/profile',{method:'PATCH',cookie:a.cookie,body:{name:''}})).status,400)
 assert.deepEqual(await (await req('/api/account/progress',{cookie:a.cookie})).json(),{payload:null,revision:0})
 assert.equal((await req('/api/account/progress',{method:'PUT',cookie:a.cookie,body:{payload:payload('Alice'),expectedRevision:0}})).status,200)
 assert.equal((await req('/api/account/progress',{method:'PUT',cookie:a.cookie,body:{payload:payload('Stale'),expectedRevision:0}})).status,409)
 const secret=payload('Alice');secret.state.settings.api.openRouterKey='secret-must-not-upload'
 assert.equal((await req('/api/account/progress',{method:'PUT',cookie:a.cookie,body:{payload:secret,expectedRevision:1}})).status,400)
 const b=await emailLogin('bob@example.com')
 assert.notEqual(a.user.id,b.user.id)
 assert.equal((await req('/api/account/progress',{cookie:b.cookie,headers:{'X-Account-ID':a.user.id}})).status,403,'stale tab cannot read the new account')
 assert.equal((await req('/api/account/progress',{method:'PUT',cookie:b.cookie,headers:{'X-Account-ID':a.user.id},body:{payload:payload('Cross-tab leak'),expectedRevision:0}})).status,403,'stale tab cannot upload into the new account')
 assert.deepEqual(await (await req('/api/account/progress',{cookie:b.cookie})).json(),{payload:null,revision:0},'account isolation')
 assert.equal((await req('/api/account/progress',{method:'PUT',cookie:b.cookie,body:{payload:payload('Bob'),expectedRevision:0,userId:a.user.id}})).status,200)
 assert.equal((await (await req('/api/account/progress',{cookie:a.cookie})).json()).payload.state.settings.name,'Alice','client userId cannot select another account')
 assert.equal((await req('/api/share/lessons',{cookie:a.cookie,body:{id:'alice-lesson',username:'alice',title:'Private owner'}})).status,200)
 assert.equal((await req('/api/share/lessons/alice-lesson')).status,200,'explicitly shared lessons readable')
 assert.equal((await req('/api/share/lessons',{cookie:b.cookie,headers:{'X-Account-ID':a.user.id},body:{id:'wrong-account-lesson',username:'alice'}})).status,403,'stale tab cannot publish into another account')
 assert.equal((await req('/api/share/lessons',{cookie:b.cookie,headers:{'X-Account-ID':a.user.id}})).status,403,'stale tab cannot list another account')
 assert.equal((await req('/api/share/lessons/alice-lesson',{cookie:b.cookie,method:'DELETE',headers:{'X-Account-ID':a.user.id}})).status,403,'stale tab cannot delete through another account')
 assert.equal((await req('/api/share/lessons',{cookie:b.cookie,body:{id:'alice-lesson',username:'bob'}})).status,403)
 assert.equal((await req('/api/share/lessons/alice-lesson',{method:'DELETE',cookie:b.cookie})).status,404)
 assert.deepEqual((await (await req('/api/share/lessons',{cookie:b.cookie})).json()).lessons,[])
 const bad=await codeRequest('attempts@example.com')
 for(let i=0;i<5;i++)assert.equal((await req('/api/auth/code/verify',{body:{challengeId:bad.challengeId,code:'000000'}})).status,400)
 assert.equal((await req('/api/auth/code/verify',{body:{challengeId:bad.challengeId,code:await readOtp('attempts@example.com')}})).status,400,'five wrong attempts lock challenge')
 const expired=await codeRequest('expired@example.com')
 const db=new DatabaseSync(path.join(data,'accounts.sqlite'))
 db.prepare('UPDATE challenges SET expires_at=0 WHERE id=?').run(expired.challengeId)
 assert.equal((await req('/api/auth/code/verify',{body:{challengeId:expired.challengeId,code:await readOtp('expired@example.com')}})).status,400,'expiry')
 const phone=await codeRequest('+33612345678')
 assert.equal(phone.channel,'phone')
 const phoneResponse=await req('/api/auth/code/verify',{body:{challengeId:phone.challengeId,code:'222222'}})
 assert.equal(phoneResponse.status,200);assert.equal((await phoneResponse.json()).user.phone,'+33612345678')
 const oauth=await req('/api/auth/google')
 assert.equal(oauth.status,302)
 const googleUrl=new URL(oauth.headers.get('location')),state=googleUrl.searchParams.get('state'),nonce=googleUrl.searchParams.get('nonce'),challenge=googleUrl.searchParams.get('code_challenge'),oauthCookie=cookieOf(oauth)
 assert.equal(googleUrl.searchParams.get('code_challenge_method'),'S256')
 assert.match((await req('/api/auth/google/callback?state=wrong&code=bad',{cookie:oauthCookie})).headers.get('location'),/google_failed/)
 const callback=await req('/api/auth/google/callback?'+new URLSearchParams({state,code:`${nonce}|${challenge}`}),{cookie:oauthCookie})
 assert.equal(callback.headers.get('location'),'/')
 assert.ok(cookieOf(callback))
 const googleSession=await (await req('/api/auth/session',{cookie:cookieOf(callback)})).json()
 assert.equal(googleSession.user.provider,'google');assert.equal(googleSession.user.email,'google@example.com')
 assert.match((await req('/api/auth/google/callback?'+new URLSearchParams({state,code:`${nonce}|${challenge}`}),{cookie:oauthCookie})).headers.get('location'),/google_failed/,'OAuth state single use')
 for(const badToken of ['nonce','audience']) {
  const response=await req('/api/auth/google'),url=new URL(response.headers.get('location'))
  const badCode=`${badToken==='nonce'?'wrong':url.searchParams.get('nonce')}|${url.searchParams.get('code_challenge')}|${badToken==='audience'?'wrong':'test-client'}`
  const result=await req('/api/auth/google/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:badCode}),{cookie:cookieOf(response)})
  assert.match(result.headers.get('location'),/google_failed/)
  assert.equal(result.headers.get('set-cookie').includes('vivre_session='),false)
 }
 await stop();await start()
 assert.equal((await (await req('/api/account/progress',{cookie:a.cookie})).json()).payload.state.settings.name,'Alice','persistent DB across restart')
 assert.equal((await req('/api/auth/logout',{cookie:a.cookie,body:{}})).status,200)
 assert.deepEqual(await (await req('/api/auth/session',{cookie:a.cookie})).json(),{user:null},'revoked sessions')
 db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(b.user.id)
 assert.equal((await req('/api/account/progress',{cookie:b.cookie})).status,401)
 const sessionRow=db.prepare('SELECT token_hash FROM sessions WHERE user_id=?').get(b.user.id)
 assert.match(sessionRow.token_hash,/^[a-f0-9]{64}$/)
 assert.notEqual(sessionRow.token_hash,b.cookie.split('=')[1],'only hashes are stored, never bearer session tokens')
 db.close()
 await stop();await start({RESEND_API_KEY:'',TWILIO_AUTH_TOKEN:'',GOOGLE_CLIENT_SECRET:''})
 assert.deepEqual(await(await req('/api/auth/config')).json(),{google:false,email:false,phone:false})
 assert.equal((await req('/api/auth/code/request',{body:{identifier:'unconfigured@example.com'}})).status,503,'missing configuration cannot fake successful delivery')
 assert.equal((await req('/api/auth/code/request',{body:{identifier:'+33612345678'}})).status,503)
 console.log('PASS: email/SMS/Google, PKCE+state+nonce+audience, OTP reuse/attempts/expiry/cooldown, secure sessions/revocation, origin, profile, account isolation/conflicts, lesson ownership, persistence, no API key upload')
}finally{await stop();await rm(temp,{recursive:true,force:true})}
