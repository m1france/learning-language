/**
 * Audio helpers for recorded sessions: decoding the soundtrack of a video,
 * proper resampling to 16 kHz mono (what speech models expect), WAV encoding,
 * chunking long recordings and computing waveform peaks.
 */

export const SPEECH_SAMPLE_RATE = 16000

type AudioContextCtor = typeof AudioContext

function audioContextCtor(): AudioContextCtor {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  const ctor = w.AudioContext ?? w.webkitAudioContext
  if (!ctor) throw new Error('Web Audio indisponible dans ce navigateur.')
  return ctor
}

/** Decodes the audio track of any recorded blob (webm, mp4, wav…). */
export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const Ctor = audioContextCtor()
  const context = new Ctor()
  try {
    const bytes = await blob.arrayBuffer()
    return await new Promise<AudioBuffer>((resolve, reject) => {
      // Safari still ships the callback-only signature.
      const result = context.decodeAudioData(bytes, resolve, reject) as unknown as Promise<AudioBuffer> | undefined
      result?.then?.(resolve, reject)
    })
  } finally {
    void context.close().catch(() => undefined)
  }
}

/** Downmixes and resamples with an OfflineAudioContext (band-limited, no aliasing). */
export async function toSpeechPcm(buffer: AudioBuffer, sampleRate = SPEECH_SAMPLE_RATE): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil(buffer.duration * sampleRate))
  const offline = new OfflineAudioContext(1, length, sampleRate)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start(0)
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

/** 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate = SPEECH_SAMPLE_RATE): Blob {
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)) }
  write(0, 'RIFF')
  view.setUint32(4, 36 + pcm.byteLength, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, pcm.byteLength, true)
  return new Blob([header, pcm.buffer], { type: 'audio/wav' })
}

export type AudioChunk = { start: number; end: number; wav: Blob }

/**
 * Cuts speech into chunks of at most `maxSeconds`, preferring to cut in a
 * quiet spot so words are not split in half.
 */
export function chunkSpeech(samples: Float32Array, maxSeconds: number, sampleRate = SPEECH_SAMPLE_RATE): AudioChunk[] {
  const total = samples.length
  const maxLen = Math.floor(maxSeconds * sampleRate)
  if (total <= maxLen) return [{ start: 0, end: total / sampleRate, wav: encodeWav(samples, sampleRate) }]

  const chunks: AudioChunk[] = []
  const window = Math.floor(sampleRate * 0.05)
  let from = 0
  while (from < total) {
    let to = Math.min(total, from + maxLen)
    if (to < total) {
      // Search the last 20 % of the chunk for the quietest 50 ms window.
      const searchFrom = Math.max(from + Math.floor(maxLen * 0.8), from + window)
      let best = to
      let bestEnergy = Infinity
      for (let i = searchFrom; i + window < to; i += window) {
        let energy = 0
        for (let j = i; j < i + window; j += 4) energy += samples[j] * samples[j]
        if (energy < bestEnergy) { bestEnergy = energy; best = i + Math.floor(window / 2) }
      }
      to = best
    }
    const slice = samples.subarray(from, to)
    chunks.push({ start: from / sampleRate, end: to / sampleRate, wav: encodeWav(slice, sampleRate) })
    from = to
  }
  return chunks
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Normalised peaks (0–1) for drawing a waveform with `bars` bars. */
export function computePeaks(samples: Float32Array, bars: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars))
  const peaks: number[] = []
  let max = 0
  for (let bar = 0; bar < bars; bar += 1) {
    let sum = 0
    const start = bar * size
    const end = Math.min(samples.length, start + size)
    for (let i = start; i < end; i += 8) sum += samples[i] * samples[i]
    const rms = Math.sqrt(sum / Math.max(1, (end - start) / 8))
    peaks.push(rms)
    if (rms > max) max = rms
  }
  return peaks.map((value) => (max ? Math.pow(value / max, 0.7) : 0))
}

/** Silences longer than `minSeconds` (for pause statistics). */
export function findPauses(samples: Float32Array, minSeconds = 1.2, sampleRate = SPEECH_SAMPLE_RATE): { start: number; end: number }[] {
  const frame = Math.floor(sampleRate * 0.1)
  const energies: number[] = []
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let sum = 0
    for (let j = i; j < i + frame; j += 4) sum += samples[j] * samples[j]
    energies.push(Math.sqrt(sum / (frame / 4)))
  }
  if (!energies.length) return []
  const sorted = [...energies].sort((a, b) => a - b)
  const noise = sorted[Math.floor(sorted.length * 0.15)] ?? 0
  const speech = sorted[Math.floor(sorted.length * 0.85)] ?? 0
  const threshold = noise + (speech - noise) * 0.18
  const pauses: { start: number; end: number }[] = []
  let quietFrom = -1
  energies.forEach((energy, index) => {
    if (energy < threshold) {
      if (quietFrom < 0) quietFrom = index
    } else if (quietFrom >= 0) {
      if ((index - quietFrom) * 0.1 >= minSeconds && quietFrom > 0) pauses.push({ start: quietFrom * 0.1, end: index * 0.1 })
      quietFrom = -1
    }
  })
  return pauses
}
