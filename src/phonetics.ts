import type { Language } from './domain'

/**
 * Phonetic knowledge base used by the reader:
 * - silent letters (English + French), combinable with user overrides
 * - grammar highlighting (verbs / auxiliaries)
 * - syllable estimation and a native-like intonation profile for the rhythm view
 *
 * The silent-letter table stores the exact lowercase characters of the word that
 * are NOT pronounced (General American English / standard French).
 */

// ---------------------------------------------------------------------------
// Silent letters — English (General American)
// ---------------------------------------------------------------------------

const EN_SILENT_RAW: Record<string, string> = {
  // silent k
  knee: 'k', kneel: 'k', knew: 'k', knife: 'k', knight: 'k', knit: 'k', knob: 'k', knock: 'k',
  knot: 'k', know: 'k', knowledge: 'k', known: 'k', knuckle: 'k', knack: 'k', knapsack: 'k',
  // silent w
  write: 'w', written: 'w', writing: 'w', wrote: 'w', wrong: 'w', wrap: 'w', wreck: 'w', wrist: 'w',
  wrestle: 'wt', wreath: 'w', wrinkle: 'w', sword: 'w', answer: 'w', two: 'w', who: 'w', whom: 'w',
  whose: 'w', whole: 'w', wholesome: 'w',
  // silent b
  climb: 'b', climbed: 'b', climbing: 'b', comb: 'b', bomb: 'b', bombing: 'b', thumb: 'b', lamb: 'b',
  dumb: 'b', numb: 'b', plumb: 'b', plumber: 'b', crumb: 'b', debt: 'b', debtor: 'b', doubt: 'b',
  subtle: 'b', subtly: 'b', tomb: 'b', womb: 'b', succumb: 'b',
  // silent t
  listen: 't', listened: 't', listening: 't', often: 't', soften: 't', fasten: 't', hasten: 't',
  castle: 't', whistle: 't', wrestleT: '', nestle: 't', bustle: 't', hustle: 't', rustle: 't',
  glisten: 't', moisten: 't', christen: 't', mortgage: 't', christmas: 't', ballet: 't', buffet: 't',
  valet: 't', depot: 't', rapport: 't', gourmet: 't', sorbet: 't', fillet: 't', crochet: 't',
  match: 't', watch: 't', catch: 't', fetch: 't', switch: 't', stitch: 't', kitchen: 't',
  butcher: 't', hatch: 't', latch: 't', patch: 't', scratch: 't', snatch: 't', stretch: 't',
  // silent h
  honest: 'h', honestly: 'h', honor: 'h', honorable: 'h', hour: 'h', hourly: 'h', heir: 'h',
  heiress: 'h', herb: 'h', vehicle: 'h', exhaust: 'h', exhibit: 'h', exhibition: 'h', rhythm: 'h',
  rhyme: 'h', what: 'h', when: 'h', where: 'h', why: 'h', which: 'h', while: 'h',
  white: 'h', whisper: 'h', wheat: 'h', wheel: 'h', whether: 'h',
  // silent g / gh
  sign: 'g', design: 'g', resign: 'g', assign: 'g',
  align: 'g', benign: 'g', malign: 'g', reign: 'g', foreign: 'g', foreigner: 'g', sovereign: 'g',
  campaign: 'g', champagne: 'g', gnome: 'g', gnaw: 'g', gnarl: 'g', gnu: 'g', diaphragm: 'g',
  paradigm: 'g', phlegm: 'g',
  high: 'gh', sigh: 'gh', thigh: 'gh', neighbor: 'gh', neighborhood: 'gh', weigh: 'gh', weight: 'gh',
  eight: 'gh', eighty: 'gh', freight: 'gh', sleigh: 'gh', light: 'gh', lightning: 'gh', night: 'gh',
  right: 'gh', bright: 'gh', fight: 'gh', might: 'gh', sight: 'gh', tight: 'gh',
  flight: 'gh', slight: 'gh', daughter: 'gh', slaughter: 'gh', caught: 'gh', taught: 'gh',
  naughty: 'gh', haughty: 'gh', fraught: 'gh', thought: 'gh', brought: 'gh', bought: 'gh',
  fought: 'gh', ought: 'gh', sought: 'gh', wrought: 'gh', through: 'gh', throughout: 'gh',
  thorough: 'gh', although: 'gh', dough: 'gh', though: 'gh', borough: 'gh', plough: 'gh',
  bough: 'gh', drought: 'gh',
  // silent l
  talk: 'l', talked: 'l', talking: 'l', walk: 'l', walked: 'l', walking: 'l', chalk: 'l',
  stalk: 'l', balk: 'l', calm: 'l', calmly: 'l', palm: 'l', balm: 'l', psalm: 'l', qualm: 'l',
  almond: 'l', salmon: 'l', half: 'l', behalf: 'l', calf: 'l', would: 'l', could: 'l', should: 'l',
  folk: 'l', yolk: 'l', holm: 'l',
  // silent n
  autumn: 'n', column: 'n', condemn: 'n', damn: 'n', damned: 'n', hymn: 'n',
  solemn: 'n', limn: 'n',
  // silent p
  psychology: 'p', psychological: 'p', psychologist: 'p', psychiatry: 'p', psychic: 'p',
  pneumonia: 'p', pneumatic: 'p', pseudo: 'p', pseudonym: 'p', psoriasis: 'p',
  pterodactyl: 'p', receipt: 'p', cupboard: 'p', raspberry: 'p', corps: 'ps',
  coup: 'p',
  // silent s / c / u
  island: 's', isle: 's', aisle: 's', debris: 's', bourgeois: 's', rendezvous: 's', chamois: 's',
  viscount: 's',
  muscle: 'c', scene: 'c', scent: 'c', scissors: 'c', ascend: 'c', descend: 'c',
  fascinate: 'c',
  guess: 'u', guest: 'u', guide: 'u', guild: 'u', guitar: 'u', guilt: 'u', guilty: 'u',
  build: 'u', building: 'u', built: 'u', guard: 'u', guardian: 'u', league: 'ue', dialogue: 'ue',
  catalog: '', colleague: 'ue', tongue: 'ue', vague: 'ue', fatigue: 'ue', intrigue: 'ue',
  plague: 'ue', synagogue: 'ue', rogue: 'ue', vogue: 'ue',
  // silent i (per teacher note: fr(i)endly)
  friendly: 'i', friend: 'i', friends: 'i', friendship: 'i', business: 'i', businesses: 'i',
  suit: 'i', suitable: 'i', circuit: 'ui', biscuit: 'ui',
  // silent a / e misc
  bread: 'a', breads: 'a', breadth: '', read: 'a', ready: 'a', readier: 'a', steady: 'a',
  instead: 'a', head: 'a', ahead: 'a', overhead: 'a', breadwinner: 'a', dead: 'a', deadly: 'a',
  deaf: 'a', dealt: 'a', health: 'a', healthy: 'a', wealth: 'a', wealthy: 'a', meant: 'a',
  breakfast: 'a', spread: 'a', thread: 'a', threat: 'a', threaten: 'a', sweat: 'a', sweater: 'a',
  feather: 'a', leather: 'a', weather: 'a', heather: 'a', measure: 'a', pleasure: 'a', treasure: 'a',
  jealous: 'a',
  vegetable: 'e', comfortable: 'or', interesting: 'e', different: 'e',
  several: 'e', every: 'e', chocolate: 'o', favorite: 'o',
  history: 'o', factory: 'o',
  wednesday: 'd', handsome: 'd', handkerchief: 'd', sandwich: 'd', edge: 'd', hedge: 'd',
  pledge: 'd', judge: 'd', lodge: 'd', bridge: 'd', fridge: 'd', dodge: 'd', badge: 'd',
  grandma: 'd',
  // French loanwords (silent endings)
  faux: 'x', prix: 'x',
}

// Keep only characters that actually occur in the word (data hygiene), and
// drop helper duplicate keys ending with a digit.
export const silentLettersEn: Record<string, string[]> = Object.fromEntries(
  Object.entries(EN_SILENT_RAW)
    .filter(([word]) => !/\d$/.test(word))
    .map(([word, silent]) => [word, [...new Set([...silent].filter((letter) => word.includes(letter)))]] )
    .filter(([, letters]) => letters.length > 0),
)

/** English pattern-based rules applied when the word is not in the table. */
function englishSilentRules(word: string): string[] {
  const silent = new Set<string>()
  const letters = [...word]
  if (word.length <= 3) return []
  // final unaccented silent "e" (not in be/he/she/we/the/eye...)
  const eExceptions = new Set(['be', 'he', 'she', 'we', 'the', 'eye', 'bye', 'dye', 'rye', 'age', 'cafe'])
  if (word.endsWith('e') && !eExceptions.has(word) && /[bcdfghjklmnpqrstvwxz]e$/.test(word)) silent.add('e')
  if (word.startsWith('kn')) silent.add('k')
  if (word.startsWith('wr')) silent.add('w')
  if (word.startsWith('gn') || word.startsWith('pn') || word.startsWith('ps')) silent.add(letters[0])
  if (/mb$/.test(word)) silent.add('b')
  if (/mn$/.test(word) && word.length > 3) silent.add('n')
  if (word.includes('gh') && !/^(ghost|ghoul|ghetto|spaghetti)/.test(word)) { silent.add('g'); silent.add('h') }
  if (/tch/.test(word)) silent.add('t')
  if (/(sten|stle)$/.test(word)) silent.add('t')
  return [...silent].filter((letter) => letters.includes(letter))
}

// ---------------------------------------------------------------------------
// Silent letters — French (rule-based + exception table)
// ---------------------------------------------------------------------------

const FR_SILENT_RAW: Record<string, string> = {
  // very common cases
  est: 't', et: 't', pied: 'd', nid: 'd', froid: 'd', chaud: 'd', grand: 'd', quand: 'd',
  second: 'd', fond: 'd', rond: 'd', bord: 'd', tard: 'd', hasard: 'd',
  petit: 't', petits: 'ts', touts: 'ts',
  beaucoup: 'p', trop: 'p', sirop: 'p', champ: 'p', camp: 'p', temps: 'ps', printemps: 'ps',
  corps: 'rps', drap: 'p', loup: 'p', galop: 'p',
  fils: 'l', cours: 's', discours: 's', toujours: 's',
  jours: 's', nuit: 't', nuits: 'ts', oeuf: 'f', oeufs: 'fs',
  boeuf: 'f', boeufs: 'fs', clef: 'f',
  sang: 'g', long: 'g', rang: 'g', sanglots: '', vingt: 'gt', doigt: 't', doigts: 'ts',
  respect: 'ct', aspect: 'ct', suspect: 'ct', instinct: 'ct', district: 'ct', contact: 'ct',
  compact: 'ct', exact: 'ct', tact: '', direct: 'ct', correct: 'ct', indirect: 'ct',
  poulet: 't', poulets: 'ts', buffet: 't', billet: 't', jouet: 't', projet: 't', sujet: 't',
  objet: 't', regret: 't', secret: 't', complet: 't', concret: 't', discret: 't', inquiet: 't',
  effet: 't', fait: 't', faits: 'ts', plait: 't', plait2: '', lait: 't', lait2: '', palais: 's',
  frais: 's', fraiche: '', anglais: 's', francais: 's', japonais: 's', mais: 's', jamais: 's',
  palais2: '', tapis: 's', paris: 's', gris: 's', paris2: '', avis: 's', pays: 's', abatis: '',
  blanc: 'c', blanche: '', franc: 'c', franche: '', tronc: 'c', porc: 'c', accroc: 'c',
  tabac: 'c', estomac: 'c', donc: 'c', croc: 'c',
  monsieur: '', messieurs: '', homme: '', femme: '', automne: 'n', solennel: '',
  compte: 'pt', comptes: 'pts', comptent: 'nt', parlent: 'nt', chantent: 'nt', mangent: 'nt',
  aiment: 'nt', finissent: 'nt', prennent: 'nt', viennent: 'nt', voient: 'nt', croient: 'nt',
  peuvent: 'nt', veulent: 'nt', savent: 'nt', vont: '', font: '', sont: '',
  clefs: 'fs', ufs: '', oeil: '', yeux: 'x', deux: 'x', six: 'x', dix: 'x', vieux: 'x',
  beaux: 'x', nouveaux: 'x', cheveux: 'x', jeux: 'x', lieux: 'x', adieux: 'x', mieux: 'x',
  heureux: 'x', nombreux: 'x', curieux: 'x', serieux: 'x', precieux: 'x', delicieux: 'x',
  nez: 'z', chez: 'z', riz: 'z', nez2: '', gaz: 'z', assez: 'z', allez: 'z', parlez: 'z',
  mangez: 'z', finissez: 'z', prenez: 'z', voulez: 'z', pouvez: 'z', savez: 'z', avez: 'z',
  etes: 'ts', faites: 'ts', dites: 'ts', venez: 'z', tenez: 'z', arrivez: 'z', ecoutez: 'z',
  regardez: 'z', travaillez: 'z', habitez: 'z', habite: '', habites: 's', habitent: 'nt',
}

export const silentLettersFr: Record<string, string[]> = Object.fromEntries(
  Object.entries(FR_SILENT_RAW)
    .filter(([word]) => !/\d$/.test(word))
    .map(([word, silent]) => [word, [...new Set([...silent].filter((letter) => word.includes(letter)))]] )
    .filter(([, letters]) => letters.length > 0),
)

/** French fallback rules for words not present in the table. */
function frenchSilentRules(word: string): string[] {
  const silent = new Set<string>()
  const letters = [...word]
  if (word.length <= 2) return []
  const pronouncedFinal = new Set(['c', 'f', 'l', 'q', 'r', 'k', 'b']) // caReFuL + k/b
  // unaccented final "e" is silent (but not after é: année, musée…)
  if (word.endsWith('e') && word[word.length - 2] !== 'é') silent.add('e')
  // final "ent" of 3rd-person plural verbs
  if (word.endsWith('ent') && word.length > 4) { silent.add('n'); silent.add('t') }
  else {
    // generic silent final consonants (s, t, d, p, x, z, g after n)
    const last = letters[letters.length - 1]
    const stripped = word.replace(/e$/, '')
    const final = stripped[stripped.length - 1]
    if (['s', 't', 'd', 'p', 'x', 'z'].includes(final) && !pronouncedFinal.has(final)) silent.add(final)
    if (/ng$/.test(stripped)) silent.add('g')
  }
  if (word.endsWith('es') && word.length > 3) silent.add('s')
  return [...silent].filter((letter) => letters.includes(letter))
}

/** Full silent-letter lookup: user overrides > dictionary tables > pattern rules. */
export function silentLettersFor(
  normalized: string,
  language: Language,
  overrides: Record<string, string[]> = {},
): string[] {
  if (Object.prototype.hasOwnProperty.call(overrides, normalized)) return overrides[normalized]
  if (language === 'en') {
    const table = silentLettersEn[normalized]
    if (table) return table
    return englishSilentRules(normalized)
  }
  const table = silentLettersFr[normalized]
  if (table) return table
  return frenchSilentRules(normalized)
}

/** Built-in (non-overridden) value — used by the override editor to show the default. */
export function builtinSilentLetters(normalized: string, language: Language): string[] {
  return language === 'en' ? (silentLettersEn[normalized] ?? englishSilentRules(normalized)) : (silentLettersFr[normalized] ?? frenchSilentRules(normalized))
}

// ---------------------------------------------------------------------------
// Grammar highlighting — verbs & auxiliaries
// ---------------------------------------------------------------------------

const EN_AUX = new Set([
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'done',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'ought',
])

// Base forms, past tenses and participles of the ~120 most frequent English verbs.
const EN_VERB_FORMS = new Set([
  'go', 'goes', 'going', 'went', 'gone',
  'come', 'comes', 'coming', 'came',
  'get', 'gets', 'getting', 'got', 'gotten',
  'make', 'makes', 'making', 'made',
  'take', 'takes', 'taking', 'took', 'taken',
  'see', 'sees', 'seeing', 'saw', 'seen',
  'know', 'knows', 'knowing', 'knew', 'known',
  'think', 'thinks', 'thinking', 'thought',
  'say', 'says', 'saying', 'said',
  'tell', 'tells', 'telling', 'told',
  'give', 'gives', 'giving', 'gave', 'given',
  'find', 'finds', 'finding', 'found',
  'feel', 'feels', 'feeling', 'felt',
  'leave', 'leaves', 'leaving', 'left',
  'put', 'puts', 'putting',
  'bring', 'brings', 'bringing', 'brought',
  'begin', 'begins', 'beginning', 'began', 'begun',
  'keep', 'keeps', 'keeping', 'kept',
  'hold', 'holds', 'holding', 'held',
  'write', 'writes', 'writing', 'wrote', 'written',
  'stand', 'stands', 'standing', 'stood',
  'hear', 'hears', 'hearing', 'heard',
  'let', 'lets', 'letting',
  'mean', 'means', 'meaning', 'meant',
  'set', 'sets', 'setting',
  'meet', 'meets', 'meeting', 'met',
  'run', 'runs', 'running', 'ran',
  'pay', 'pays', 'paying', 'paid',
  'sit', 'sits', 'sitting', 'sat',
  'speak', 'speaks', 'speaking', 'spoke', 'spoken',
  'lie', 'lies', 'lying', 'lay', 'lain',
  'lead', 'leads', 'leading', 'led',
  'reads', 'reading', 'read',
  'grow', 'grows', 'growing', 'grew', 'grown',
  'open', 'opens', 'opening', 'opened',
  'walk', 'walks', 'walking', 'walked',
  'win', 'wins', 'winning', 'won',
  'teach', 'teaches', 'teaching', 'taught',
  'offer', 'offers', 'offering', 'offered',
  'remember', 'remembers', 'remembering', 'remembered',
  'love', 'loves', 'loving', 'loved',
  'consider', 'considers', 'considering', 'considered',
  'appear', 'appears', 'appearing', 'appeared',
  'buy', 'buys', 'buying', 'bought',
  'wait', 'waits', 'waiting', 'waited',
  'serve', 'serves', 'serving', 'served',
  'die', 'dies', 'dying', 'died',
  'send', 'sends', 'sending', 'sent',
  'build', 'builds', 'building', 'built',
  'stay', 'stays', 'staying', 'stayed',
  'fall', 'falls', 'falling', 'fell', 'fallen',
  'cut', 'cuts', 'cutting',
  'reach', 'reaches', 'reaching', 'reached',
  'kill', 'kills', 'killing', 'killed',
  'remain', 'remains', 'remaining', 'remained',
  'eat', 'eats', 'eating', 'ate', 'eaten',
  'drink', 'drinks', 'drinking', 'drank', 'drunk',
  'sleep', 'sleeps', 'sleeping', 'slept',
  'wake', 'wakes', 'waking', 'woke', 'woken',
  'drive', 'drives', 'driving', 'drove', 'driven',
  'ride', 'rides', 'riding', 'rode', 'ridden',
  'sing', 'sings', 'singing', 'sang', 'sung',
  'swim', 'swims', 'swimming', 'swam', 'swum',
  'fly', 'flies', 'flying', 'flew', 'flown',
  'draw', 'draws', 'drawing', 'drew', 'drawn',
  'wear', 'wears', 'wearing', 'wore', 'worn',
  'break', 'breaks', 'breaking', 'broke', 'broken',
  'choose', 'chooses', 'choosing', 'chose', 'chosen',
  'catch', 'catches', 'catching', 'caught',
  'fight', 'fights', 'fighting', 'fought',
  'lose', 'loses', 'losing', 'lost',
  'spend', 'spends', 'spending', 'spent',
  'learn', 'learns', 'learning', 'learned', 'learnt',
  'work', 'works', 'working', 'worked',
  'live', 'lives', 'living', 'lived',
  'play', 'plays', 'playing', 'played',
  'ask', 'asks', 'asking', 'asked',
  'answer', 'answers', 'answering', 'answered',
  'talk', 'talks', 'talking', 'talked',
  'smile', 'smiles', 'smiling', 'smiled',
  'laugh', 'laughs', 'laughing', 'laughed',
  'watch', 'watches', 'watching', 'watched',
  'listen', 'listens', 'listening', 'listened',
  'carry', 'carries', 'carrying', 'carried',
  'visit', 'visits', 'visiting', 'visited',
  'share', 'shares', 'sharing', 'shared',
  'arrive', 'arrives', 'arriving', 'arrived',
  'order', 'orders', 'ordering', 'ordered',
])

const FR_VERB_FORMS = new Set([
  'suis', 'es', 'est', 'sommes', 'etes', 'sont', 'etais', 'etait', 'etions', 'etiez', 'etaient',
  'serai', 'seras', 'sera', 'serons', 'serez', 'seront', 'sois', 'soit', 'soyons', 'soyez', 'soient', 'ete', 'etant',
  'ai', 'as', 'a', 'avons', 'avez', 'ont', 'avais', 'avait', 'avions', 'aviez', 'avaient',
  'aurai', 'auras', 'aura', 'auront', 'aie', 'aies', 'ait', 'ayons', 'ayez', 'aient', 'eu', 'ayant',
  'vais', 'vas', 'va', 'allons', 'allez', 'vont', 'allais', 'allait', 'allaient', 'irai', 'iras', 'ira', 'irons', 'irez', 'iront', 'alle',
  'fais', 'fait', 'faisons', 'faites', 'font', 'faisais', 'faisait', 'faisaient', 'ferai', 'fera', 'feront',
  'viens', 'vient', 'venons', 'venez', 'viennent', 'venais', 'venait', 'viendrai', 'viendra', 'venu', 'venue',
  'vois', 'voit', 'voyons', 'voyez', 'voient', 'voyais', 'verrai', 'verra', 'vu', 'vue',
  'peux', 'peut', 'pouvons', 'pouvez', 'peuvent', 'pouvais', 'pourrai', 'pourra', 'pu',
  'veux', 'veut', 'voulons', 'voulez', 'veulent', 'voulais', 'voudrai', 'voudra', 'voulu',
  'dois', 'doit', 'devons', 'devez', 'doivent', 'devais', 'devrai', 'du',
  'sais', 'sait', 'savons', 'savez', 'savent', 'savais', 'saurai',
  'prends', 'prend', 'prenons', 'prenez', 'prennent', 'prenais', 'prendrai', 'pris', 'prise',
  'mets', 'met', 'mettons', 'mettez', 'mettent', 'mettais', 'mis', 'mise',
  'dis', 'dit', 'disons', 'dites', 'disent', 'disais', 'dirai', 'dite',
  'pars', 'part', 'partons', 'partez', 'partent', 'partais', 'partirai', 'parti',
  'mange', 'manges', 'mangeons', 'mangez', 'mangent', 'mangeais', 'mangeaient', 'mange',
  'parle', 'parles', 'parlons', 'parlez', 'parlent', 'parlais', 'parlait', 'parlaient', 'parlerai',
  'aime', 'aimes', 'aimons', 'aiment', 'aimais', 'aimerai',
  'regarde', 'regardes', 'regardons', 'regardez', 'regardent', 'regardais',
  'ecoute', 'ecoutes', 'ecoutons', 'ecoutez', 'ecoutent', 'ecoutais',
  'marche', 'marches', 'marchons', 'marchez', 'marchent', 'marchais',
  'travaille', 'travailles', 'travaillons', 'travaillez', 'travaillent', 'travaillais',
  'habite', 'habites', 'habitons', 'habitez', 'habitent', 'habitais',
  'pense', 'penses', 'pensons', 'pensez', 'pensent', 'pensais',
  'crois', 'croit', 'croyons', 'croyez', 'croient', 'croyais', 'cru', 'crue',
  'bois', 'boit', 'buvons', 'buvez', 'boivent', 'buvais', 'bu', 'bue',
  'dors', 'dort', 'dormons', 'dormez', 'dorment', 'dormais', 'dormi',
  'ouvre', 'ouvres', 'ouvrons', 'ouvrez', 'ouvrent', 'ouvert', 'ouverte',
  'finis', 'finit', 'finissons', 'finissez', 'finissent', 'finissais', 'fini',
  'choisis', 'choisit', 'choisissons', 'choisissez', 'choisissent', 'choisi',
])

export function isVerbLike(normalized: string, language: Language): boolean {
  if (!normalized) return false
  if (language === 'en') {
    if (EN_AUX.has(normalized) || EN_VERB_FORMS.has(normalized)) return true
    // productive patterns: -ing, -ed (length guard to avoid "red", "bed", "field"...)
    if (/ing$/.test(normalized) && normalized.length > 4) return true
    if (/ed$/.test(normalized) && normalized.length > 4 && !/^(red|bed|shed|wed)$/ .test(normalized)) return true
    return false
  }
  if (FR_VERB_FORMS.has(normalized)) return true
  // common conjugated endings (length guard)
  if (normalized.length > 4 && /(er|ir|re|ez|ent|ais|ait|aient|ons)$/.test(normalized)) return true
  return false
}

// ---------------------------------------------------------------------------
// Part-of-speech heuristics (used when no dictionary/IA answer is available)
// ---------------------------------------------------------------------------

export function guessPartOfSpeech(normalized: string, language: Language): string {
  if (!normalized) return language === 'en' ? 'word' : 'mot'
  if (isVerbLike(normalized, language)) return language === 'en' ? 'verb' : 'verbe'
  if (language === 'en') {
    if (/ly$/.test(normalized) && normalized.length > 3) return 'adverb'
    if (/(ous|ful|less|able|ible|ive|al|ic|ish)$/.test(normalized)) return 'adjective'
    if (/(tion|sion|ment|ness|ity|ism|ist|ship|hood)$/.test(normalized)) return 'noun'
    if (/(ing)$/.test(normalized)) return 'noun / verb'
    return 'noun / adjective'
  }
  if (/ment$/.test(normalized) && normalized.length > 5) return 'adverbe / nom'
  if (/(eux|euse|if|ive|able|ible|al|ale|el|elle)$/.test(normalized)) return 'adjectif'
  if (/(tion|sion|té|ure|ence|ance|isme|iste)$/.test(normalized)) return 'nom'
  return 'nom / adjectif'
}

// ---------------------------------------------------------------------------
// Syllables & intonation (rhythm view)
// ---------------------------------------------------------------------------

/** Rough syllable count for display purposes (not a dictionary). */
export function syllableCount(raw: string, language: Language): number {
  const word = raw.toLowerCase().replace(/[^a-zà-ÿ']/g, '')
  if (!word) return 0
  if (language === 'fr') {
    const withoutFinalE = word.replace(/e(s|nt)?$/, (match) => (match.includes('é') ? match : ''))
    const groups = withoutFinalE.match(/[aeiouyàâäéèêëîïôöùûü]+/g)
    return Math.max(1, groups ? groups.length : 1)
  }
  // English heuristic: vowel groups minus silent-e and common one-syllable endings
  let working = word.replace(/(?:[^laeiouy]e|ed|es)$/, '')
  working = working.replace(/^y/, '')
  const groups = working.match(/[aeiouy]+/g)
  const count = groups ? groups.length : 0
  return Math.max(1, count)
}

const EN_FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'so', 'as', 'of', 'at', 'by', 'for',
  'with', 'about', 'into', 'to', 'from', 'in', 'on', 'off', 'out', 'up', 'down', 'over', 'under',
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'do', 'does', 'did', 'has', 'have', 'had',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'there', 'here', 'not', 'no',
])

const FR_FUNCTION_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux', 'et', 'ou', 'mais', 'donc',
  'or', 'ni', 'car', 'que', 'qui', 'quoi', 'dont', 'dans', 'sur', 'sous', 'chez', 'pour', 'par',
  'avec', 'sans', 'vers', 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me',
  'te', 'se', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'ce', 'cet', 'cette',
  'ces', 'ne', 'pas', 'plus', 'tres', 'y', 'en',
])

export type IntonationPoint = {
  /** 0 = unstressed, 1 = fully stressed (content-word nucleus). */
  stress: number
  /** Whether the native melody rises on this word (questions, lists, hesitation). */
  rise: boolean
}

/**
 * Per-word intonation profile, approximating a native melody:
 * function words stay low, content words peak, the last content word of a
 * statement falls while a yes/no question rises.
 */
export function intonationProfile(words: string[], language: Language, sentenceEnd: '.' | '?' | '!' | ''): IntonationPoint[] {
  const functions = language === 'fr' ? FR_FUNCTION_WORDS : EN_FUNCTION_WORDS
  const profile = words.map((word) => {
    const normalized = word.toLowerCase().replace(/[^a-zà-ÿ'-]/g, '')
    const isFunction = functions.has(normalized)
    const syllables = syllableCount(word, language)
    const stress = isFunction ? 0.18 : Math.min(1, 0.55 + syllables * 0.12)
    return { stress, rise: false, isFunction }
  })
  // Find the last content word = intonational nucleus.
  let nucleus = -1
  for (let index = profile.length - 1; index >= 0; index -= 1) {
    if (!profile[index].isFunction) { nucleus = index; break }
  }
  if (nucleus >= 0) {
    profile[nucleus].stress = Math.min(1, profile[nucleus].stress + 0.2)
    profile[nucleus].rise = sentenceEnd === '?'
  }
  if (sentenceEnd === '?' && nucleus === -1 && profile.length > 0) profile[profile.length - 1].rise = true
  return profile.map(({ stress, rise }) => ({ stress, rise }))
}
