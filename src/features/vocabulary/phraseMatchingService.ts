import type { Language } from '../../domain'
import { getInflectionVariants, normalizeWord } from '../../domain'

// Comprehensive dictionary of common English irregular verbs:
// Format: canonical base -> array of principal forms [base, 3rd person singular, past simple, past participle, gerund/continuous]
const ENGLISH_IRREGULAR_VERBS: Record<string, string[]> = {
  be: ['be', 'is', 'are', 'am', 'was', 'were', 'been', 'being'],
  have: ['have', 'has', 'had', 'having'],
  do: ['do', 'does', 'did', 'done', 'doing'],
  go: ['go', 'goes', 'went', 'gone', 'going'],
  say: ['say', 'says', 'said', 'saying'],
  get: ['get', 'gets', 'got', 'gotten', 'getting'],
  make: ['make', 'makes', 'made', 'making'],
  know: ['know', 'knows', 'knew', 'known', 'knowing'],
  think: ['think', 'thinks', 'thought', 'thinking'],
  take: ['take', 'takes', 'took', 'taken', 'taking'],
  see: ['see', 'sees', 'saw', 'seen', 'seeing'],
  come: ['come', 'comes', 'came', 'coming'],
  want: ['want', 'wants', 'wanted', 'wanting'],
  look: ['look', 'looks', 'looked', 'looking'],
  use: ['use', 'uses', 'used', 'using'],
  find: ['find', 'finds', 'found', 'finding'],
  give: ['give', 'gives', 'gave', 'given', 'giving'],
  tell: ['tell', 'tells', 'told', 'telling'],
  work: ['work', 'works', 'worked', 'working'],
  call: ['call', 'calls', 'called', 'calling'],
  try: ['try', 'tries', 'tried', 'trying'],
  ask: ['ask', 'asks', 'asked', 'asking'],
  need: ['need', 'needs', 'needed', 'needing'],
  feel: ['feel', 'feels', 'felt', 'feeling'],
  become: ['become', 'becomes', 'became', 'becoming'],
  leave: ['leave', 'leaves', 'left', 'leaving'],
  put: ['put', 'puts', 'putting'],
  mean: ['mean', 'means', 'meant', 'meaning'],
  keep: ['keep', 'keeps', 'kept', 'keeping'],
  let: ['let', 'lets', 'letting'],
  begin: ['begin', 'begins', 'began', 'begun', 'beginning'],
  seem: ['seem', 'seems', 'seemed', 'seeming'],
  help: ['help', 'helps', 'helped', 'helping'],
  talk: ['talk', 'talks', 'talked', 'talking'],
  turn: ['turn', 'turns', 'turned', 'turning'],
  start: ['start', 'starts', 'started', 'starting'],
  show: ['show', 'shows', 'showed', 'shown', 'showing'],
  hear: ['hear', 'hears', 'heard', 'hearing'],
  play: ['play', 'plays', 'played', 'playing'],
  run: ['run', 'runs', 'ran', 'running'],
  move: ['move', 'moves', 'moved', 'moving'],
  like: ['like', 'likes', 'liked', 'liking'],
  live: ['live', 'lives', 'lived', 'living'],
  believe: ['believe', 'believes', 'believed', 'believing'],
  hold: ['hold', 'holds', 'held', 'holding'],
  bring: ['bring', 'brings', 'brought', 'bringing'],
  happen: ['happen', 'happens', 'happened', 'happening'],
  write: ['write', 'writes', 'wrote', 'written', 'writing'],
  provide: ['provide', 'provides', 'provided', 'providing'],
  sit: ['sit', 'sits', 'sat', 'sitting'],
  stand: ['stand', 'stands', 'stood', 'standing'],
  lose: ['lose', 'loses', 'lost', 'losing'],
  pay: ['pay', 'pays', 'paid', 'paying'],
  meet: ['meet', 'meets', 'met', 'meeting'],
  include: ['include', 'includes', 'included', 'including'],
  continue: ['continue', 'continues', 'continued', 'continuing'],
  set: ['set', 'sets', 'setting'],
  learn: ['learn', 'learns', 'learned', 'learnt', 'learning'],
  change: ['change', 'changes', 'changed', 'changing'],
  lead: ['lead', 'leads', 'led', 'leading'],
  understand: ['understand', 'understands', 'understood', 'understanding'],
  watch: ['watch', 'watches', 'watched', 'watching'],
  follow: ['follow', 'follows', 'followed', 'following'],
  stop: ['stop', 'stops', 'stopped', 'stopping'],
  create: ['create', 'creates', 'created', 'creating'],
  speak: ['speak', 'speaks', 'spoke', 'spoken', 'speaking'],
  read: ['read', 'reads', 'reading'],
  allow: ['allow', 'allows', 'allowed', 'allowing'],
  add: ['add', 'adds', 'added', 'adding'],
  spend: ['spend', 'spends', 'spent', 'spending'],
  grow: ['grow', 'grows', 'grew', 'grown', 'growing'],
  open: ['open', 'opens', 'opened', 'opening'],
  walk: ['walk', 'walks', 'walked', 'walking'],
  win: ['win', 'wins', 'won', 'winning'],
  offer: ['offer', 'offers', 'offered', 'offering'],
  remember: ['remember', 'remembers', 'remembered', 'remembering'],
  love: ['love', 'loves', 'loved', 'loving'],
  consider: ['consider', 'considers', 'considered', 'considering'],
  appear: ['appear', 'appears', 'appeared', 'appearing'],
  buy: ['buy', 'buys', 'bought', 'buying'],
  wait: ['wait', 'waits', 'waited', 'waiting'],
  serve: ['serve', 'serves', 'served', 'serving'],
  die: ['die', 'dies', 'died', 'dying'],
  send: ['send', 'sends', 'sent', 'sending'],
  expect: ['expect', 'expects', 'expected', 'expecting'],
  build: ['build', 'builds', 'built', 'building'],
  stay: ['stay', 'stays', 'stayed', 'staying'],
  fall: ['fall', 'falls', 'fell', 'fallen', 'falling'],
  cut: ['cut', 'cuts', 'cutting'],
  reach: ['reach', 'reaches', 'reached', 'reaching'],
  kill: ['kill', 'kills', 'killed', 'killing'],
  remain: ['remain', 'remains', 'remained', 'remaining'],
  suggest: ['suggest', 'suggests', 'suggested', 'suggesting'],
  raise: ['raise', 'raises', 'raised', 'raising'],
  pass: ['pass', 'passes', 'passed', 'passing'],
  sell: ['sell', 'sells', 'sold', 'selling'],
  require: ['require', 'requires', 'required', 'requiring'],
  report: ['report', 'reports', 'reported', 'reporting'],
  decide: ['decide', 'decides', 'decided', 'deciding'],
  pull: ['pull', 'pulls', 'pulled', 'pulling'],
  break: ['break', 'breaks', 'broke', 'broken', 'breaking'],
  point: ['point', 'points', 'pointed', 'pointing'],
  figure: ['figure', 'figures', 'figured', 'figuring'],
  carry: ['carry', 'carries', 'carried', 'carrying'],
  catch: ['catch', 'catches', 'caught', 'catching'],
  wake: ['wake', 'wakes', 'woke', 'woken', 'waking'],
  sleep: ['sleep', 'sleeps', 'slept', 'sleeping'],
  hang: ['hang', 'hangs', 'hung', 'hanging'],
  wear: ['wear', 'wears', 'wore', 'worn', 'wearing'],
  throw: ['throw', 'throws', 'threw', 'thrown', 'throwing'],
  draw: ['draw', 'draws', 'drew', 'drawn', 'drawing'],
  drive: ['drive', 'drives', 'drove', 'driven', 'driving'],
  fly: ['fly', 'flies', 'flew', 'flown', 'flying'],
  hide: ['hide', 'hides', 'hid', 'hidden', 'hiding'],
  ring: ['ring', 'rings', 'rang', 'rung', 'ringing'],
  rise: ['rise', 'rises', 'rose', 'risen', 'rising'],
  shake: ['shake', 'shakes', 'shook', 'shaken', 'shaking'],
  shoot: ['shoot', 'shoots', 'shot', 'shooting'],
  sweep: ['sweep', 'sweeps', 'swept', 'sweeping'],
  swim: ['swim', 'swims', 'swam', 'swum', 'swimming'],
  tear: ['tear', 'tears', 'tore', 'torn', 'tearing'],
  wind: ['wind', 'winds', 'wound', 'winding'],
  deal: ['deal', 'deals', 'dealt', 'dealing'],
  speed: ['speed', 'speeds', 'sped', 'speeding'],
  stick: ['stick', 'sticks', 'stuck', 'sticking'],
  strike: ['strike', 'strikes', 'struck', 'striking'],
  bear: ['bear', 'bears', 'bore', 'born', 'borne', 'bearing'],
  beat: ['beat', 'beats', 'beaten', 'beating'],
  bite: ['bite', 'bites', 'bit', 'bitten', 'biting'],
  blow: ['blow', 'blows', 'blew', 'blown', 'blowing'],
  burn: ['burn', 'burns', 'burned', 'burnt', 'burning'],
  choose: ['choose', 'chooses', 'chose', 'chosen', 'choosing'],
  creep: ['creep', 'creeps', 'crept', 'creeping'],
  dig: ['dig', 'digs', 'dug', 'digging'],
  dream: ['dream', 'dreams', 'dreamed', 'dreamt', 'dreaming'],
  drink: ['drink', 'drinks', 'drank', 'drunk', 'drinking'],
  eat: ['eat', 'eats', 'ate', 'eaten', 'eating'],
  feed: ['feed', 'feeds', 'fed', 'feeding'],
  fight: ['fight', 'fights', 'fought', 'fighting'],
  fit: ['fit', 'fits', 'fitting'],
  forget: ['forget', 'forgets', 'forgot', 'forgotten', 'forgetting'],
  forgive: ['forgive', 'forgives', 'forgave', 'forgiven', 'forgiving'],
  freeze: ['freeze', 'freezes', 'froze', 'frozen', 'freezing'],
  hurt: ['hurt', 'hurts', 'hurting'],
  lay: ['lay', 'lays', 'laid', 'laying'],
  lie: ['lie', 'lies', 'lay', 'lain', 'lying'],
  ride: ['ride', 'rides', 'rode', 'ridden', 'riding'],
  seek: ['seek', 'seeks', 'sought', 'seeking'],
  shut: ['shut', 'shuts', 'shutting'],
  sing: ['sing', 'sings', 'sang', 'sung', 'singing'],
  sink: ['sink', 'sinks', 'sank', 'sunk', 'sinking'],
  smell: ['smell', 'smells', 'smelled', 'smelt', 'smelling'],
  spill: ['spill', 'spills', 'spilled', 'spilt', 'spilling'],
  spin: ['spin', 'spins', 'spun', 'spinning'],
  spit: ['spit', 'spits', 'spat', 'spitting'],
  split: ['split', 'splits', 'splitting'],
  spread: ['spread', 'spreads', 'spreading'],
  spring: ['spring', 'springs', 'sprang', 'sprung', 'springing'],
  steal: ['steal', 'steals', 'stole', 'stolen', 'stealing'],
  swear: ['swear', 'swears', 'swore', 'sworn', 'swearing'],
  swing: ['swing', 'swings', 'swung', 'swinging'],
  rush: ['rush', 'rushes', 'rushed', 'rushing'],
  calm: ['calm', 'calms', 'calmed', 'calming'],
  cheer: ['cheer', 'cheers', 'cheered', 'cheering'],
}

// Inverted index: form -> canonical base
const IRREGULAR_FORM_TO_BASE: Record<string, string> = {}
for (const [base, forms] of Object.entries(ENGLISH_IRREGULAR_VERBS)) {
  for (const form of forms) {
    IRREGULAR_FORM_TO_BASE[form.toLowerCase()] = base.toLowerCase()
  }
}

/**
 * Returns all possible inflectional variants of a single word in a given language.
 */
export function getWordVariants(word: string, language: Language = 'en'): string[] {
  const norm = normalizeWord(word)
  if (!norm || norm.length <= 1) return norm ? [norm] : []

  const set = new Set<string>([norm])

  // Include regular inflection variants (-s, -es, -ed, -ing, plurals)
  for (const v of getInflectionVariants(norm)) {
    set.add(v)
  }

  if (language === 'en') {
    // Check if the word is an irregular verb or inflected form
    const base = IRREGULAR_FORM_TO_BASE[norm] || (ENGLISH_IRREGULAR_VERBS[norm] ? norm : null)
    if (base && ENGLISH_IRREGULAR_VERBS[base]) {
      for (const form of ENGLISH_IRREGULAR_VERBS[base]) {
        set.add(form)
      }
    }
  }

  return Array.from(set).filter(Boolean)
}

/**
 * Constructs an optimized, boundary-safe regular expression that matches a phrase
 * and any of its inflected surface forms in text.
 *
 * Example: "look forward to" matches "look forward to", "looking forward to",
 * "looks forward to", "looked forward to", with flexible whitespace and hyphens.
 */
export function buildPhraseRegex(phrase: string, language: Language = 'en'): RegExp | null {
  if (!phrase) return null
  const cleaned = phrase.trim().replace(/[\u2018\u2019`]/g, "'")
  const parts = cleaned.split(/[\s-]+/).filter(Boolean)
  if (parts.length < 2) return null

  const wordPatterns = parts.map((part, index) => {
    // In English, the head verb of a phrasal verb or expression is usually word 0 or word 1
    const variants = getWordVariants(part, language)
    const escapedVariants = variants
      .sort((a, b) => b.length - a.length)
      .map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’‘]"))
    return `(?:${escapedVariants.join('|')})`
  })

  // Match flexible spacing: spaces, non-breaking spaces, or hyphens
  const joined = wordPatterns.join('[-\\s\u00A0]+')

  // Unicode-safe word boundaries
  return new RegExp(`(?:^|[^\\p{L}\\p{N}'’‘-])(${joined})(?=[^\\p{L}\\p{N}'’‘-]|$)`, 'giu')
}

/**
 * Determines whether two multi-word phrases match each other, accounting for
 * inflectional variations (e.g. "looking forward to" <-> "look forward to"),
 * hyphens vs spaces, and casing.
 */
export function matchesPhraseInflection(
  phraseA: string,
  phraseB: string,
  language: Language = 'en'
): boolean {
  if (!phraseA || !phraseB) return false
  const cleanA = phraseA.replace(/[\u2018\u2019`]/g, "'").trim()
  const cleanB = phraseB.replace(/[\u2018\u2019`]/g, "'").trim()

  const wordsA = cleanA.split(/[\s-]+/).filter(Boolean).map(normalizeWord)
  const wordsB = cleanB.split(/[\s-]+/).filter(Boolean).map(normalizeWord)

  if (wordsA.length < 2 && wordsB.length < 2) return false
  if (wordsA.length !== wordsB.length) return false

  for (let i = 0; i < wordsA.length; i++) {
    const a = wordsA[i]
    const b = wordsB[i]
    if (a === b) continue

    const varA = getWordVariants(a, language)
    if (varA.includes(b)) continue

    const varB = getWordVariants(b, language)
    if (varB.includes(a)) continue

    return false
  }

  return true
}
