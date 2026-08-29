import type { UserSettings } from '../../domain'
import type { PageAnnotations } from '../LearningFocus'
import type { ExportedLesson, ExportedLessonParagraph, StudentComment } from './teacherExportDomain'

const STORAGE_KEY_LIST = 'vivre_exported_lessons'
const STORAGE_KEY_PREFIX = 'vivre_shared_lesson_'

function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  // Si on est en dev local sur le port 5173 et que le serveur Hono tourne sur 3001
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (window.location.port === '5173') {
      return 'http://localhost:3001'
    }
  }
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
    const raw = localStorage.getItem(STORAGE_KEY_LIST)
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
    const direct = localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`)
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
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, JSON.stringify(data.lesson))
        return data.lesson as ExportedLesson
      }
    }
  } catch (err) {
    console.warn('Impossible de joindre le serveur de partage:', err)
  }

  return null
}

export function saveExportedLesson(lesson: ExportedLesson): void {
  try {
    // 1. Enregistrement local
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${lesson.id}`, JSON.stringify(lesson))

    // 2. Mise à jour de la liste maîtresse locale
    const all = getAllExportedLessons().filter((item) => item.id !== lesson.id)
    all.unshift(lesson)
    localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(all))

    // 3. Synchronisation avec le serveur distant
    const apiBase = getApiBaseUrl()
    fetch(`${apiBase}/api/share/lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson }),
    }).catch((err) => {
      console.warn('Sync serveur de partage en arrière-plan:', err)
    })
  } catch (err) {
    console.error('Erreur sauvegarde leçon exportée:', err)
  }
}

export function deleteExportedLesson(id: string): void {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${id}`)
    const all = getAllExportedLessons().filter((item) => item.id !== id)
    localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(all))

    // Suppression sur le serveur
    const apiBase = getApiBaseUrl()
    fetch(`${apiBase}/api/share/lessons/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => {})
  } catch (err) {
    console.error('Erreur suppression leçon exportée:', err)
  }
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
    saveExportedLesson(updated)
  }

  // Notifier l'API
  const apiBase = getApiBaseUrl()
  fetch(`${apiBase}/api/share/lessons/${encodeURIComponent(lessonId)}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    saveExportedLesson(updated)
  }

  // Notifier l'API
  const apiBase = getApiBaseUrl()
  fetch(`${apiBase}/api/share/lessons/${encodeURIComponent(lessonId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    saveExportedLesson(updated)
  }

  const apiBase = getApiBaseUrl()
  fetch(`${apiBase}/api/share/lessons/${encodeURIComponent(lessonId)}/figma-comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    saveExportedLesson(updated)
  }

  const apiBase = getApiBaseUrl()
  fetch(`${apiBase}/api/share/lessons/${encodeURIComponent(lessonId)}/stickers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => {})

  return sticker
}

export function buildExportUrl(username: string, lessonId: string): string {
  const cleanUser = normalizeTeacherUsername(username) || 'prof'
  return `https://share.mathisbnl.info/${cleanUser}/${lessonId}`
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
