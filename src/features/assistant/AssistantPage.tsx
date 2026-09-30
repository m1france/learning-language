import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Ellipsis,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  Loader2,
  Mic,
  PanelLeft,
  PenLine,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import type { AppState, CefrLevel, UiLanguage } from '../../domain'
import { normalizeWord } from '../../domain'
import { speak, speakAndWait, stopSpeaking } from '../../ai'
import { getLanguageBcp47, getLanguageInfo } from '../../languages'
import { resolveLlm, type LlmConfig } from '../../lib/llm'
import { listen, speechRecognitionSupported, type ListenHandle } from '../../lib/speech'
import { assistantCopy, type AssistantCopy } from '../../i18n/assistantCopy'
import { upsertWordDetails } from '../../store'
import { buildReviewQueue, strugglingWords } from '../srs/srsStore'
import { listSpeakingTranscripts } from '../speaking/speakingStorage'
import { buildHistory, runAgent } from './assistantAgent'
import { buildSystemPrompt, buildVoiceDebriefPrompt } from './assistantPrompt'
import { deleteConversation, listConversations, saveConversation } from './assistantStorage'
import { ASSISTANT_TOOLS, autoExamples, executeTool, TOOL_LABELS } from './assistantTools'
import type { Attachment, BlockState, ChatTurn, Conversation } from './assistantTypes'
import { BlockBoundary, SpecialBlock } from './blocks'
import { BlockEnvContext, type BlockEnv, type SaveWordInput } from './blocks/shared'
import { Markdown, parseMarkdown, type MdBlock } from './Markdown'
import { VoiceMode, type VoiceExchange } from './VoiceMode'
import './assistant.css'

type Props = {
  state: AppState
  ui: UiLanguage
  onChange: (next: AppState | ((prev: AppState) => AppState)) => void
  onAiTaskChange?: (running: boolean) => void
  onOpenSettings?: () => void
}

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const now = () => new Date().toISOString()

/** Models that answered "no tools" once in this browser session. */
const toolless = new Set<string>()

function titleFrom(text: string, fallback: string) {
  const line = text.replace(/\s+/g, ' ').trim()
  if (!line) return fallback
  return line.length > 52 ? `${line.slice(0, 50).trim()}…` : line
}

function groupLabel(iso: string, c: AssistantCopy) {
  const date = new Date(iso)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const diff = (start.getTime() - new Date(date).setHours(0, 0, 0, 0)) / 86400000
  if (diff <= 0) return c.today
  if (diff <= 1) return c.yesterday
  if (diff <= 7) return c.last7
  return c.older
}

async function imageToDataUrl(file: File, max = 1280): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
    const scale = Math.min(1, max / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ── Message ─────────────────────────────────────────────────────────────────

type MessageProps = {
  turn: ChatTurn
  streaming: boolean
  isLast: boolean
  env: Omit<BlockEnv, 'turnId' | 'getBlock' | 'setBlock' | 'openCanvas'>
  onBlock: (turnId: string, index: number, next: BlockState) => void
  onCanvas: (turnId: string, index: number) => void
  onRegenerate: () => void
  onOpenSettings?: () => void
}

const Message = memo(function Message({ turn, streaming, isLast, env, onBlock, onCanvas, onRegenerate, onOpenSettings }: MessageProps) {
  const [copied, setCopied] = useState(false)
  const [showReasoning, setShowReasoning] = useState(false)
  const c = env.c
  const blockEnv: BlockEnv = useMemo(() => ({
    ...env,
    turnId: turn.id,
    getBlock: (index) => turn.blocks?.[String(index)],
    setBlock: (index, next) => onBlock(turn.id, index, next),
    openCanvas: (index) => onCanvas(turn.id, index),
  }), [env, turn.id, turn.blocks, onBlock, onCanvas])

  const special = useCallback((block: Extract<MdBlock, { type: 'code' }>) => (
    <BlockBoundary fallback={<p className="ab-explain bad">{c.blockBroken}</p>}>
      <SpecialBlock block={block} />
    </BlockBoundary>
  ), [c.blockBroken])

  if (turn.role === 'user') {
    return (
      <div className={`as-msg user${turn.voice ? ' voice' : ''}`}>
        {turn.attachments?.length ? (
          <div className="as-attached">
            {turn.attachments.map((attachment) => attachment.kind === 'image' && attachment.dataUrl
              ? <img key={attachment.id} src={attachment.dataUrl} alt={attachment.label} />
              : <span key={attachment.id} className="as-chip">{attachmentIcon(attachment.kind)} {attachment.label}</span>)}
          </div>
        ) : null}
        {turn.content && <div className="as-bubble">{turn.voice && <Mic size={12} className="as-voice-icon" />}{turn.content}</div>}
        {turn.note && <p className="as-note">✎ {turn.note}</p>}
      </div>
    )
  }

  const thinking = streaming && !turn.content
  return (
    <div className={`as-msg assistant${turn.voice ? ' voice' : ''}`}>
      {turn.steps?.length ? (
        <ul className="as-steps">
          {turn.steps.map((step) => (
            <li key={step.id} className={step.status}>
              {step.status === 'running' ? <Loader2 size={12} className="as-spin" /> : step.status === 'done' ? <Check size={12} /> : <X size={12} />}
              <span>{(TOOL_LABELS[step.name]?.[env.ui === 'fr' ? 'fr' : 'en']) ?? step.name}</span>
              {step.summary && <small>· {step.summary}</small>}
            </li>
          ))}
        </ul>
      ) : null}
      {thinking && (
        <div className="as-thinking"><span className="as-dots"><i /><i /><i /></span> {c.thinking}</div>
      )}
      {turn.reasoning && !turn.voice && (
        <div className="as-reasoning">
          <button type="button" onClick={() => setShowReasoning(!showReasoning)}>
            <Sparkles size={12} /> {showReasoning ? c.hideReasoning : c.showReasoning} <ChevronDown size={12} className={showReasoning ? 'open' : ''} />
          </button>
          {showReasoning && <p>{turn.reasoning}</p>}
        </div>
      )}
      {turn.content && (
        <BlockEnvContext.Provider value={blockEnv}>
          {turn.voice
            ? <p className="as-voice-line"><Volume2 size={13} /> {turn.content}</p>
            : <Markdown text={turn.content} onSpeak={env.speak} special={special} className={streaming ? 'streaming' : ''} />}
        </BlockEnvContext.Provider>
      )}
      {turn.error && (
        <div className="as-error">
          <p>{turn.error}</p>
          {onOpenSettings && /clé|key|settings|paramètres/i.test(turn.error) && <button type="button" onClick={onOpenSettings}>{c.openSettings}</button>}
          {isLast && <button type="button" onClick={onRegenerate}><RotateCcw size={12} /> {c.retry}</button>}
        </div>
      )}
      {!streaming && turn.content && !turn.voice && (
        <div className="as-actions">
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(turn.content).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) }) }} title={c.copy} aria-label={c.copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {isLast && <button type="button" onClick={onRegenerate} title={c.regenerate} aria-label={c.regenerate}><RotateCcw size={14} /></button>}
          {turn.model && <span className="as-model">{turn.model.split('/').pop()}</span>}
        </div>
      )}
    </div>
  )
})

function attachmentIcon(kind: Attachment['kind']) {
  switch (kind) {
    case 'text': return <BookOpen size={12} />
    case 'vocab': return <Layers size={12} />
    case 'writing': return <PenLine size={12} />
    case 'speaking': return <Mic size={12} />
    case 'image': return <ImageIcon size={12} />
  }
}

// ── Page ────────────────────────────────────────────────────────────────────

export function AssistantPage({ state, ui, onChange, onAiTaskChange, onOpenSettings }: Props) {
  const c = assistantCopy(ui)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [busyTurn, setBusyTurn] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 1180)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<null | 'attach' | 'text' | 'writing' | 'speaking' | 'level'>(null)
  const [speakingList, setSpeakingList] = useState<Awaited<ReturnType<typeof listSpeakingTranscripts>>>([])
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [offerDebrief, setOfferDebrief] = useState(false)
  const [canvas, setCanvas] = useState<{ turnId: string; index: number } | null>(null)
  const [dictating, setDictating] = useState<null | 'ui' | 'target'>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [rowMenu, setRowMenu] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)

  const stateRef = useRef(state)
  stateRef.current = state
  // Source of truth for async work (agent loop, voice mode): updated synchronously.
  const conversationsRef = useRef<Conversation[]>([])
  const commit = useCallback((next: Conversation[]) => {
    conversationsRef.current = next
    setConversations(next)
  }, [])
  const abortRef = useRef<AbortController | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dictationRef = useRef<ListenHandle | null>(null)
  const dictationBase = useRef('')
  const saveTimers = useRef(new Map<string, number>())

  const level: CefrLevel = state.settings.assistantLevel ?? 'B1'
  const lang = state.settings.learningLanguage
  const langInfo = getLanguageInfo(lang)
  const api = state.settings.api
  const cfg: LlmConfig | null = useMemo(() => resolveLlm(api, api.taskModelAssistant || api.taskModelExerciseBuilder), [api])
  const active = conversations.find((conversation) => conversation.id === activeId) ?? null
  const turns = active?.turns ?? []

  useEffect(() => { void listConversations().then(commit) }, [commit])
  useEffect(() => () => { abortRef.current?.abort(); dictationRef.current?.abort(); stopSpeaking() }, [])

  // ── Persistence helpers ──────────────────────────────────────────────────
  const persist = useCallback((id: string, delay = 400) => {
    const timers = saveTimers.current
    window.clearTimeout(timers.get(id))
    timers.set(id, window.setTimeout(() => {
      const conversation = conversationsRef.current.find((item) => item.id === id)
      if (conversation) void saveConversation(conversation)
    }, delay))
  }, [])

  const mutate = useCallback((id: string, update: (conversation: Conversation) => Conversation, save = true) => {
    commit(conversationsRef.current.map((conversation) => (conversation.id === id ? update(conversation) : conversation)))
    if (save) persist(id)
  }, [persist, commit])

  const patchTurn = useCallback((conversationId: string, turnId: string, patch: Partial<ChatTurn> | ((turn: ChatTurn) => Partial<ChatTurn>), save = false) => {
    mutate(conversationId, (conversation) => ({
      ...conversation,
      turns: conversation.turns.map((turn) => (turn.id === turnId ? { ...turn, ...(typeof patch === 'function' ? patch(turn) : patch) } : turn)),
    }), save)
  }, [mutate])

  // ── Scrolling ────────────────────────────────────────────────────────────
  const scrollToBottom = (smooth = true) => {
    const el = threadRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }
  useEffect(() => { if (atBottom && turns.length) scrollToBottom(false) }, [turns, atBottom])
  useEffect(() => {
    setAtBottom(true)
    window.setTimeout(() => (activeId ? scrollToBottom(false) : threadRef.current?.scrollTo({ top: 0 })), 0)
  }, [activeId])

  // ── Words ────────────────────────────────────────────────────────────────
  const known = useMemo(() => new Set(state.words.filter((word) => word.language === lang).map((word) => word.normalized)), [state.words, lang])
  const hasWord = useCallback((word: string) => known.has(normalizeWord(word)), [known])
  const saveWord = useCallback((input: SaveWordInput) => {
    onChange((prev) => upsertWordDetails(prev, {
      raw: input.word,
      sentence: input.example,
      language: prev.settings.learningLanguage,
      translation: input.translation,
      pronunciation: input.ipa,
      partOfSpeech: input.pos,
      tags: ['assistant'],
    }))
    setToast(c.savedToDeck(input.word))
    window.setTimeout(() => setToast(null), 1800)
  }, [onChange, c])

  const speakTarget = useCallback((text: string) => { void speak(text, lang, api) }, [lang, api])
  const speakTargetAndWait = useCallback(async (text: string) => { await speakAndWait(text, lang, api) }, [lang, api])

  const env = useMemo(() => ({
    ui, c, level, api, state,
    speak: speakTarget,
    speakAndWait: speakTargetAndWait,
    hasWord,
    saveWord,
  }), [ui, c, level, api, state, speakTarget, speakTargetAndWait, hasWord, saveWord])

  const onBlock = useCallback((turnId: string, index: number, next: BlockState) => {
    const conversation = conversationsRef.current.find((item) => item.turns.some((turn) => turn.id === turnId))
    if (!conversation) return
    patchTurn(conversation.id, turnId, (turn) => ({ blocks: { ...(turn.blocks ?? {}), [String(index)]: next } }), true)
  }, [patchTurn])

  const onCanvas = useCallback((turnId: string, index: number) => setCanvas({ turnId, index }), [])

  // ── Sending ──────────────────────────────────────────────────────────────
  const ensureConversation = (firstText: string): string => {
    if (active) return active.id
    const conversation: Conversation = { id: newId('conv'), title: titleFrom(firstText, c.untitled), createdAt: now(), updatedAt: now(), turns: [] }
    commit([conversation, ...conversationsRef.current])
    setActiveId(conversation.id)
    return conversation.id
  }

  const runTurn = async (conversationId: string, extraSystem?: string) => {
    const conversation = conversationsRef.current.find((item) => item.id === conversationId)
    if (!conversation) return
    const assistantTurn: ChatTurn = { id: newId('t'), role: 'assistant', content: '', createdAt: now(), steps: [] }
    mutate(conversationId, (item) => ({ ...item, updatedAt: now(), turns: [...item.turns, assistantTurn] }), false)
    setBusyTurn(assistantTurn.id)
    setAtBottom(true)

    if (!cfg) {
      patchTurn(conversationId, assistantTurn.id, { error: c.errorNoKey }, true)
      setBusyTurn(null)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    onAiTaskChange?.(true)
    const toolsOk = !toolless.has(cfg.model)
    const lastUser = [...conversation.turns].reverse().find((turn) => turn.role === 'user')
    const examples = !toolsOk && lastUser ? autoExamples(stateRef.current, lastUser.content) : []
    const system = [
      buildSystemPrompt(stateRef.current, { level, ui, toolsAvailable: toolsOk }),
      examples.length ? `\n# Sentences from the learner's texts that may be relevant\n${examples.map((example) => `- "${example.text}" (from "${example.title}")`).join('\n')}` : '',
      extraSystem ? `\n# For this answer\n${extraSystem}` : '',
    ].join('')

    let frame = 0
    let pending: Partial<ChatTurn> = {}
    const flush = () => { frame = 0; const patch = pending; pending = {}; patchTurn(conversationId, assistantTurn.id, patch) }
    const queue = (patch: Partial<ChatTurn>) => { pending = { ...pending, ...patch }; if (!frame) frame = requestAnimationFrame(flush) }

    try {
      const result = await runAgent({
        cfg,
        system,
        messages: buildHistory(conversation.turns),
        tools: toolsOk ? ASSISTANT_TOOLS : undefined,
        executeTool: (name, args) => executeTool(stateRef.current, name, args, ui === 'fr' ? 'fr' : 'en'),
        signal: controller.signal,
        callbacks: {
          onText: (full) => queue({ content: full }),
          onReasoning: (full) => queue({ reasoning: full }),
          onToolStart: (id, name) => patchTurn(conversationId, assistantTurn.id, (turn) => ({ steps: [...(turn.steps ?? []), { id, name, status: 'running' }] })),
          onToolEnd: (id, _name, summary, ok) => patchTurn(conversationId, assistantTurn.id, (turn) => ({ steps: (turn.steps ?? []).map((step) => (step.id === id ? { ...step, status: ok ? 'done' : 'error', summary } : step)) })),
        },
      })
      if (!result.toolsSupported && toolsOk) toolless.add(cfg.model)
      cancelAnimationFrame(frame)
      patchTurn(conversationId, assistantTurn.id, { ...pending, content: result.content, reasoning: result.reasoning || undefined, model: result.model }, true)
    } catch (error) {
      cancelAnimationFrame(frame)
      const aborted = (error as Error)?.name === 'AbortError'
      patchTurn(conversationId, assistantTurn.id, (turn) => ({ ...pending, error: aborted ? undefined : error instanceof Error ? error.message : String(error), content: turn.content || pending.content || '' }), true)
    } finally {
      abortRef.current = null
      setBusyTurn(null)
      onAiTaskChange?.(false)
      mutate(conversationId, (item) => ({ ...item, updatedAt: now() }))
    }
  }

  const send = async (textArg?: string, options: { extraSystem?: string } = {}) => {
    const text = (textArg ?? draft).trim()
    if ((!text && !attachments.length) || busyTurn) return
    stopDictation()
    setOfferDebrief(false)
    const conversationId = ensureConversation(text || attachments[0]?.label || '')
    const userTurn: ChatTurn = { id: newId('t'), role: 'user', content: text, createdAt: now(), attachments: attachments.length ? attachments : undefined }
    mutate(conversationId, (item) => ({ ...item, updatedAt: now(), turns: [...item.turns, userTurn] }), false)
    setDraft('')
    setAttachments([])
    await runTurn(conversationId, options.extraSystem)
  }

  const regenerate = () => {
    if (!active || busyTurn) return
    const lastAssistant = [...active.turns].reverse().find((turn) => turn.role === 'assistant')
    if (!lastAssistant) return
    mutate(active.id, (item) => ({ ...item, turns: item.turns.filter((turn) => turn.id !== lastAssistant.id) }), false)
    window.setTimeout(() => void runTurn(active.id), 0)
  }

  const stop = () => abortRef.current?.abort()

  // ── Dictation ────────────────────────────────────────────────────────────
  function stopDictation() {
    dictationRef.current?.stop()
    dictationRef.current = null
    setDictating(null)
  }

  const startDictation = (which: 'ui' | 'target') => {
    stopDictation()
    dictationBase.current = draft ? `${draft.trimEnd()} ` : ''
    const handle = listen({
      lang: which === 'target' ? getLanguageBcp47(lang) : getLanguageBcp47(ui),
      continuous: true,
      onInterim: (text) => setDraft(dictationBase.current + text),
      onFinal: (text) => setDraft(dictationBase.current + text),
      onEnd: () => setDictating(null),
      onError: (message) => { setToast(message); window.setTimeout(() => setToast(null), 2500) },
    })
    if (handle) { dictationRef.current = handle; setDictating(which) }
  }

  // ── Attachments ──────────────────────────────────────────────────────────
  const addAttachment = (attachment: Attachment) => {
    setAttachments((prev) => [...prev.filter((item) => item.label !== attachment.label || item.kind !== attachment.kind), attachment])
    setMenu(null)
    inputRef.current?.focus()
  }

  const attachWords = (kind: 'struggling' | 'recent') => {
    const words = state.words.filter((word) => word.language === lang)
    const list = kind === 'struggling'
      ? (strugglingWords(state, 25).length ? strugglingWords(state, 25) : words.filter((word) => (word.knowledge ?? 1) <= 2).slice(-25))
      : [...words].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25)
    if (!list.length) { setToast(c.noItems); window.setTimeout(() => setToast(null), 1600); setMenu(null); return }
    addAttachment({
      id: newId('att'),
      kind: 'vocab',
      label: `${kind === 'struggling' ? c.attachStruggling : c.attachRecent} (${list.length})`,
      content: list.map((word) => `${word.word} — ${word.translation || word.definitions?.[0]?.translation || '?'}${word.contextSentence ? ` | "${word.contextSentence.slice(0, 120)}"` : ''}`).join('\n'),
    })
  }

  const openMenu = (next: typeof menu) => {
    setMenu(menu === next ? null : next)
    if (next === 'speaking') void listSpeakingTranscripts(12).then(setSpeakingList)
  }

  // ── Voice ────────────────────────────────────────────────────────────────
  const voiceConversationId = useRef<string | null>(null)
  const openVoice = () => {
    if (!cfg) { setToast(c.errorNoKey); window.setTimeout(() => setToast(null), 2500); return }
    voiceConversationId.current = active?.id ?? null
    setVoiceOpen(true)
  }

  const onVoiceExchange = (exchange: VoiceExchange) => {
    let id = voiceConversationId.current
    if (!id) {
      const conversation: Conversation = { id: newId('conv'), title: `🎙 ${c.voiceTitle}`, createdAt: now(), updatedAt: now(), turns: [] }
      commit([conversation, ...conversationsRef.current])
      setActiveId(conversation.id)
      voiceConversationId.current = conversation.id
      id = conversation.id
    }
    const added: ChatTurn[] = []
    if (exchange.user) added.push({ id: newId('t'), role: 'user', content: exchange.user, createdAt: now(), voice: true, note: exchange.fix })
    if (exchange.assistant) added.push({ id: newId('t'), role: 'assistant', content: exchange.assistant, createdAt: now(), voice: true })
    mutate(id, (item) => ({ ...item, updatedAt: now(), turns: [...item.turns, ...added] }))
  }

  // ── History list ─────────────────────────────────────────────────────────
  const filtered = conversations.filter((conversation) => !query || conversation.title.toLowerCase().includes(query.toLowerCase()) || conversation.turns.some((turn) => turn.content.toLowerCase().includes(query.toLowerCase())))
  const groups = useMemo(() => {
    const out: { label: string; items: Conversation[] }[] = []
    const pinned = filtered.filter((conversation) => conversation.pinned)
    if (pinned.length) out.push({ label: c.pinned, items: pinned })
    for (const conversation of filtered.filter((item) => !item.pinned)) {
      const label = groupLabel(conversation.updatedAt, c)
      const group = out.find((item) => item.label === label)
      if (group) group.items.push(conversation)
      else out.push({ label, items: [conversation] })
    }
    return out
  }, [filtered, c])

  const newChat = () => {
    stop()
    setActiveId(null)
    setDraft('')
    setAttachments([])
    setOfferDebrief(false)
    if (window.innerWidth <= 900) setHistoryOpen(false)
    window.setTimeout(() => inputRef.current?.focus(), 30)
  }

  const removeConversation = (id: string) => {
    if (!window.confirm(c.confirmDelete)) return
    commit(conversationsRef.current.filter((item) => item.id !== id))
    void deleteConversation(id)
    if (activeId === id) setActiveId(null)
  }

  // ── Composer sizing & shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`
  }, [draft])

  useEffect(() => {
    if (!menu) return
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('.as-pop, .as-pop-trigger')) setMenu(null) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  useEffect(() => {
    if (!rowMenu) return
    const close = () => setRowMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [rowMenu])

  const useStarter = (prompt: string) => {
    setDraft(prompt)
    window.setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(prompt.length, prompt.length)
    }, 20)
  }

  // ── Suggestions built from the learner's data ──────────────────────────
  const suggestions = useMemo(() => {
    const out: { label: string; prompt: string; icon: React.ReactNode }[] = []
    const struggling = strugglingWords(state, 25).length || state.words.filter((word) => word.language === lang && (word.knowledge ?? 1) <= 2).length
    if (struggling) out.push({ label: c.strugglingSuggestion(Math.min(25, struggling)), prompt: c.strugglingPrompt, icon: <Layers size={14} /> })
    const due = buildReviewQueue(state).ids.length
    if (due) out.push({ label: c.dueSuggestion(due), prompt: c.duePrompt, icon: <GraduationCap size={14} /> })
    const recentText = [...state.resources].filter((resource) => !resource.archived && resource.language === lang)
      .sort((a, b) => (state.progress[b.id]?.updatedAt ?? b.createdAt).localeCompare(state.progress[a.id]?.updatedAt ?? a.createdAt))[0]
    if (recentText) out.push({ label: c.textSuggestion(recentText.title), prompt: c.textPrompt(recentText.title), icon: <BookOpen size={14} /> })
    return out
  }, [state, lang, c])

  const canvasBlock = useMemo(() => {
    if (!canvas) return null
    const turn = conversations.flatMap((conversation) => conversation.turns).find((item) => item.id === canvas.turnId)
    if (!turn) return null
    const find = (blocks: MdBlock[]): Extract<MdBlock, { type: 'code' }> | null => {
      for (const block of blocks) {
        if (block.type === 'code' && block.special === canvas.index) return block
        if (block.type === 'quote') { const found = find(block.children); if (found) return found }
        if (block.type === 'list') for (const item of block.items) { const found = find(item.children); if (found) return found }
      }
      return null
    }
    const block = find(parseMarkdown(turn.content))
    return block ? { turn, block } : null
  }, [canvas, conversations])

  const empty = turns.length === 0
  const levelLabel = `${level} · ${c.levelNames[level]}`

  return (
    <div className={`as-page${historyOpen ? ' with-history' : ''}`}>
      <aside className={`as-history${historyOpen ? ' open' : ''}`} aria-label={c.history}>
        <div className="as-history-head">
          <button type="button" className="as-new" onClick={newChat}><SquarePen size={15} /> {c.newChat}</button>
          <button type="button" className="as-icon" onClick={() => setHistoryOpen(false)} aria-label={c.close}><ChevronLeft size={16} /></button>
        </div>
        <label className="as-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.searchHistory} /></label>
        <nav className="as-history-list">
          {!conversations.length && <p className="as-muted">{c.emptyHistory}</p>}
          {groups.map((group) => (
            <div key={group.label} className="as-group">
              <span className="as-group-label">{group.label}</span>
              {group.items.map((conversation) => (
                <div key={conversation.id} className={`as-row${conversation.id === activeId ? ' on' : ''}`}>
                  {renaming?.id === conversation.id ? (
                    <input autoFocus className="as-rename" value={renaming.title}
                      onChange={(event) => setRenaming({ ...renaming, title: event.target.value })}
                      onBlur={() => { mutate(conversation.id, (item) => ({ ...item, title: renaming.title.trim() || item.title })); setRenaming(null) }}
                      onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); if (event.key === 'Escape') setRenaming(null) }} />
                  ) : (
                    <button type="button" className="as-row-main" onClick={() => { setActiveId(conversation.id); if (window.innerWidth <= 900) setHistoryOpen(false) }}>
                      {conversation.pinned && <Pin size={11} />}
                      <span>{conversation.title}</span>
                    </button>
                  )}
                  <button type="button" className="as-row-more" onClick={(event) => { event.stopPropagation(); setRowMenu(rowMenu === conversation.id ? null : conversation.id) }} aria-label="…"><Ellipsis size={14} /></button>
                  {rowMenu === conversation.id && (
                    <div className="as-row-menu" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => { mutate(conversation.id, (item) => ({ ...item, pinned: !item.pinned })); setRowMenu(null) }}><Pin size={13} /> {conversation.pinned ? c.unpin : c.pin}</button>
                      <button type="button" onClick={() => { setRenaming({ id: conversation.id, title: conversation.title }); setRowMenu(null) }}><PenLine size={13} /> {c.rename}</button>
                      <button type="button" className="danger" onClick={() => { setRowMenu(null); removeConversation(conversation.id) }}><Trash2 size={13} /> {c.delete}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {historyOpen && <div className="as-scrim" onClick={() => setHistoryOpen(false)} />}

      <main className="as-main">
        <header className="as-top">
          {!historyOpen && <button type="button" className="as-icon" onClick={() => setHistoryOpen(true)} aria-label={c.history} title={c.history}><PanelLeft size={17} /></button>}
          <h1>{active ? active.title : c.navLabel}</h1>
          <span className="as-top-spacer" />
          {!historyOpen && active && <button type="button" className="as-icon" onClick={newChat} aria-label={c.newChat} title={c.newChat}><SquarePen size={16} /></button>}
        </header>

        <div className="as-thread" ref={threadRef} onScroll={(event) => {
          const el = event.currentTarget
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
        }}>
          {empty ? (
            <div className="as-empty">
              <div className="as-hello">
                <span className="as-mark" aria-hidden>{langInfo.flag}</span>
                <h2>{c.greeting(state.settings.name)}</h2>
                <p>{c.subtitle}</p>
              </div>
              <div className="as-starters">
                {c.starters.map((starter) => (
                  <button key={starter.id} type="button" onClick={() => useStarter(starter.prompt)}>
                    <b>{starter.title}</b>
                    <span>{starter.hint}</span>
                  </button>
                ))}
                <button type="button" className="as-starter-voice" onClick={openVoice}>
                  <b><AudioLines size={15} /> {c.voiceMode}</b>
                  <span>{c.voiceIntro}</span>
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className="as-suggest">
                  <span className="as-group-label">{c.forYou}</span>
                  <div>
                    {suggestions.map((item) => (
                      <button key={item.label} type="button" onClick={() => void send(item.prompt)}>{item.icon} {item.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="as-messages">
              {turns.map((turn, index) => (
                <Message key={turn.id} turn={turn} streaming={busyTurn === turn.id} isLast={index === turns.length - 1}
                  env={env} onBlock={onBlock} onCanvas={onCanvas} onRegenerate={regenerate} onOpenSettings={onOpenSettings} />
              ))}
              {(offerDebrief || turns[turns.length - 1]?.voice) && !busyTurn && !voiceOpen && (
                <div className="as-offer">
                  <button type="button" onClick={() => { setOfferDebrief(false); void send(c.debriefPrompt, { extraSystem: buildVoiceDebriefPrompt(ui) }) }}>
                    <Sparkles size={14} /> {c.debrief}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {!atBottom && !empty && (
          <button type="button" className="as-jump" onClick={() => { setAtBottom(true); scrollToBottom() }} aria-label="↓"><ArrowDown size={16} /></button>
        )}

        <div className="as-composer-wrap">
          <div className="as-composer">
            {attachments.length > 0 && (
              <div className="as-attachments">
                {attachments.map((attachment) => (
                  <span key={attachment.id} className="as-chip">
                    {attachment.kind === 'image' && attachment.dataUrl ? <img src={attachment.dataUrl} alt="" /> : attachmentIcon(attachment.kind)}
                    {attachment.label}
                    <button type="button" onClick={() => setAttachments(attachments.filter((item) => item.id !== attachment.id))} aria-label={c.delete}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              placeholder={dictating ? c.placeholderVoice : c.placeholder}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() }
                if (event.key === 'Escape' && busyTurn) stop()
              }}
              onPaste={(event) => {
                const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith('image/'))
                if (file) { event.preventDefault(); void imageToDataUrl(file).then((dataUrl) => addAttachment({ id: newId('att'), kind: 'image', label: file.name || 'image', dataUrl })) }
              }}
              aria-label={c.placeholder}
            />
            <div className="as-tools">
              <div className="as-tools-left">
                <button type="button" className="as-tool as-pop-trigger" onClick={() => openMenu('attach')} aria-label={c.attach} title={c.attach}><Plus size={17} /></button>
                <button type="button" className="as-tool as-level as-pop-trigger" onClick={() => openMenu('level')} title={c.level}>
                  {levelLabel} <ChevronDown size={12} />
                </button>
                {cfg && <span className="as-model-chip" title={cfg.model}>{cfg.model.split('/').pop()?.replace(':free', '')}</span>}
              </div>
              <div className="as-tools-right">
                {speechRecognitionSupported() && (
                  dictating
                    ? <>
                      <button type="button" className="as-tool as-lang" onClick={() => startDictation(dictating === 'ui' ? 'target' : 'ui')} title={c.dictate}>
                        {dictating === 'ui' ? ui.toUpperCase() : lang.toUpperCase()}
                      </button>
                      <button type="button" className="as-tool on" onClick={stopDictation} aria-label={c.dictateStop} title={c.dictateStop}><Square size={13} fill="currentColor" /></button>
                    </>
                    : <button type="button" className="as-tool" onClick={() => startDictation('ui')} aria-label={c.dictate} title={c.dictate}><Mic size={17} /></button>
                )}
                <button type="button" className="as-tool" onClick={openVoice} aria-label={c.voiceMode} title={c.voiceMode}><AudioLines size={17} /></button>
                {busyTurn
                  ? <button type="button" className="as-send stop" onClick={stop} aria-label={c.stop} title={c.stop}><Square size={13} fill="currentColor" /></button>
                  : <button type="button" className="as-send" onClick={() => void send()} disabled={!draft.trim() && !attachments.length} aria-label={c.send} title={c.send}><ArrowUp size={17} /></button>}
              </div>
            </div>

            {menu === 'level' && (
              <div className="as-pop level">
                {LEVELS.map((item) => (
                  <button key={item} type="button" className={item === level ? 'on' : ''}
                    onClick={() => { onChange((prev) => ({ ...prev, settings: { ...prev.settings, assistantLevel: item } })); setMenu(null) }}>
                    <b>{item}</b> {c.levelNames[item]} {item === level && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
            {menu === 'attach' && (
              <div className="as-pop">
                <button type="button" onClick={() => setMenu('text')}><BookOpen size={14} /> {c.attachText}</button>
                <button type="button" onClick={() => attachWords('struggling')}><Layers size={14} /> {c.attachStruggling}</button>
                <button type="button" onClick={() => attachWords('recent')}><Sparkles size={14} /> {c.attachRecent}</button>
                <button type="button" onClick={() => setMenu('writing')}><PenLine size={14} /> {c.attachWriting}</button>
                <button type="button" onClick={() => openMenu('speaking')}><Mic size={14} /> {c.attachSpeaking}</button>
                <button type="button" onClick={() => { setMenu(null); fileRef.current?.click() }}><ImageIcon size={14} /> {c.attachImage}</button>
              </div>
            )}
            {menu === 'text' && (
              <div className="as-pop list">
                <button type="button" className="as-pop-back" onClick={() => setMenu('attach')}><ChevronLeft size={14} /> {c.back}</button>
                {state.resources.filter((resource) => !resource.archived).length === 0 && <p className="as-muted">{c.noItems}</p>}
                {state.resources.filter((resource) => !resource.archived).map((resource) => (
                  <button key={resource.id} type="button" onClick={() => addAttachment({
                    id: newId('att'), kind: 'text', label: resource.title,
                    content: resource.chapters.flatMap((chapter) => chapter.paragraphs).join('\n\n').slice(0, 12000),
                  })}><FileText size={14} /> <span>{resource.title}</span></button>
                ))}
              </div>
            )}
            {menu === 'writing' && (
              <div className="as-pop list">
                <button type="button" className="as-pop-back" onClick={() => setMenu('attach')}><ChevronLeft size={14} /> {c.back}</button>
                {state.writings.length === 0 && <p className="as-muted">{c.noItems}</p>}
                {[...state.writings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20).map((entry) => (
                  <button key={entry.id} type="button" onClick={() => addAttachment({ id: newId('att'), kind: 'writing', label: entry.title || entry.date, content: entry.content.slice(0, 8000) })}>
                    <PenLine size={14} /> <span>{entry.title || entry.date}</span>
                  </button>
                ))}
              </div>
            )}
            {menu === 'speaking' && (
              <div className="as-pop list">
                <button type="button" className="as-pop-back" onClick={() => setMenu('attach')}><ChevronLeft size={14} /> {c.back}</button>
                {speakingList.length === 0 && <p className="as-muted">{c.noItems}</p>}
                {speakingList.map((session) => (
                  <button key={session.id} type="button" onClick={() => addAttachment({ id: newId('att'), kind: 'speaking', label: session.title, content: `Transcript:\n${session.text}\n\nLearner notes:\n${session.notes}`.slice(0, 8000) })}>
                    <Mic size={14} /> <span>{session.title}</span>
                  </button>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void imageToDataUrl(file).then((dataUrl) => addAttachment({ id: newId('att'), kind: 'image', label: file.name, dataUrl }))
            }} />
          </div>
        </div>
      </main>

      {voiceOpen && cfg && (
        <VoiceMode state={state} ui={ui} level={level} cfg={cfg} c={c}
          history={active ? buildHistory(active.turns) : []}
          onExchange={onVoiceExchange}
          onClose={(had) => { setVoiceOpen(false); if (had) setOfferDebrief(true) }} />
      )}

      {canvasBlock && (
        <div className="as-canvas" role="dialog" aria-modal="true">
          <div className="as-canvas-bar">
            <span>{c.blockKinds[canvasBlock.block.lang as keyof AssistantCopy['blockKinds']] ?? canvasBlock.block.lang}</span>
            <button type="button" className="as-icon" onClick={() => setCanvas(null)} aria-label={c.close}><X size={18} /></button>
          </div>
          <div className="as-canvas-body">
            <BlockEnvContext.Provider value={{
              ...env,
              turnId: canvasBlock.turn.id,
              inCanvas: true,
              getBlock: (index) => canvasBlock.turn.blocks?.[String(index)],
              setBlock: (index, next) => onBlock(canvasBlock.turn.id, index, next),
              openCanvas: () => undefined,
            }}>
              <BlockBoundary fallback={<p className="ab-explain bad">{c.blockBroken}</p>}>
                <SpecialBlock block={canvasBlock.block} />
              </BlockBoundary>
            </BlockEnvContext.Provider>
          </div>
        </div>
      )}

      {toast && <div className="as-toast" role="status">{toast}</div>}
    </div>
  )
}
