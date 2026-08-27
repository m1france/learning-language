import type { ApiSettings, Difficulty, Language, UiLanguage } from '../../domain'
import type { ExerciseDefinition, ExerciseMode } from './exercisesDomain'
import { getLanguageName } from '../../languages'
import { buildGuaranteedCrossword } from './crosswordUtils'

const UI_LANG_NAMES: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  zh: 'Chinois',
  ru: 'Russe',
  pt: 'Portugais',
}

export type GenerateExerciseParams = {
  prompt: string
  requestedMode: ExerciseMode
  difficulty: Difficulty
  learningLanguage: Language
  uiLanguage: UiLanguage
  api: ApiSettings
}

type ResolvedAiConfig = {
  endpoint: string
  key: string
  model: string
  provider: string
}

function resolveAiConfig(api: ApiSettings, customModelOverride?: string): ResolvedAiConfig | null {
  const customModel = customModelOverride?.trim()
  const provider = api.agentProvider || 'openrouter'

  // 1. Try explicit configured provider
  if (provider === 'openrouter' && api.openRouterKey?.trim()) {
    return {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      key: api.openRouterKey.trim(),
      model: customModel || api.agentModel?.trim() || 'google/gemini-2.0-flash-exp:free',
      provider: 'openrouter',
    }
  }
  if (provider === 'google' && api.googleKey?.trim()) {
    return {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: api.googleKey.trim(),
      model: customModel || api.agentModel?.trim() || 'gemini-2.0-flash',
      provider: 'google',
    }
  }
  if (provider === 'openai' && api.openAiKey?.trim()) {
    return {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      key: api.openAiKey.trim(),
      model: customModel || api.agentModel?.trim() || 'gpt-4o-mini',
      provider: 'openai',
    }
  }
  if (provider === 'nvidia' && api.nvidiaKey?.trim()) {
    return {
      endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
      key: api.nvidiaKey.trim(),
      model: customModel || api.agentModel?.trim() || 'meta/llama-3.3-70b-instruct',
      provider: 'nvidia',
    }
  }
  if (provider === 'kimi' && api.kimiKey?.trim()) {
    return {
      endpoint: 'https://api.moonshot.cn/v1/chat/completions',
      key: api.kimiKey.trim(),
      model: customModel || api.agentModel?.trim() || 'moonshot-v1-8k',
      provider: 'kimi',
    }
  }

  // 2. Fallback to any configured key in order
  if (api.openRouterKey?.trim()) {
    return {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      key: api.openRouterKey.trim(),
      model: customModel || api.agentModel?.trim() || 'google/gemini-2.0-flash-exp:free',
      provider: 'openrouter',
    }
  }
  if (api.googleKey?.trim()) {
    return {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: api.googleKey.trim(),
      model: customModel || api.agentModel?.trim() || 'gemini-2.0-flash',
      provider: 'google',
    }
  }
  if (api.openAiKey?.trim()) {
    return {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      key: api.openAiKey.trim(),
      model: customModel || api.agentModel?.trim() || 'gpt-4o-mini',
      provider: 'openai',
    }
  }
  if (api.nvidiaKey?.trim()) {
    return {
      endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
      key: api.nvidiaKey.trim(),
      model: customModel || api.agentModel?.trim() || 'meta/llama-3.3-70b-instruct',
      provider: 'nvidia',
    }
  }
  if (api.kimiKey?.trim()) {
    return {
      endpoint: 'https://api.moonshot.cn/v1/chat/completions',
      key: api.kimiKey.trim(),
      model: customModel || api.agentModel?.trim() || 'moonshot-v1-8k',
      provider: 'kimi',
    }
  }

  return null
}

export async function generateExerciseWithAi(
  params: GenerateExerciseParams,
): Promise<{ ok: true; exercise: ExerciseDefinition } | { ok: false; error: string }> {
  const { prompt, requestedMode, difficulty, learningLanguage, uiLanguage, api } = params
  const cleanPrompt = prompt.trim()

  if (!cleanPrompt) {
    return { ok: false, error: 'Indique ce que tu souhaites travailler.' }
  }

  const aiConfig = resolveAiConfig(api, api.taskModelExerciseBuilder)
  if (!aiConfig) {
    return {
      ok: false,
      error: 'Aucune clé API active trouvée. Renseigne ta clé API (OpenRouter, Google Gemini ou OpenAI) dans les Paramètres > Connexions.',
    }
  }

  const targetLangName = getLanguageName(learningLanguage)
  const explanationLang = UI_LANG_NAMES[uiLanguage] || 'Français'

  const systemPrompt = `You are a world-class pedagogical language professor creating a bespoke, high-quality interactive exercise.
Target language being learned: ${targetLangName}.
Student's explicit request / difficulty: "${cleanPrompt}".
Difficulty level: ${difficulty}.
All explanations, golden rules, tips, and instructions MUST BE WRITTEN IN ${explanationLang}.

${
  requestedMode === 'auto'
    ? 'Analyze the student’s request and select the single best exercise mode that will solve their specific difficulty most effectively.'
    : `The student chose the specific mode: "${requestedMode}". You MUST generate content for this exact mode.`
}

AVAILABLE MODES:
1. "fill_in_blanks" (4-6 sentences with missing prepositions/verbs/words, inline blank inputs, explanations, wrong examples with why)
2. "crossword" (theme matching the topic, 4-7 words, grid size 6x6 to 8x8, coordinates row/col 0-indexed, across and down clues)
3. "match_pairs" (5-7 pairs to connect, e.g. verb+preposition, synonyms, or sentences with explanations)
4. "sentence_scramble" (3-5 scrambled sentences with shuffled tokens to put in exact grammatical order)
5. "error_hunter" (a short 3-5 sentence passage containing 3-5 hidden mistakes to find and fix)
6. "dialogue_roleplay" (an interactive 3-turn real-life conversation scenario with choices and feedback)
7. "handwritten_mastery" (a comprehensive teacher master lesson note explaining the topic in depth, with 3-4 visual handwriting examples of faulty sentences vs cursive green corrections with detailed "Pourquoi ?", plus a 3-question mini-quiz at the end)
8. "grammar_deepdive" (a clear rule summary, comparison table, common pitfalls, and 4 application questions)
9. "image_association" (4-5 visual scenario cards with an English imageSearchQuery keyword to retrieve photos, and accurate expressions)

CRITICAL INSTRUCTIONS:
- You MUST generate 100% dynamic, tailored, fresh content specifically addressing "${cleanPrompt}".
- Return ONLY a valid JSON object matching the chosen mode schema.

OUTPUT JSON FORMAT:
{
  "title": "<Catchy short title in ${explanationLang}>",
  "mode": "<one of the mode IDs>",
  "instructions": "<Clear short instruction in ${explanationLang}>",
  "ruleReminder": "<Optional 1-sentence golden memo in ${explanationLang}>",
  "fillInBlanksData": { "items": [{ "id": "b1", "beforeText": "...", "expectedAnswer": "...", "afterText": "...", "hint": "...", "explanation": "...", "wrongExamplesWithWhy": [{ "wrong": "...", "why": "..." }] }], "wordBank": ["..."] },
  "crosswordData": { "gridRows": 6, "gridCols": 6, "theme": "...", "clues": [{ "number": 1, "direction": "across", "clue": "...", "answer": "...", "row": 0, "col": 0, "hint": "...", "explanation": "..." }] },
  "matchPairsData": { "leftCategoryLabel": "...", "rightCategoryLabel": "...", "pairs": [{ "id": "p1", "left": "...", "right": "...", "explanation": "..." }] },
  "sentenceScrambleData": { "items": [{ "id": "s1", "scrambledTokens": ["..."], "correctSentence": "...", "frenchTranslation": "...", "grammarRuleTip": "...", "explanation": "..." }] },
  "errorHunterData": { "storyText": "...", "totalErrorsCount": 2, "segments": [{ "text": "...", "isError": false }, { "text": "...", "isError": true, "errorId": "e1", "wrongWord": "...", "correctedWord": "...", "explanation": "..." }] },
  "dialogueRoleplayData": { "scenarioTitle": "...", "contextSetting": "...", "turns": [{ "speaker": "...", "speakerAvatar": "...", "text": "...", "userChoices": [{ "id": "c1", "text": "...", "isOptimal": true, "feedback": "...", "handwritingNote": "..." }] }] },
  "handwrittenMasteryData": {
    "coreTopic": "<Topic Title in ${explanationLang}>",
    "goldenRule": "<Deep pedagogical golden rule explanation in ${explanationLang}>",
    "lessonIntroduction": "<Optional in-depth context explanation in ${explanationLang}>",
    "examples": [
      {
        "id": "h1",
        "badSentence": "<Sentence with a realistic error in ${targetLangName}>",
        "wrongSnippet": "<The exact faulty word/phrase in badSentence>",
        "goodSnippet": "<The correct replacement in ${targetLangName}>",
        "correctedSentence": "<The full clean corrected sentence in ${targetLangName}>",
        "whyExplanation": "<Clear pedagogical explanation in ${explanationLang} of why we write this and not that>",
        "ruleBox": "<Short rule tag>"
      }
    ],
    "quizQuestions": [
      {
        "id": "q1",
        "prompt": "<Application question in ${targetLangName} or ${explanationLang}>",
        "options": ["<Option A>", "<Option B>", "<Option C>"],
        "correctIndex": 0,
        "handwritingTip": "<Helpful explanation for the right answer in ${explanationLang}>"
      }
    ]
  },
  "grammarDeepdiveData": { "ruleTitle": "...", "ruleExplanation": "...", "summaryTable": { "headers": ["..."], "rows": [["..."]] }, "commonMistakes": [{ "mistake": "...", "correction": "...", "why": "..." }], "questions": [{ "id": "q1", "prompt": "...", "options": ["..."], "correctIndex": 0, "explanation": "...", "handwritingAdvice": "..." }] },
  "imageAssociationData": { "items": [{ "id": "img1", "emojiOrIcon": "...", "visualScenario": "...", "imageSearchQuery": "<1-3 English keywords for Unsplash photo>", "correctExpression": "...", "distractorExpressions": ["..."], "explanation": "..." }] }
}`

  const userMessage = `Create an interactive custom exercise for this request:\n"${cleanPrompt}"\nMode requested: ${requestedMode}`

  async function executeRequest(withJsonFormat: boolean): Promise<any> {
    const isFish = aiConfig!.model.toLowerCase().includes('fish')
    const isMoonshot = aiConfig!.endpoint.includes('moonshot')

    const bodyObj: Record<string, any> = {
      model: aiConfig!.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
    }

    if (withJsonFormat && !isFish && !isMoonshot) {
      bodyObj.response_format = { type: 'json_object' }
    }

    const res = await fetch(aiConfig!.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig!.key}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://learning-language.app',
        'X-Title': 'Language Learning App - Exercise Builder',
      },
      body: JSON.stringify(bodyObj),
    })

    return res
  }

  try {
    let response = await executeRequest(true)

    // Fallback if 400 Bad Request on response_format
    if (!response.ok && response.status === 400) {
      console.warn('[exerciseAiService] 400 with response_format, retrying without json_object constraint...')
      response = await executeRequest(false)
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      return {
        ok: false,
        error: `Erreur API IA (${aiConfig.provider}, HTTP ${response.status}): ${errText.slice(0, 180) || response.statusText}`,
      }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    if (!content) {
      return { ok: false, error: 'L’IA a renvoyé une réponse vide.' }
    }

    const jsonCleaned = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    let parsed: any
    try {
      parsed = JSON.parse(jsonCleaned)
    } catch {
      const start = jsonCleaned.indexOf('{')
      const end = jsonCleaned.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        parsed = JSON.parse(jsonCleaned.slice(start, end + 1))
      } else {
        return { ok: false, error: 'Impossible de décoder la réponse JSON de l’IA.' }
      }
    }

    const resolvedMode: ExerciseMode = parsed.mode || (requestedMode === 'auto' ? 'fill_in_blanks' : requestedMode)

    // Adapt handwrittenMasteryData quizQuestions if inside examples or at root
    if (parsed.handwrittenMasteryData) {
      const hData = parsed.handwrittenMasteryData
      if (!hData.quizQuestions && Array.isArray(hData.examples)) {
        const extractedQuestions: any[] = []
        hData.examples.forEach((ex: any, idx: number) => {
          if (ex.practiceQuestion) {
            extractedQuestions.push({
              id: `q${idx + 1}`,
              prompt: ex.practiceQuestion.prompt,
              options: ex.practiceQuestion.options,
              correctIndex: ex.practiceQuestion.correctIndex,
              handwritingTip: ex.practiceQuestion.handwritingTip,
            })
          }
        })
        if (extractedQuestions.length > 0) {
          hData.quizQuestions = extractedQuestions
        }
      }
    }

    // Process and guarantee 100% mathematically valid crossword grid
    let processedCrosswordData = parsed.crosswordData
    if (processedCrosswordData && Array.isArray(processedCrosswordData.clues)) {
      processedCrosswordData = buildGuaranteedCrossword(
        processedCrosswordData.clues,
        processedCrosswordData.theme || parsed.title || 'Mots croisés',
      )
    }

    const exercise: ExerciseDefinition = {
      id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: String(parsed.title || 'Exercice interactif'),
      targetProblem: cleanPrompt,
      mode: resolvedMode,
      difficulty,
      instructions: String(parsed.instructions || ''),
      ruleReminder: parsed.ruleReminder ? String(parsed.ruleReminder) : undefined,
      targetLanguage: learningLanguage,
      createdAt: new Date().toISOString(),
      fillInBlanksData: parsed.fillInBlanksData,
      crosswordData: processedCrosswordData,
      matchPairsData: parsed.matchPairsData,
      sentenceScrambleData: parsed.sentenceScrambleData,
      imageAssociationData: parsed.imageAssociationData,
      errorHunterData: parsed.errorHunterData,
      dialogueRoleplayData: parsed.dialogueRoleplayData,
      handwrittenMasteryData: parsed.handwrittenMasteryData,
      grammarDeepdiveData: parsed.grammarDeepdiveData,
    }

    return {
      ok: true,
      exercise,
    }
  } catch (err) {
    console.error('[exerciseAiService] Error:', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Une erreur est survenue lors de la génération de l’exercice.',
    }
  }
}
