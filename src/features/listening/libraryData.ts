import type { Difficulty, Language } from '../../domain'

export type ListeningPlatform = 'youtube' | 'tiktok' | 'instagram' | 'science' | 'advice'
export type ListeningTopic = 'daily' | 'culture' | 'news' | 'science' | 'stories' | 'methods'

export type ListeningItem = {
  id: string
  language: Language
  platform: ListeningPlatform
  topic: ListeningTopic
  level: Difficulty
  title: string
  creator: string
  description: string
  duration: string
  url: string
  accent?: string
}

/**
 * A deliberately small, hand-picked starting library. Every item has a target
 * language, so the page can filter at source instead of merely translating its
 * labels. Links point to the publisher's channel or collection, which keeps the
 * library useful even when a specific social post expires.
 */
export const listeningItems: ListeningItem[] = [
  {
    id: 'yt-en-bbc-conversations', language: 'en', platform: 'youtube', topic: 'daily', level: 'beginner',
    title: 'Everyday conversations', creator: 'BBC Learning English', description: 'Short, clear exchanges for the situations you will actually meet.', duration: '6–10 min', url: 'https://www.youtube.com/@BBCLearningEnglish', accent: 'British English',
  },
  {
    id: 'yt-en-easy-street', language: 'en', platform: 'youtube', topic: 'culture', level: 'intermediate',
    title: 'Street interviews in English', creator: 'Easy English', description: 'Real people, varied accents, and natural answers from the street.', duration: '8–12 min', url: 'https://www.youtube.com/@EasyEnglishVideos', accent: 'Everyday English',
  },
  {
    id: 'yt-en-vox-explained', language: 'en', platform: 'youtube', topic: 'news', level: 'advanced',
    title: 'One idea, clearly explained', creator: 'Vox', description: 'Follow a current topic through strong visual storytelling and narration.', duration: '10–15 min', url: 'https://www.youtube.com/@Vox', accent: 'American English',
  },
  {
    id: 'yt-fr-innerfrench', language: 'fr', platform: 'youtube', topic: 'stories', level: 'intermediate',
    title: 'Histoires et réflexions en français', creator: 'InnerFrench', description: 'Des épisodes posés pour apprivoiser le français naturel.', duration: '15–25 min', url: 'https://www.youtube.com/@innerFrench', accent: 'Français de France',
  },
  {
    id: 'yt-fr-easy-street', language: 'fr', platform: 'youtube', topic: 'daily', level: 'beginner',
    title: 'Le français dans la rue', creator: 'Easy French', description: 'Des rencontres spontanées, avec le rythme du français quotidien.', duration: '6–12 min', url: 'https://www.youtube.com/@EasyFrench', accent: 'Français courant',
  },
  {
    id: 'yt-fr-science', language: 'fr', platform: 'youtube', topic: 'science', level: 'advanced',
    title: 'Une question scientifique, en profondeur', creator: 'ScienceEtonnante', description: 'Des explications rigoureuses pour entraîner une écoute exigeante.', duration: '12–25 min', url: 'https://www.youtube.com/@ScienceEtonnante', accent: 'Français de France',
  },

  {
    id: 'tt-en-phrase', language: 'en', platform: 'tiktok', topic: 'daily', level: 'beginner',
    title: 'A useful phrase in context', creator: '@bbclearningenglish', description: 'Catch a phrase, hear it naturally, then say it with the clip.', duration: '< 1 min', url: 'https://www.tiktok.com/@bbclearningenglish', accent: 'British English',
  },
  {
    id: 'tt-en-news', language: 'en', platform: 'tiktok', topic: 'news', level: 'intermediate',
    title: 'A headline in one minute', creator: '@nowthis', description: 'Fast, visual news clips that build listening speed and context.', duration: '1–2 min', url: 'https://www.tiktok.com/@nowthis', accent: 'American English',
  },
  {
    id: 'tt-en-words', language: 'en', platform: 'tiktok', topic: 'culture', level: 'intermediate',
    title: 'Words people really use', creator: '@dictionarycom', description: 'Short vocabulary stories with pronunciation and cultural nuance.', duration: '< 1 min', url: 'https://www.tiktok.com/@dictionarycom', accent: 'American English',
  },
  {
    id: 'tt-fr-actu', language: 'fr', platform: 'tiktok', topic: 'news', level: 'intermediate',
    title: 'L’actualité en format court', creator: '@franceinfo', description: 'Des explications rapides pour entendre le vocabulaire du moment.', duration: '1–2 min', url: 'https://www.tiktok.com/@franceinfo', accent: 'Français de France',
  },
  {
    id: 'tt-fr-culture', language: 'fr', platform: 'tiktok', topic: 'culture', level: 'intermediate',
    title: 'Un regard sur la culture', creator: '@artefr', description: 'Des capsules pour relier la langue, les idées et les références.', duration: '1–3 min', url: 'https://www.tiktok.com/@artefr', accent: 'Français de France',
  },
  {
    id: 'tt-fr-stories', language: 'fr', platform: 'tiktok', topic: 'stories', level: 'advanced',
    title: 'Des histoires qui se racontent', creator: '@konbini', description: 'Interviews et récits vivants pour écouter des voix très actuelles.', duration: '1–3 min', url: 'https://www.tiktok.com/@konbini', accent: 'Français courant',
  },

  {
    id: 'ig-en-ideas', language: 'en', platform: 'instagram', topic: 'culture', level: 'intermediate',
    title: 'One idea worth sharing', creator: '@ted', description: 'Short talks and excerpts that make ideas easy to revisit.', duration: '1–3 min', url: 'https://www.instagram.com/ted/', accent: 'Global English',
  },
  {
    id: 'ig-en-nature', language: 'en', platform: 'instagram', topic: 'science', level: 'intermediate',
    title: 'The natural world, narrated', creator: '@natgeo', description: 'Immersive clips that pair vivid images with accessible narration.', duration: '1–3 min', url: 'https://www.instagram.com/natgeo/', accent: 'American English',
  },
  {
    id: 'ig-en-brief', language: 'en', platform: 'instagram', topic: 'daily', level: 'beginner',
    title: 'English in a small dose', creator: '@bbclearningenglish', description: 'Save a short lesson, listen twice, and reuse one expression today.', duration: '< 1 min', url: 'https://www.instagram.com/bbclearningenglish/', accent: 'British English',
  },
  {
    id: 'ig-fr-arte', language: 'fr', platform: 'instagram', topic: 'culture', level: 'intermediate',
    title: 'Des idées à écouter', creator: '@artefr', description: 'Des formats courts qui font entendre le français des arts et des sociétés.', duration: '1–3 min', url: 'https://www.instagram.com/artefr/', accent: 'Français de France',
  },
  {
    id: 'ig-fr-culture', language: 'fr', platform: 'instagram', topic: 'science', level: 'advanced',
    title: 'Une question, une émission', creator: '@franceculture', description: 'Des extraits riches pour écouter un français précis et nuancé.', duration: '1–4 min', url: 'https://www.instagram.com/franceculture/', accent: 'Français de France',
  },
  {
    id: 'ig-fr-actu', language: 'fr', platform: 'instagram', topic: 'news', level: 'intermediate',
    title: 'Le monde en quelques mots', creator: '@lemondefr', description: 'Des vidéos d’actualité pour apprivoiser le rythme du français journalistique.', duration: '1–3 min', url: 'https://www.instagram.com/lemondefr/', accent: 'Français de France',
  },

  {
    id: 'science-en-friday', language: 'en', platform: 'science', topic: 'science', level: 'advanced',
    title: 'Science Friday', creator: 'Science Friday', description: 'Long-form science conversations with researchers and journalists.', duration: '20–45 min', url: 'https://www.sciencefriday.com/', accent: 'American English',
  },
  {
    id: 'science-en-sa', language: 'en', platform: 'science', topic: 'science', level: 'advanced',
    title: 'Science, explained for curious minds', creator: 'Scientific American', description: 'Listen to science reporting while expanding precise, useful vocabulary.', duration: '10–30 min', url: 'https://www.scientificamerican.com/podcasts/', accent: 'American English',
  },
  {
    id: 'science-fr-cqfd', language: 'fr', platform: 'science', topic: 'science', level: 'advanced',
    title: 'La Science, CQFD', creator: 'France Culture', description: 'Des scientifiques expliquent leurs travaux dans un français authentique.', duration: '30–60 min', url: 'https://www.radiofrance.fr/franceculture/podcasts/la-science-cqfd', accent: 'Français de France',
  },
  {
    id: 'science-fr-etonnante', language: 'fr', platform: 'science', topic: 'science', level: 'advanced',
    title: 'Les sciences qui étonnent', creator: 'ScienceEtonnante', description: 'Des dossiers accessibles pour passer du français appris au français pensé.', duration: '15–30 min', url: 'https://scienceetonnante.com/', accent: 'Français de France',
  },
  {
    id: 'advice-en-ears', language: 'en', platform: 'advice', topic: 'methods', level: 'intermediate',
    title: 'All Ears English', creator: 'All Ears English', description: 'Build a small listening routine around natural, friendly conversations.', duration: '10–20 min', url: 'https://www.allearsenglish.com/', accent: 'American English',
  },
  {
    id: 'advice-en-bbc', language: 'en', platform: 'advice', topic: 'methods', level: 'beginner',
    title: 'Make your listening active', creator: 'BBC Learning English', description: 'Use transcripts, repeat a short extract, then notice one new sound.', duration: '5–10 min', url: 'https://www.bbc.co.uk/learningenglish', accent: 'British English',
  },
  {
    id: 'advice-fr-inner', language: 'fr', platform: 'advice', topic: 'methods', level: 'intermediate',
    title: 'Le podcast InnerFrench', creator: 'InnerFrench', description: 'Une progression douce avec des épisodes pensés pour l’écoute régulière.', duration: '20–35 min', url: 'https://innerfrench.com/podcast/', accent: 'Français de France',
  },
  {
    id: 'advice-fr-facile', language: 'fr', platform: 'advice', topic: 'methods', level: 'beginner',
    title: 'Écouter peu, mais souvent', creator: 'Podcast Français Facile', description: 'Choisis un extrait court, réécoute-le, puis réemploie une expression.', duration: '5–15 min', url: 'https://www.podcastfrancaisfacile.com/', accent: 'Français de France',
  },
]
