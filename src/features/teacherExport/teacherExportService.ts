import type { UserSettings } from '../../domain'
import type { PageAnnotations } from '../LearningFocus'
import type { ExportedLesson, ExportedLessonParagraph, StudentComment } from './teacherExportDomain'

const STORAGE_KEY_LIST = 'vivre_exported_lessons'
const STORAGE_KEY_PREFIX = 'vivre_shared_lesson_'

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
    console.error('Erreur récupération leçon partagée:', err)
    return null
  }
}

export function saveExportedLesson(lesson: ExportedLesson): void {
  try {
    // 1. Enregistrement direct par id
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${lesson.id}`, JSON.stringify(lesson))

    // 2. Mise à jour de la liste maîtresse
    const all = getAllExportedLessons().filter((item) => item.id !== lesson.id)
    all.unshift(lesson)
    localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(all))
  } catch (err) {
    console.error('Erreur sauvegarde leçon exportée:', err)
  }
}

export function deleteExportedLesson(id: string): void {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${id}`)
    const all = getAllExportedLessons().filter((item) => item.id !== id)
    localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(all))
  } catch (err) {
    console.error('Erreur suppression leçon exportée:', err)
  }
}

export function addLessonReaction(lessonId: string, emoji: string): Record<string, number> {
  const lesson = getExportedLesson(lessonId)
  if (!lesson) return {}
  const reactions = { ...(lesson.reactions || {}) }
  reactions[emoji] = (reactions[emoji] || 0) + 1
  const updated: ExportedLesson = {
    ...lesson,
    reactions,
    updatedAt: new Date().toISOString(),
  }
  saveExportedLesson(updated)
  return reactions
}

export function addLessonComment(lessonId: string, authorName: string, text: string): StudentComment | null {
  const lesson = getExportedLesson(lessonId)
  if (!lesson) return null
  const comment: StudentComment = {
    id: `comm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    authorName: authorName.trim() || 'Élève',
    text: text.trim(),
    createdAt: new Date().toISOString(),
  }
  const comments = [...(lesson.studentComments || []), comment]
  const updated: ExportedLesson = {
    ...lesson,
    studentComments: comments,
    updatedAt: new Date().toISOString(),
  }
  saveExportedLesson(updated)
  return comment
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
