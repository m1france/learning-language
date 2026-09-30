export type AttachmentKind = 'text' | 'vocab' | 'writing' | 'speaking' | 'image'

/** Context the learner attaches to a message (a text, words, a writing, an image…). */
export type Attachment = {
  id: string
  kind: AttachmentKind
  label: string
  /** Plain text injected into the prompt. */
  content?: string
  /** Images only. */
  dataUrl?: string
}

export type ToolStep = {
  id: string
  name: string
  status: 'running' | 'done' | 'error'
  /** Short human summary ("12 phrases trouvées"). */
  summary?: string
}

export type ChatTurn = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  attachments?: Attachment[]
  steps?: ToolStep[]
  reasoning?: string
  model?: string
  error?: string
  /** Spoken turn from the voice mode. */
  voice?: boolean
  /** Gentle correction shown under a spoken learner turn. */
  note?: string
  /** Saved state of interactive blocks (scores, generated exercises), keyed by block index. */
  blocks?: Record<string, BlockState>
}

export type BlockState = {
  score?: number
  total?: number
  done?: boolean
  /** Payload produced after the fact (e.g. a generated exercise). */
  data?: unknown
}

export type Conversation = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  turns: ChatTurn[]
  pinned?: boolean
}

export type VoiceScenario = {
  id: string
  icon: string
  /** Instruction for the model (English). */
  brief: string
}
