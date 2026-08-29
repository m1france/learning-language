import type { PageAnnotations } from '../LearningFocus'

export type ExportedLessonTooltip = {
  id: string
  pageIndex?: number
  /** Pourcentage horizontal relatif à la colonne de contenu (0 - 100) pour rendu identique sur tout écran */
  xPercent: number
  /** Pourcentage vertical relatif à la hauteur du conteneur (0 - 100) */
  yPercent: number
  text: string
  createdAt: string
}

export type ExportedLessonComment = {
  id: string
  pageIndex?: number
  /** Clé d'identification du mot, ex: "0:2" (paragraphe:index-du-mot) */
  wordKey: string
  /** Texte du mot sélectionné */
  wordText: string
  /** Contenu du commentaire saisi par le professeur */
  comment: string
  createdAt: string
}

export type ExportedLessonHomework = {
  title: string
  attachmentName?: string
  attachmentData?: string
  dueDate?: string
  instructions?: string
}

export type StudentComment = {
  id: string
  authorName: string
  text: string
  createdAt: string
}

/** Commentaire Figma positionné librement sur la page par un élève */
export type StudentFigmaComment = {
  id: string
  pageIndex: number
  xPercent: number
  yPercent: number
  authorName: string
  text: string
  createdAt: string
}

/** Sticker de réaction positionné sur le tableau */
export type StudentSticker = {
  id: string
  pageIndex: number
  xPercent: number
  yPercent: number
  emoji: string
  createdAt: string
}

export type ExportedLessonParagraph = {
  key: string
  chapterIndex: number
  paragraphIndex: number
  chapterTitle: string
  isChapterStart: boolean
  text: string
  originalText?: string
  modifiedIndices?: number[]
}

export type ExportedLessonPage = {
  pageIndex: number
  chapterTitle?: string
  paragraphs: ExportedLessonParagraph[]
  annotations: PageAnnotations
}

export type ExportedLesson = {
  id: string
  /** Nom d'utilisateur de l'enseignant (en minuscules), utilisé dans l'URL share.mathisbnl.info/{username}/{id} */
  username: string
  teacherDisplayName?: string
  resourceId: string
  resourceTitle: string
  resourceAuthor: string
  chapterIndex: number
  chapterTitle: string
  pageIndex: number
  totalPages: number
  /** Toutes les pages de la ressource */
  pages?: ExportedLessonPage[]
  /** Paragraphes de la page courante (pour compatibilité) */
  paragraphs: ExportedLessonParagraph[]
  /** Annotations de la page courante (pour compatibilité) */
  annotations: PageAnnotations
  fontSize: number
  tooltips: ExportedLessonTooltip[]
  wordComments: ExportedLessonComment[]
  homework?: ExportedLessonHomework | null
  allowReactions: boolean
  allowComments: boolean
  reactions: Record<string, number>
  studentComments: StudentComment[]
  figmaComments?: StudentFigmaComment[]
  stickers?: StudentSticker[]
  createdAt: string
  updatedAt: string
}
