import { getStorageScope, appStorage } from '../auth/storageScope'
import type { UserSettings } from '../../domain'
import type { PageAnnotations } from '../LearningFocus'
import type { ExportedLesson, ExportedLessonParagraph, StudentComment } from './teacherExportDomain'

const STORAGE_KEY_LIST = 'vivre_exported_lessons'
const STORAGE_KEY_PREFIX = 'vivre_shared_lesson_'

function getApiBaseUrl(): string {
  // Same origin in production; Vite forwards /api during development.
  return ''
}

/** Nettoie et normalise le nom d'utilisateur pour les URLs (minuscules, sans accents, caractères alphanumériques et tirets). */
export function normalizeTeacherUsername(raw: string): string {
  if (!raw) return ''
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function getTeacherUsername(settings?: Partial<UserSettings>): string {
  if (settings?.teacherUsername) {
    return normalizeTeacherUsername(settings.teacherUsername)
  }
  if (settings?.name) {
    return normalizeTeacherUsername(settings.name)
  }
  return ''
}

export function generateLessonId(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let res = ''
  for (let i = 0; i < 8; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return res
}

/**
 * Vérifie si la page courante contient au moins une modification :
 * - Tracé de stylo, surlignage, forme géométrique ou flèche
 * - Liaison entre lettres
 * - Note textuelle
 * - Lettre grisée
 * - Modification du texte d'origine (outil Édition / dictée en direct)
 */
export function hasPageModifications(
  page: { key: string; text: string }[],
  current: PageAnnotations,
  originals: Record<string, string>,
  legacyEdited: string[] = [],
): boolean {
  if (current.strokes.length > 0) return true
  if (current.liaisons.length > 0) return true
  if (current.texts.length > 0) return true
  if (current.grayed.length > 0) return true

  for (const paragraph of page) {
    const original = originals[paragraph.key]
    if (original !== undefined && original !== paragraph.text) {
      return true
    }
    if (legacyEdited.includes(paragraph.key)) {
      return true
    }
  }

  return false
}

export function getAllExportedLessons(): ExportedLesson[] {
  try {
    const raw = appStorage.getItem(STORAGE_KEY_LIST)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('Erreur lecture leçons exportées:', err)
    return []
  }
}

export function getExportedLesson(id: string): ExportedLesson | null {
  try {
    const direct = appStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`)
    if (direct) {
      return JSON.parse(direct) as ExportedLesson
    }
    const all = getAllExportedLessons()
    return all.find((item) => item.id === id) ?? null
  } catch (err) {
    console.error('Erreur récupération leçon partagée locale:', err)
    return null
  }
}

/** Récupère une leçon depuis le serveur (ou le stockage local en fallback) */
export async function fetchSharedLesson(id: string): Promise<ExportedLesson | null> {
  const scope = getStorageScope()
  // 1. Tenter depuis le cache local
  const local = getExportedLesson(id)
  if (local) return local

  // 2. Requête API serveur
  try {
    const apiBase = getApiBaseUrl()
    const response = await fetch(`${apiBase}/api/share/lessons/${encodeURIComponent(id)}`)
    if (response.ok) {
      const data = await response.json()
      if (data.lesson) {
        // Mettre en cache localement
        if (getStorageScope() === scope) appStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, JSON.stringify(data.lesson))
        return data.lesson as ExportedLesson
      }
    }
  } catch (err) {
    console.warn('Impossible de joindre le serveur de partage:', err)
  }

  return null
}

function cacheExportedLesson(lesson: ExportedLesson): void {
  appStorage.setItem(`${STORAGE_KEY_PREFIX}${lesson.id}`, JSON.stringify(lesson))
  const all = getAllExportedLessons().filter((item) => item.id !== lesson.id)
  all.unshift(lesson)
  appStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(all))
}

async function publishRequest(path: string, method: string, body?: unknown): Promise<void> {
  const account = getStorageScope()
  if (account === 'guest') throw new Error('Connectez-vous pour publier ou retirer une leçon.')
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Account-ID': account },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.error || 'La publication a échoué. Votre travail est conservé dans cet aperçu.')
  }
  if (getStorageScope() !== account) throw new Error('Le compte a changé. Rechargez la page pour retrouver votre espace.')
}

export async function saveExportedLesson(lesson: ExportedLesson): Promise<void> {
  const scope = getStorageScope()
  await publishRequest('/api/share/lessons', 'POST', { lesson })
  if (getStorageScope() !== scope) throw new Error('Le compte a changé. Rechargez la page.')
  cacheExportedLesson(lesson)
}

export async function deleteExportedLesson(id: string): Promise<void> {
  const scope = getStorageScope()
  await publishRequest(`/api/share/lessons/${encodeURIComponent(id)}`, 'DELETE')
  if (getStorageScope() !== scope) throw new Error('Le compte a changé. Rechargez la page.')
  appStorage.removeItem(`${STORAGE_KEY_PREFIX}${id}`)
  appStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(getAllExportedLessons().filter((item) => item.id !== id)))
}

export function addLessonReaction(lessonId: string, emoji: string): Record<string, number> {
  const lesson = getExportedLesson(lessonId)
  const reactions = { ...(lesson?.reactions || {}) }
  reactions[emoji] = (reactions[emoji] || 0) + 1

  if (lesson) {
    const updated: ExportedLesson = {
      ...lesson,
      reactions,
      updatedAt: new Date().toISOString(),
    }
    cacheExportedLesson(updated)
  }

  // Notifier l'API
  const apiBase = getApiBaseUrl()
  fetch(`${apiBase}/api/share/lessons/${encodeURIComponent(lessonId)}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Account-ID': getStorageScope() },
    body: JSON.stringify({ emoji }),
  }).catch(() => {})

  return reactions
}

export function addLessonComment(lessonId: string, authorName: string, text: string): StudentComment | null {
  const lesson = getExportedLesson(lessonId)
  const comment: StudentComment = {
    id: `comm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    authorName: authorName.trim() || 'Élève',
    text: text.trim(),
    createdAt: new Date().toISOString(),
  }

  if (lesson) {
    const comments = [...(lesson.studentComments || []), comment]
    const updated: ExportedLesson = {
      ...lesson,
      studentComments: comments,
      updatedAt: new Date().toISOString(),
    }
    cacheExportedLesson(updated)
  }

  // Notifier l'API
  const apiBase = getApiBaseUrl()
  fetch(`${apiBase}/api/share/lessons/${encodeURIComponent(lessonId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Account-ID': getStorageScope() },
    body: JSON.stringify({ authorName, text }),
  }).catch(() => {})

  return comment
}

export function getExportedLessonByResourceId(resourceId: string): ExportedLesson | null {
  const all = getAllExportedLessons()
  return all.find((item) => item.resourceId === resourceId) ?? null
}

export function addStudentFigmaComment(
  lessonId: string,
  data: { pageIndex: number; xPercent: number; yPercent: number; authorName: string; text: string }
) {
  const lesson = getExportedLesson(lessonId)
  const comment = {
    id: `figma-comm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    pageIndex: data.pageIndex,
    xPercent: data.xPercent,
    yPercent: data.yPercent,
    authorName: data.authorName.trim() || 'Élève',
    text: data.text.trim(),
    createdAt: new Date().toISOString(),
  }

  if (lesson) {
    const list = [...(lesson.figmaComments || []), comment]
    const updated: ExportedLesson = {
      ...lesson,
      figmaComments: list,
      updatedAt: new Date().toISOString(),
    }
    cacheExportedLesson(updated)
  }

  const apiBase = getApiBaseUrl()
  fetch(`${apiBase}/api/share/lessons/${encodeURIComponent(lessonId)}/figma-comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Account-ID': getStorageScope() },
    body: JSON.stringify(data),
  }).catch(() => {})

  return comment
}

export function addStudentSticker(
  lessonId: string,
  data: { pageIndex: number; xPercent: number; yPercent: number; emoji: string }
) {
  const lesson = getExportedLesson(lessonId)
  const sticker = {
    id: `sticker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    pageIndex: data.pageIndex,
    xPercent: data.xPercent,
    yPercent: data.yPercent,
    emoji: data.emoji,
    createdAt: new Date().toISOString(),
  }

  if (lesson) {
    const list = [...(lesson.stickers || []), sticker]
    const updated: ExportedLesson = {
      ...lesson,
      stickers: list,
      updatedAt: new Date().toISOString(),
    }
    cacheExportedLesson(updated)
  }

  const apiBase = getApiBaseUrl()
  fetch(`${apiBase}/api/share/lessons/${encodeURIComponent(lessonId)}/stickers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Account-ID': getStorageScope() },
    body: JSON.stringify(data),
  }).catch(() => {})

  return sticker
}

export function buildExportUrl(username: string, lessonId: string): string {
  const cleanUser = normalizeTeacherUsername(username) || 'prof'
  return `${window.location.origin}/share/${encodeURIComponent(cleanUser)}/${encodeURIComponent(lessonId)}`
}

/**
 * Analyse l'URL actuelle pour détecter si l'utilisateur consulte une leçon partagée
 * Prise en charge :
 * - Sous-domaine direct : https://share.mathisbnl.info/{username}/{id}
 * - Chemin local/proxy : /share/{username}/{id} ou /share/{id}
 * - Hash routing : #/share/{username}/{id} ou #/share/{id}
 * - Paramètre de requête : ?share={id} ou ?l={id}
 */
export function parseSharedLessonFromUrl(): { username?: string; lessonId: string } | null {
  try {
    const { hostname, pathname, search, hash } = window.location

    // 1. Paramètre de requête ?share=... ou ?l=...
    const params = new URLSearchParams(search)
    const shareQuery = params.get('share') || params.get('l')
    if (shareQuery) {
      return { lessonId: shareQuery }
    }

    // 2. Hash routing #/share/...
    if (hash && hash.startsWith('#/share/')) {
      const parts = hash.replace('#/share/', '').split('/').filter(Boolean)
      if (parts.length >= 2) {
        return { username: parts[0], lessonId: parts[1] }
      }
      if (parts.length === 1) {
        return { lessonId: parts[0] }
      }
    }

    // 3. Sous-domaine share.mathisbnl.info
    const isShareHost = hostname === 'share.mathisbnl.info' || hostname.endsWith('.share.mathisbnl.info')
    if (isShareHost) {
      const parts = pathname.split('/').filter(Boolean)
      if (parts.length >= 2) {
        return { username: parts[0], lessonId: parts[1] }
      }
      if (parts.length === 1) {
        return { lessonId: parts[0] }
      }
    }

    // 4. Chemin /share/:username/:id
    if (pathname.startsWith('/share/')) {
      const parts = pathname.replace('/share/', '').split('/').filter(Boolean)
      if (parts.length >= 2) {
        return { username: parts[0], lessonId: parts[1] }
      }
      if (parts.length === 1) {
        return { lessonId: parts[0] }
      }
    }

    return null
  } catch (err) {
    console.error('Erreur parsing URL partagée:', err)
    return null
  }
}

export function isShareSubdomain(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  return host === 'share.mathisbnl.info' || host.endsWith('.share.mathisbnl.info')
}

