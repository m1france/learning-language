import type { Resource } from './domain'

const createdAt = '2026-08-02T09:00:00.000Z'

export const seedResources: Resource[] = [
  {
    id: 'sat-8th', title: 'Saturday on 8th Avenue', author: 'A New York story', type: 'story', difficulty: 'intermediate', minutes: 8, cover: 'coral', language: 'en', createdAt,
    chapters: [
      { id: 'morning', title: 'Morning light', paragraphs: [
        'On Saturday morning, Maya left her apartment before the city was fully awake. The air was cold, but the sun made the sidewalks glow.',
        'She walked down Eighth Avenue toward the small market on the corner. Her neighbor, Mr. Lewis, was already outside, carrying two paper bags and talking to his dog.',
        '“Big plans today?” he asked. Maya smiled. She was meeting her sister for brunch, then they would visit a new exhibit at the museum.'
      ] },
      { id: 'market', title: 'The familiar market', paragraphs: [
        'At the market, the barista remembered her usual order. It was a small thing, but it made the neighborhood feel like home.',
        'Maya chose a table by the window and watched a delivery truck turn the corner. A child in a red coat waved at everyone who passed.',
        'Her sister arrived late, laughing about the subway. They shared a cinnamon roll and made a plan for the rest of the afternoon.'
      ] },
      { id: 'museum', title: 'An afternoon together', paragraphs: [
        'The museum was busy, but neither of them minded. They moved slowly from room to room and stopped whenever a painting gave them something to talk about.',
        'By evening, the light had changed. On the walk home, Maya felt grateful for the ordinary details that had filled her day.'
      ] },
    ],
  },
  {
    id: 'small-talk', title: 'Why Americans make small talk', author: 'Everyday culture', type: 'culture', difficulty: 'intermediate', minutes: 5, cover: 'blue', language: 'en', createdAt,
    chapters: [
      { id: 'opening', title: 'A social bridge', paragraphs: [
        'Small talk is a short, friendly conversation about simple things: the weather, a commute, a weekend plan, or a local event.',
        'In the United States, it can be a way to show openness. You do not need a long answer; a question in return often keeps the exchange moving.'
      ] },
      { id: 'try-it', title: 'Try it naturally', paragraphs: [
        'At a coffee shop, “How is your day going?” is often a polite invitation rather than a request for a full story.',
        'A brief answer followed by “How about yours?” is usually enough. The goal is connection, not performance.'
      ] },
    ],
  },
  {
    id: 'diner-road', title: 'The diner at the end of the road', author: 'Short fiction', type: 'story', difficulty: 'beginner', minutes: 4, cover: 'gold', language: 'en', createdAt,
    chapters: [
      { id: 'rain', title: 'Rain at the diner', paragraphs: [
        'The diner was warm and bright. Outside, rain covered the road. Inside, Ella ordered pancakes and listened to the quiet music.',
        'A waiter brought coffee to her table. “Long drive?” he asked. Ella looked through the window and smiled.'
      ] },
      { id: 'choice', title: 'A small choice', paragraphs: [
        'She had been driving all day. For the first time, she did not know exactly where she wanted to go next.',
        'Then she opened her map, took one last bite of pancake, and chose the road by the river.'
      ] },
    ],
  },
  {
    id: 'city-listens', title: 'A city that listens', author: 'Local news', type: 'article', difficulty: 'advanced', minutes: 7, cover: 'green', language: 'en', createdAt,
    chapters: [
      { id: 'planning', title: 'Planning with residents', paragraphs: [
        'Across several American cities, residents are helping planners redesign public spaces with a focus on shade, safety, and community.',
        'The process includes neighborhood walks, translated surveys, and public meetings that give people a chance to explain what they need.'
      ] },
      { id: 'result', title: 'What changes', paragraphs: [
        'The result is often practical: safer crosswalks, more trees, benches near transit stops, and space for local businesses.',
        'For planners, listening is not an extra step. It is the information that makes a project useful.'
      ] },
    ],
  },
]

export const culturalEntries = [
  { id: 'small-talk', title: 'Small talk', label: 'EVERYDAY AMERICA', headline: '“How’s it going?” is rarely a big question.', body: 'At a coffee shop, at work, or in an elevator, a short answer and a question back keeps small talk moving. It is a social bridge, not an exam.', more: 'Try “Pretty good, thanks. How about you?” with a cashier or colleague. The point is warmth, not a perfect answer.' },
  { id: 'tipping', title: 'Tipping', label: 'EVERYDAY AMERICA', headline: 'Tipping is part of the bill in many places.', body: 'In full-service restaurants in the United States, a tip is usually expected because it is part of how staff are paid.', more: 'A common starting point is 18–20% for table service. Counter service may show a tip screen, but it is more optional.' },
  { id: 'thanksgiving', title: 'Thanksgiving', label: 'EVERYDAY AMERICA', headline: 'A holiday centered on food and family.', body: 'Thanksgiving is celebrated on the fourth Thursday of November. Many people travel to share a meal with family or friends.', more: 'Turkey is traditional, but every family has its own version: side dishes, football, games, and sometimes a “Friendsgiving”.' },
]

export const recommendedTools = [
  { name: 'Language Reactor', description: 'Make video time active learning.', category: 'Video', url: 'https://www.languagereactor.com/' },
  { name: 'Ogima', description: 'Practice everyday conversations.', category: 'Speaking', url: 'https://www.ogima.co/' },
  { name: 'my_lute', description: 'Read with context at your own pace.', category: 'Reading', url: 'https://luteorg.github.io/lute-manual/' },
  { name: 'Anki', description: 'A classic deck for learners who want one.', category: 'Memory', url: 'https://apps.ankiweb.net/' },
  { name: 'Tandem', description: 'Exchange with native speakers.', category: 'Community', url: 'https://tandem.net/' },
]

export const monologueScenarios = [
  { id: 'space', title: 'My space', description: 'Show us your favorite corner at home.', duration: 120 },
  { id: 'tastes', title: 'My tastes', description: 'Tell us about a series you love.', duration: 120 },
  { id: 'daily', title: 'My daily life', description: 'Describe your morning routine.', duration: 120 },
  { id: 'opinion', title: 'My opinions', description: 'Would you rather live in a city or a small town?', duration: 120 },
]
