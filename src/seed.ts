export const culturalEntries = [
  { id: 'small-talk', title: 'Small talk', label: 'EVERYDAY AMERICA', headline: '“How’s it going?” is rarely a big question.', body: 'At a coffee shop, at work, or in an elevator, a short answer and a question back keeps small talk moving. It is a social bridge, not an exam.', more: 'Try “Pretty good, thanks. How about you?” with a cashier or colleague. The point is warmth, not a perfect answer.' },
  { id: 'tipping', title: 'Tipping', label: 'EVERYDAY AMERICA', headline: 'Tipping is part of the bill in many places.', body: 'In full-service restaurants in the United States, a tip is usually expected because it is part of how staff are paid.', more: 'A common starting point is 18–20% for table service. Counter service may show a tip screen, but it is more optional.' },
  { id: 'thanksgiving', title: 'Thanksgiving', label: 'EVERYDAY AMERICA', headline: 'A holiday centered on food and family.', body: 'Thanksgiving is celebrated on the fourth Thursday of November. Many people travel to share a meal with family or friends.', more: 'Turkey is traditional, but every family has its own version: side dishes, football, games, and sometimes a “Friendsgiving”.' },
  { id: 'coffee-to-go', title: 'Coffee to go', label: 'EVERYDAY AMERICA', headline: '“For here or to go?” decides your cup.', body: 'Ordering coffee in the US often comes with quick choices: size, milk, and whether you stay or leave.', more: 'A simple “A medium latte to go, please” is complete. “To go” means takeaway — nobody will correct your grammar.' },
  { id: 'hugging', title: 'Hugging vs. handshake', label: 'EVERYDAY AMERICA', headline: 'Greetings depend on closeness, not rules.', body: 'Friends often hug; new colleagues usually shake hands or just wave. People rarely kiss on the cheek.', more: 'When unsure, smile and mirror what the other person does. A wave is always safe.' },
  { id: 'weather-talk', title: 'Weather talk', label: 'EVERYDAY AMERICA', headline: 'The weather is the safest opener.', body: '“Can you believe this heat?” works with strangers anywhere — a line at the store, a bus stop, an elevator.', more: 'You are not expected to know forecasts. Agreement is the goal: “Right? It’s been wild lately.”' },
  { id: 'compliments', title: 'Compliments', label: 'EVERYDAY AMERICA', headline: '“I love your shoes” is a conversation, not flirting.', body: 'Americans give casual compliments to strangers often. The polite response is simply “Thank you!” — not denying it.', more: 'You can add one detail back: “Thanks! I got them on sale.” Then the exchange is complete.' },
  { id: 'goodbyes', title: 'Goodbyes', label: 'EVERYDAY AMERICA', headline: '“See you later” is not a promise.', body: '“See you later”, “Take care”, “Have a good one” are warm exits, not appointments. No one checks later.', more: 'Match the energy: “You too, take care!” is always correct.' },
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

export type GuidedText = { id: string; title: string; minutes: 1 | 2 | 3; text: string }

export const guidedTexts: GuidedText[] = [
  {
    id: 'morning-routine', title: 'My morning routine', minutes: 1,
    text: `Every morning, I wake up around seven o'clock. The first thing I do is open the window and look at the sky. If it's sunny, I feel lucky. If it's raining, I make myself a promise to carry an umbrella. I brush my teeth, I drink a large glass of water, and I put on some music while I get dressed. Then I make coffee — strong, with a little milk — and I sit down for five quiet minutes before the day really begins. Some mornings I write three lines in a notebook: one thing I'm grateful for, one thing I want to do, and one thing I want to avoid. It's a small habit, but it changes everything. When I leave the house, I always say goodbye to my neighbor's cat, even if the cat ignores me completely.`,
  },
  {
    id: 'weekend-city', title: 'A perfect weekend in my city', minutes: 2,
    text: `A perfect weekend in my city starts early, before the streets get busy. I like to walk to the market with a canvas bag and no real plan. I buy whatever looks alive that day — tomatoes in summer, mushrooms in autumn, always a loaf of bread that's still warm. Around ten, I meet a friend at a café we both pretend is "our place", even though half the neighborhood thinks the same thing. We talk about nothing important, and that's exactly the point. In the afternoon, I try to do one thing slowly: a museum room instead of the whole museum, a long chapter instead of three short ones, a walk without headphones so I can actually hear the city. In the evening, I cook something simple but real — maybe a soup, maybe pasta with too much garlic — and I invite someone over, or I enjoy being alone. Before bed, I stand at the window for a minute and look at the lights. Nothing special happened, and yet the day feels full. That's what a perfect weekend means to me: not doing more, but noticing more.`,
  },
  {
    id: 'learning-story', title: 'Why I am learning this language', minutes: 3,
    text: `People often ask me why I am learning this language, and I never give the short answer, because the short answer is not the true one. The true answer starts with a trip I took a few years ago. I was sitting in a small restaurant, and at the table next to me, an old man was telling a story. Everyone at his table was laughing — the kind of laughter that makes your shoulders shake. I understood nothing. Not one word. And I remember thinking: there is a whole world inside that language, and I am locked outside of it. Since that evening, learning has stopped being a school subject for me. It became a way to unlock doors. Every new word is a small key. When I learn a word like "awkward" or "cozy", I'm not just memorizing vocabulary — I'm collecting tools to describe my own life more precisely. Some days, progress feels slow. I forget words I was sure I knew. I mispronounce things in front of patient strangers. But then there are the good days: the day I understood a joke without translating it, the day I dreamed one sentence in the language, the day a song's lyrics suddenly made sense on the bus. Those days remind me why I started. I am not learning this language to pass a test. I am learning it so that one day, when someone tells a story at the table next to me, I can laugh too.`,
  },
]

export const tongueTwisters = [
  { id: 'she-sells', text: 'She sells seashells by the seashore.', focus: 'ʃ vs s' },
  { id: 'red-lorry', text: 'Red lorry, yellow lorry, red lorry, yellow lorry.', focus: 'r vs l' },
  { id: 'peter-piper', text: 'Peter Piper picked a peck of pickled peppers.', focus: 'p explosif' },
  { id: 'thirty-three', text: 'Thirty-three thirsty thieves thought they were thrilled.', focus: 'θ (th)' },
  { id: 'unique-york', text: 'You know New York, you need New York, you know you need unique New York.', focus: 'j (y) + voyelles' },
  { id: 'crisp-crust', text: 'Crisp crusts crackle crunchily.', focus: 'groupes de consonnes' },
]
