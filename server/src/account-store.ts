import { DatabaseSync } from 'node:sqlite'
import { chmodSync } from 'node:fs'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

export type AccountUser = { id: string; email: string | null; phone: string | null; name: string; provider: string; onboardingComplete: boolean }
export type Challenge = { id: string; identifier: string; channel: 'email' | 'phone'; code_hash: string; expires_at: number; attempts: number; consumed: number; created_at: number }
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export const opaque = () => randomBytes(32).toString('base64url')
export const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT, phone TEXT, name TEXT NOT NULL DEFAULT '',
 provider TEXT NOT NULL, onboarding_complete INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS identities (
 provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(provider, subject)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS challenges (
 id TEXT PRIMARY KEY, identifier TEXT NOT NULL, channel TEXT NOT NULL, code_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS challenges_identifier ON challenges(identifier,created_at);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states (
 state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_progress (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 payload TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lesson_owners (lesson_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
`;

export class AccountStore {
 readonly db: DatabaseSync
 constructor(path: string) {
  this.db = new DatabaseSync(path)
  chmodSync(path, 0o600)
  this.db.exec(schema)
  this.cleanup()
 }
 cleanup() {
  const now = Date.now()
  this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now)
  this.db.prepare('DELETE FROM challenges WHERE expires_at < ?').run(now - 86400000)
  this.db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(now)
  this.db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(now)
 }
 rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const row = this.db.prepare(`INSERT INTO rate_limits(key,hits,reset_at) VALUES(?,1,?)
   ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN reset_at <= ? THEN 1 ELSE hits+1 END,
   reset_at=CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END RETURNING hits`).get(digest(key),now+windowMs,now,now) as {hits:number}
  return row.hits <= max
 }
 user(id: string): AccountUser | null {
  const row = this.db.prepare('SELECT * FROM users WHERE id=?').get(id) as Record<string,unknown> | undefined
  return row ? {id: String(row.id), email: row.email as string|null, phone: row.phone as string|null,name:String(row.name),provider:String(row.provider),onboardingComplete:Boolean(row.onboarding_complete)} : null
 }
 findOrCreate(provider: string, subject: string, email: string|null, phone: string|null, name = ''): AccountUser {
  // Identities are intentionally never linked by matching profile emails alone.
  const existing = this.db.prepare('SELECT user_id FROM identities WHERE provider=? AND subject=?').get(provider,subject) as {user_id:string}|undefined
  if (existing) return this.user(existing.user_id)!
  const id = opaque()
  this.db.exec('BEGIN IMMEDIATE')
  try {
   this.db.prepare('INSERT INTO users(id,email,phone,name,provider,created_at) VALUES(?,?,?,?,?,?)').run(id,email,phone,name.slice(0,80),provider,Date.now())
   this.db.prepare('INSERT INTO identities(provider,subject,user_id) VALUES(?,?,?)').run(provider,subject,id)
   this.db.exec('COMMIT')
  } catch(error) {this.db.exec('ROLLBACK');throw error}
  return this.user(id)!
 }
 session(token?: string): AccountUser|null {
  if (!token || !/^[\w-]{43}$/.test(token)) return null
  const row = this.db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(digest(token),Date.now()) as {user_id:string}|undefined
  return row ? this.user(row.user_id) : null
 }
 issueSession(userId: string, previous?: string) {
  const token=opaque(), now=Date.now()
  if(previous) this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(previous))
  this.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(digest(token),userId,now+30*86400000,now)
  return token
 }
 revoke(token?: string) {if(token) this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token))}
 challenge(id:string) {return this.db.prepare('SELECT * FROM challenges WHERE id=?').get(id) as Challenge|undefined}
 consumeChallenge(id:string) { return this.db.prepare('UPDATE challenges SET consumed=1 WHERE id=? AND consumed=0').run(id).changes === 1 }
 readProgress(userId:string) {
  const row=this.db.prepare('SELECT payload,revision FROM user_progress WHERE user_id=?').get(userId) as {payload:string;revision:number}|undefined
  return row ? {payload:JSON.parse(row.payload),revision:row.revision} : {payload:null,revision:0}
 }
 writeProgress(userId:string,payload:unknown,expectedRevision:number):number|null {
  const json=JSON.stringify(payload)
  if(expectedRevision===0) {
   const change=this.db.prepare('INSERT INTO user_progress(user_id,payload,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(user_id) DO NOTHING').run(userId,json,Date.now())
   return change.changes===1 ? 1 : null
  }
  const row=this.db.prepare('UPDATE user_progress SET payload=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? RETURNING revision').get(json,Date.now(),userId,expectedRevision) as {revision:number}|undefined
  return row?.revision ?? null
 }
}
