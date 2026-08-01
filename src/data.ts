export type Language = 'en' | 'fr'
export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'native'

export type Resource = {
  id: number
  title: string
  author: string
  type: 'Story' | 'Article' | 'Culture' | 'Script'
  difficulty: Difficulty
  minutes: number
  progress: number
  cover: 'coral' | 'blue' | 'gold' | 'green'
  content: string[]
  language: Language
}

export const resources: Resource[] = [
  {
    id: 1,
    title: 'Saturday on 8th Avenue',
    author: 'A New York story',
    type: 'Story',
    difficulty: 'intermediate',
    minutes: 6,
    progress: 42,
    cover: 'coral',
    language: 'en',
    content: [
      'On Saturday morning, Maya left her apartment before the city was fully awake. The air was cold, but the sun made the sidewalks glow.',
      'She walked down Eighth Avenue toward the small market on the corner. Her neighbor, Mr. Lewis, was already outside, carrying two paper bags and talking to his dog.',
      '“Big plans today?” he asked. Maya smiled. She was meeting her sister for brunch, then they would visit a new exhibit at the museum.',
      'At the market, the barista remembered her usual order. It was a small thing, but it made the neighborhood feel like home.'
    ],
  },
  {
    id: 2,
    title: 'Why Americans make small talk',
    author: 'Everyday culture',
    type: 'Culture',
    difficulty: 'intermediate',
    minutes: 4,
    progress: 0,
    cover: 'blue',
    language: 'en',
    content: [
      'Small talk is a short, friendly conversation about simple things: the weather, a commute, a weekend plan, or a local event.',
      'In the United States, it can be a way to show openness. You do not need a long answer; a question in return often keeps the exchange moving.'
    ],
  },
  {
    id: 3,
    title: 'The diner at the end of the road',
    author: 'Short fiction',
    type: 'Story',
    difficulty: 'beginner',
    minutes: 3,
    progress: 0,
    cover: 'gold',
    language: 'en',
    content: [
      'The diner was warm and bright. Outside, rain covered the road. Inside, Ella ordered pancakes and listened to the quiet music.'
    ],
  },
  {
    id: 4,
    title: 'A city that listens',
    author: 'Local news',
    type: 'Article',
    difficulty: 'advanced',
    minutes: 8,
    progress: 0,
    cover: 'green',
    language: 'en',
    content: [
      'Across several American cities, residents are helping planners redesign public spaces with a focus on shade, safety, and community.'
    ],
  },
]

export const prompts = ['neighborhood', 'glow', 'usual', 'corner', 'exhibit', 'awake', 'friendly', 'remember']

export const silentLetters: Record<string, string[]> = {
  talk: ['l'],
  walked: ['l'],
  small: ['l'],
  asked: ['k'],
}

export const scenarios = [
  ['My space', 'Show us your favorite corner at home.'],
  ['My tastes', 'Tell us about a series you love.'],
  ['My daily life', 'Describe your morning routine.'],
  ['My opinions', 'Would you rather live in a city or a small town?'],
]

export const tools = [
  ['Language Reactor', 'Make video time active learning.', 'Video'],
  ['Ogima', 'Practice everyday conversations.', 'Speaking'],
  ['my_lute', 'Read with context at your own pace.', 'Reading'],
  ['Anki', 'A classic deck for learners who want one.', 'Memory'],
]
