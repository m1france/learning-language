import type { Difficulty, UiLanguage } from './domain'

/**
 * Interface translations. Everything the app says (navigation, buttons,
 * onboarding, reader chrome) lives here — imported content is never touched.
 * Six interface languages: English, Spanish, French, Mandarin, Russian,
 * Portuguese. Pages not yet translated (Settings, Speaking, Life, Focus)
 * fall back to French/English via `baseUi`.
 */

export const UI_LANGUAGES: { id: UiLanguage; flag: string; name: string }[] = [
  { id: 'en', flag: '🇬🇧', name: 'English' },
  { id: 'es', flag: '🇪🇸', name: 'Español' },
  { id: 'fr', flag: '🇫🇷', name: 'Français' },
  { id: 'zh', flag: '🇨🇳', name: '中文' },
  { id: 'ru', flag: '🇷🇺', name: 'Русский' },
  { id: 'pt', flag: '🇵🇹', name: 'Português' },
]

/** Pages still on the old two-language system receive 'fr' or 'en'. */
export const baseUi = (ui: UiLanguage): 'fr' | 'en' => (ui === 'fr' ? 'fr' : 'en')

export const detectUiLanguage = (): UiLanguage => {
  const nav = (navigator.language || 'fr').slice(0, 2).toLowerCase()
  return (UI_LANGUAGES.some((l) => l.id === nav) ? nav : 'fr') as UiLanguage
}

export type AppCopy = {
  onboardTitleA: string
  onboardTitleB: string
  onboardIntro: string
  start: string
  name: string
  nameHint: string
  interfaceQuestion: string
  learningLanguageQuestion: string
  welcome: string
  resumeWhereYouLeftOff: string
  viewAll: string
  yourJournal: string
  openAction: string
  noSpeakingSessions: string
  startSpeakingSession: string
  darkMode: string
  collapseSidebar: string
  expandSidebar: string
  lightMode: string
  roleLabel: string
  home: string
  reading: string
  speaking: string
  writing: string
  exercises: string
  seeMore: string
  seeLess: string
  settings: string
  today: string
  continueReading: string
  library: string
  archive: string
  add: string
  all: string
  allLevels: string
  dayCard: string
  startActivity: string
  dailyPrompt: string
  save: string
  publish: string
  published: string
  wordGoal: string
  noPush: string
  homeSubTail: string
  cardTitle: string
  cardBody: string
  quietTitle: string
  progressDone: string
  emptyTitle: string
  emptyHint: string
  librarySub: string
  writingSub: string
  writingBadge: string
  nudge: string
  nudgeTitle: string
  nudgeBody: string
  editorPlaceholder: string
  wordsCounter: string
  wallToday: string
  wallTitle: string
  wallFallback: string
  cosign: string
  addEyebrow: string
  addTitle: string
  addSub: string
  pickFile: string
  orUrl: string
  importError: string
  pastePlaceholder: string
  createResource: string
  pasteLink: string
  pastedTitle: string
  difficultyLabel: string
  auto: string
  categoryLabel: string
  newCategory: string
  manageCategories: string
  categoryName: string
  doneLabel: string
  difficulty: Record<Difficulty, string>
  categories: Record<string, string>
}

const fr: AppCopy = {
  onboardTitleA: 'Apprendre en', onboardTitleB: 'vivant la langue.',
  onboardIntro: 'Des pratiques naturelles, sans pression ni test de niveau.',
  start: 'Commencer', name: 'Ton prénom', nameHint: 'Comment peut-on t’appeler ?',
  interfaceQuestion: 'Quelle langue d’interface veux-tu choisir ?',
  learningLanguageQuestion: 'Quelle langue veux-tu apprendre ?',
  resumeWhereYouLeftOff: 'Reprendre là où tu t’es arrêté',
  viewAll: 'Voir tout',
  yourJournal: 'Ton carnet',
  openAction: 'Ouvrir',
  noSpeakingSessions: 'Aucun enregistrement pour le moment.',
  startSpeakingSession: 'Démarrer une session',
  welcome: 'Bienvenue', darkMode: 'Mode sombre', collapseSidebar: 'Réduire la barre latérale', expandSidebar: 'Agrandir la barre latérale', lightMode: 'Mode clair', roleLabel: 'Apprenant au quotidien', home: 'Accueil', reading: 'Lire', speaking: 'Parler', writing: 'Écrire', exercises: 'Exercices', seeMore: 'Voir plus', seeLess: 'Voir moins', settings: 'Paramètres',
  today: 'Aujourd’hui', continueReading: 'Continuer à lire', library: 'Bibliothèque', archive: 'Archive', add: 'Ajouter une ressource',
  all: 'Tout', allLevels: 'Tous niveaux', dayCard: 'Ta carte du jour', startActivity: 'Commencer l’activité',
  dailyPrompt: 'Le Mur des Mots', save: 'Enregistrer', publish: 'Publier sur le Mur', published: 'Publié — bienvenue sur le Mur.',
  wordGoal: 'mots utilisés', noPush: 'Sans notifications. À ton rythme.',
  homeSubTail: 'une langue, vécue chaque jour.',
  cardTitle: '8 mots attendent de devenir tes mots.', cardBody: 'Écris librement avec les mots qui comptent pour toi aujourd’hui. Pas d’écran de révision, pas de pression.',
  quietTitle: 'Reste naturel.', progressDone: 'terminé',
  emptyTitle: 'Pas encore de ressources', emptyHint: 'Importe ton premier texte pour commencer à lire.',
  librarySub: 'Chaque texte est un endroit où rester un peu plus longtemps.',
  writingSub: 'Écris un petit monde avec au moins cinq des mots vivants du jour.', writingBadge: '8 mots · sans pression',
  nudge: 'UN COUP DE POUCE', nudgeTitle: 'Il n’y a pas de première ligne parfaite.',
  nudgeBody: 'Laisse les mots rencontrer un souvenir, une opinion, ou un petit bout d’aujourd’hui.',
  editorPlaceholder: 'Commence là où tu es…', wordsCounter: 'mots',
  wallToday: 'LE MUR · AUJOURD’HUI', wallTitle: '« Un petit début. »', wallFallback: 'Tes mots ont rejoint le mur du jour.', cosign: '♡ Co-signer',
  addEyebrow: 'BIBLIOTHÈQUE PERSONNELLE', addTitle: 'Ajoute un texte que tu veux garder.',
  addSub: 'Importe un fichier ou colle un lien. Les paragraphes restent intacts.',
  pickFile: 'Choisir un fichier', orUrl: 'ou colle une URL',
  importError: 'Impossible de lire cette URL automatiquement. Copie le texte de la page et colle-le ci-dessous.',
  pastePlaceholder: 'Colle le texte ici…', createResource: 'Créer la ressource', pasteLink: '… ou colle directement un texte',
  pastedTitle: 'Texte collé', difficultyLabel: 'Difficulté', auto: 'Automatique', categoryLabel: 'Catégorie',
  newCategory: 'Nouvelle catégorie', manageCategories: 'Gérer les catégories', categoryName: 'Nom de la catégorie', doneLabel: 'Terminé',
  difficulty: { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé', native: 'Natif' },
  categories: { story: 'Histoire', article: 'Article', culture: 'Culture', script: 'Script', book: 'Livre', news: 'Actualités', scientific: 'Scientifique' },
}

const en: AppCopy = {
  onboardTitleA: 'Learn by', onboardTitleB: 'living the language.',
  onboardIntro: 'Natural practice, without pressure or a placement test.',
  start: 'Get started', name: 'Your first name', nameHint: 'What should we call you?',
  interfaceQuestion: 'Which interface language do you want to choose?',
  learningLanguageQuestion: 'Which language do you want to learn?',
  resumeWhereYouLeftOff: 'Pick up where you left off',
  viewAll: 'View all',
  yourJournal: 'Your journal',
  openAction: 'Open',
  noSpeakingSessions: 'No recordings yet.',
  startSpeakingSession: 'Start a session',
  welcome: 'Welcome', darkMode: 'Dark mode', collapseSidebar: 'Collapse sidebar', expandSidebar: 'Expand sidebar', lightMode: 'Light mode', roleLabel: 'Everyday learner', home: 'Home', reading: 'Read', speaking: 'Speak', writing: 'Write', exercises: 'Exercises', seeMore: 'See more', seeLess: 'See less', settings: 'Settings',
  today: 'Today', continueReading: 'Keep reading', library: 'Library', archive: 'Archive', add: 'Add a resource',
  all: 'All', allLevels: 'All levels', dayCard: 'Your card for today', startActivity: 'Start activity',
  dailyPrompt: 'The Word Wall', save: 'Save', publish: 'Publish to the Wall', published: 'Published — welcome to the Wall.',
  wordGoal: 'words used', noPush: 'No notifications. At your pace.',
  homeSubTail: 'one language, lived every day.',
  cardTitle: '8 words are waiting to become your words.', cardBody: 'Write freely with the words that matter to you today. No review screen, no pressure.',
  quietTitle: 'Keep it natural.', progressDone: 'complete',
  emptyTitle: 'No resources yet', emptyHint: 'Import your first text to start reading.',
  librarySub: 'Every text is a place to stay a little longer.',
  writingSub: 'Write a small world with at least five of today’s living words.', writingBadge: '8 words · no pressure',
  nudge: 'A GENTLE NUDGE', nudgeTitle: 'There’s no perfect first line.',
  nudgeBody: 'Let the words meet a memory, an opinion, or a little piece of today.',
  editorPlaceholder: 'Start wherever you are…', wordsCounter: 'words',
  wallToday: 'THE WALL · TODAY', wallTitle: '“A small beginning.”', wallFallback: 'Your words have joined today’s wall.', cosign: '♡ Co-sign',
  addEyebrow: 'PERSONAL LIBRARY', addTitle: 'Add a text you want to keep.',
  addSub: 'Import a file or paste a link. Paragraphs stay intact.',
  pickFile: 'Pick a file', orUrl: 'or paste a URL',
  importError: 'Could not read this URL automatically. Copy the page text and paste it below.',
  pastePlaceholder: 'Paste the text here…', createResource: 'Create resource', pasteLink: '… or paste a text directly',
  pastedTitle: 'Pasted text', difficultyLabel: 'Difficulty', auto: 'Automatic', categoryLabel: 'Category',
  newCategory: 'New category', manageCategories: 'Manage categories', categoryName: 'Category name', doneLabel: 'Done',
  difficulty: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', native: 'Native' },
  categories: { story: 'Story', article: 'Article', culture: 'Culture', script: 'Script', book: 'Book', news: 'News', scientific: 'Scientific' },
}

const es: AppCopy = {
  onboardTitleA: 'Aprende', onboardTitleB: 'viviendo el idioma.',
  onboardIntro: 'Práctica natural, sin presión ni prueba de nivel.',
  start: 'Empezar', name: 'Tu nombre', nameHint: '¿Cómo te llamamos?',
  interfaceQuestion: '¿Qué idioma de interfaz quieres elegir?',
  learningLanguageQuestion: '¿Qué idioma quieres aprender?',
  resumeWhereYouLeftOff: 'Retoma donde lo dejaste',
  viewAll: 'Ver todo',
  yourJournal: 'Tu cuaderno',
  openAction: 'Abrir',
  noSpeakingSessions: 'No hay grabaciones todavía.',
  startSpeakingSession: 'Iniciar una sesión',
  welcome: 'Bienvenido', darkMode: 'Modo oscuro', collapseSidebar: 'Reducir la barra lateral', expandSidebar: 'Ampliar la barra lateral', lightMode: 'Modo claro', roleLabel: 'Aprendiz cotidiano', home: 'Inicio', reading: 'Leer', speaking: 'Hablar', writing: 'Escribir', exercises: 'Ejercicios', seeMore: 'Ver más', seeLess: 'Ver menos', settings: 'Ajustes',
  today: 'Hoy', continueReading: 'Seguir leyendo', library: 'Biblioteca', archive: 'Archivo', add: 'Añadir un recurso',
  all: 'Todo', allLevels: 'Todos los niveles', dayCard: 'Tu tarjeta del día', startActivity: 'Empezar la actividad',
  dailyPrompt: 'El Muro de Palabras', save: 'Guardar', publish: 'Publicar en el Muro', published: 'Publicado — bienvenido al Muro.',
  wordGoal: 'palabras usadas', noPush: 'Sin notificaciones. A tu ritmo.',
  homeSubTail: 'un idioma, vivido cada día.',
  cardTitle: '8 palabras esperan convertirse en tus palabras.', cardBody: 'Escribe libremente con las palabras que te importan hoy. Sin pantalla de repaso, sin presión.',
  quietTitle: 'Que sea natural.', progressDone: 'completado',
  emptyTitle: 'Aún no hay recursos', emptyHint: 'Importa tu primer texto para empezar a leer.',
  librarySub: 'Cada texto es un lugar donde quedarse un poco más.',
  writingSub: 'Escribe un pequeño mundo con al menos cinco de las palabras vivas de hoy.', writingBadge: '8 palabras · sin presión',
  nudge: 'UN PEQUEÑO EMPUJÓN', nudgeTitle: 'No existe la primera línea perfecta.',
  nudgeBody: 'Deja que las palabras encuentren un recuerdo, una opinión o un pedacito de hoy.',
  editorPlaceholder: 'Empieza donde estés…', wordsCounter: 'palabras',
  wallToday: 'EL MURO · HOY', wallTitle: '«Un pequeño comienzo.»', wallFallback: 'Tus palabras se han unido al muro de hoy.', cosign: '♡ Firmar',
  addEyebrow: 'BIBLIOTECA PERSONAL', addTitle: 'Añade un texto que quieras guardar.',
  addSub: 'Importa un archivo o pega un enlace. Los párrafos se mantienen intactos.',
  pickFile: 'Elegir un archivo', orUrl: 'o pega una URL',
  importError: 'No se pudo leer esta URL automáticamente. Copia el texto de la página y pégalo abajo.',
  pastePlaceholder: 'Pega el texto aquí…', createResource: 'Crear el recurso', pasteLink: '… o pega un texto directamente',
  pastedTitle: 'Texto pegado', difficultyLabel: 'Dificultad', auto: 'Automático', categoryLabel: 'Categoría',
  newCategory: 'Nueva categoría', manageCategories: 'Gestionar las categorías', categoryName: 'Nombre de la categoría', doneLabel: 'Listo',
  difficulty: { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado', native: 'Nativo' },
  categories: { story: 'Historia', article: 'Artículo', culture: 'Cultura', script: 'Guión', book: 'Libro', news: 'Noticias', scientific: 'Científico' },
}

const zh: AppCopy = {
  onboardTitleA: '在生活中', onboardTitleB: '学会语言。',
  onboardIntro: '自然练习，没有压力，也没有分级测试。',
  start: '开始', name: '你的名字', nameHint: '我们该怎么称呼你？',
  interfaceQuestion: '你想选择哪种界面语言？',
  learningLanguageQuestion: '你想学习哪种语言？',
  resumeWhereYouLeftOff: '从上次停下的地方继续',
  viewAll: '查看全部',
  yourJournal: '你的笔记本',
  openAction: '打开',
  noSpeakingSessions: '暂无录音记录。',
  startSpeakingSession: '开始口语练习',
  welcome: '欢迎', darkMode: '深色模式', collapseSidebar: '收起侧边栏', expandSidebar: '展开侧边栏', lightMode: '浅色模式', roleLabel: '日常学习者', home: '首页', reading: '阅读', speaking: '口语', writing: '写作', exercises: '练习', seeMore: '查看更多', seeLess: '收起', settings: '设置',
  today: '今天', continueReading: '继续阅读', library: '书库', archive: '归档', add: '添加资源',
  all: '全部', allLevels: '所有级别', dayCard: '今日卡片', startActivity: '开始活动',
  dailyPrompt: '单词墙', save: '保存', publish: '发布到单词墙', published: '已发布——欢迎来到单词墙。',
  wordGoal: '个已用单词', noPush: '没有通知，按你的节奏来。',
  homeSubTail: '一门语言，活在当下。',
  cardTitle: '8 个单词，等着成为你的词。', cardBody: '用今天对你重要的词自由写作。没有复习页面，没有压力。',
  quietTitle: '保持自然。', progressDone: '已完成',
  emptyTitle: '还没有资源', emptyHint: '导入你的第一篇文本，开始阅读。',
  librarySub: '每一篇文字，都是值得多停留一会儿的地方。',
  writingSub: '用今天至少五个活单词，写一个小世界。', writingBadge: '8 个单词 · 没有压力',
  nudge: '温柔的提醒', nudgeTitle: '没有完美的第一行。',
  nudgeBody: '让这些词遇见一段回忆、一个观点，或今天的一小块碎片。',
  editorPlaceholder: '从你所在的地方开始……', wordsCounter: '字',
  wallToday: '单词墙 · 今天', wallTitle: '「一个小小的开始。」', wallFallback: '你的文字已经加入今天的单词墙。', cosign: '♡ 联署',
  addEyebrow: '个人书库', addTitle: '添加一篇你想保存的文字。',
  addSub: '导入文件或粘贴链接，段落保持完整。',
  pickFile: '选择文件', orUrl: '或粘贴链接',
  importError: '无法自动读取此链接。请复制页面文字并粘贴到下方。',
  pastePlaceholder: '把文字粘贴到这里……', createResource: '创建资源', pasteLink: '……或直接粘贴文字',
  pastedTitle: '粘贴的文字', difficultyLabel: '难度', auto: '自动', categoryLabel: '分类',
  newCategory: '新建分类', manageCategories: '管理分类', categoryName: '分类名称', doneLabel: '完成',
  difficulty: { beginner: '初级', intermediate: '中级', advanced: '高级', native: '母语' },
  categories: { story: '故事', article: '文章', culture: '文化', script: '剧本', book: '书籍', news: '新闻', scientific: '科普' },
}

const ru: AppCopy = {
  onboardTitleA: 'Учись,', onboardTitleB: 'живя языком.',
  onboardIntro: 'Естественная практика, без давления и теста на уровень.',
  start: 'Начать', name: 'Твоё имя', nameHint: 'Как к тебе обращаться?',
  interfaceQuestion: 'Какой язык интерфейса выбрать?',
  learningLanguageQuestion: 'Какой язык ты хочешь учить?',
  resumeWhereYouLeftOff: 'Продолжить с того места, где остановился',
  viewAll: 'Посмотреть всё',
  yourJournal: 'Твой блокнот',
  openAction: 'Открыть',
  noSpeakingSessions: 'Записей пока нет.',
  startSpeakingSession: 'Начать сессию',
  welcome: 'Добро пожаловать', darkMode: 'Тёмная тема', collapseSidebar: 'Свернуть панель', expandSidebar: 'Развернуть панель', lightMode: 'Светлая тема', roleLabel: 'Учусь каждый день', home: 'Главная', reading: 'Читать', speaking: 'Говорить', writing: 'Писать', exercises: 'Упражнения', seeMore: 'Показать ещё', seeLess: 'Свернуть', settings: 'Настройки',
  today: 'Сегодня', continueReading: 'Продолжить чтение', library: 'Библиотека', archive: 'Архив', add: 'Добавить ресурс',
  all: 'Все', allLevels: 'Все уровни', dayCard: 'Твоя карточка дня', startActivity: 'Начать занятие',
  dailyPrompt: 'Стена слов', save: 'Сохранить', publish: 'Опубликовать на Стене', published: 'Опубликовано — добро пожаловать на Стену.',
  wordGoal: 'слов использовано', noPush: 'Без уведомлений. В твоём темпе.',
  homeSubTail: 'один язык, прожитый каждый день.',
  cardTitle: '8 слов ждут, чтобы стать твоими словами.', cardBody: 'Пиши свободно словами, которые важны тебе сегодня. Без экрана повторения, без давления.',
  quietTitle: 'Всё естественно.', progressDone: 'пройдено',
  emptyTitle: 'Пока нет ресурсов', emptyHint: 'Импортируй первый текст, чтобы начать читать.',
  librarySub: 'Каждый текст — место, где хочется остаться подольше.',
  writingSub: 'Напиши маленький мир хотя бы с пятью сегодняшними живыми словами.', writingBadge: '8 слов · без давления',
  nudge: 'МЯГКИЙ ТОЛЧОК', nudgeTitle: 'Идеальной первой строки не существует.',
  nudgeBody: 'Пусть слова встретятся с воспоминанием, мнением или кусочком сегодняшнего дня.',
  editorPlaceholder: 'Начни с того, где ты есть…', wordsCounter: 'слов',
  wallToday: 'СТЕНА · СЕГОДНЯ', wallTitle: '«Маленькое начало.»', wallFallback: 'Твои слова присоединились к сегодняшней стене.', cosign: '♡ Подписать',
  addEyebrow: 'ЛИЧНАЯ БИБЛИОТЕКА', addTitle: 'Добавь текст, который хочешь сохранить.',
  addSub: 'Импортируй файл или вставь ссылку. Абзацы останутся нетронутыми.',
  pickFile: 'Выбрать файл', orUrl: 'или вставь ссылку',
  importError: 'Не удалось автоматически прочитать эту ссылку. Скопируй текст со страницы и вставь ниже.',
  pastePlaceholder: 'Вставь текст сюда…', createResource: 'Создать ресурс', pasteLink: '… или вставь текст напрямую',
  pastedTitle: 'Вставленный текст', difficultyLabel: 'Сложность', auto: 'Авто', categoryLabel: 'Категория',
  newCategory: 'Новая категория', manageCategories: 'Управление категориями', categoryName: 'Название категории', doneLabel: 'Готово',
  difficulty: { beginner: 'Начальный', intermediate: 'Средний', advanced: 'Продвинутый', native: 'Родной' },
  categories: { story: 'История', article: 'Статья', culture: 'Культура', script: 'Сценарий', book: 'Книга', news: 'Новости', scientific: 'Научный' },
}

const pt: AppCopy = {
  onboardTitleA: 'Aprende', onboardTitleB: 'a viver a língua.',
  onboardIntro: 'Prática natural, sem pressão nem teste de nível.',
  start: 'Começar', name: 'O teu nome', nameHint: 'Como podemos chamar-te?',
  interfaceQuestion: 'Que língua de interface queres escolher?',
  learningLanguageQuestion: 'Que língua queres aprender?',
  resumeWhereYouLeftOff: 'Retomar onde ficaste',
  viewAll: 'Ver tudo',
  yourJournal: 'O teu caderno',
  openAction: 'Abrir',
  noSpeakingSessions: 'Nenhuma gravação ainda.',
  startSpeakingSession: 'Iniciar uma sessão',
  welcome: 'Bem-vindo', darkMode: 'Modo escuro', collapseSidebar: 'Recolher a barra lateral', expandSidebar: 'Expandir a barra lateral', lightMode: 'Modo claro', roleLabel: 'Aprendiz do dia a dia', home: 'Início', reading: 'Ler', speaking: 'Falar', writing: 'Escrever', exercises: 'Exercícios', seeMore: 'Ver mais', seeLess: 'Ver menos', settings: 'Definições',
  today: 'Hoje', continueReading: 'Continuar a ler', library: 'Biblioteca', archive: 'Arquivo', add: 'Adicionar um recurso',
  all: 'Tudo', allLevels: 'Todos os níveis', dayCard: 'O teu cartão do dia', startActivity: 'Começar a atividade',
  dailyPrompt: 'O Muro das Palavras', save: 'Guardar', publish: 'Publicar no Muro', published: 'Publicado — bem-vindo ao Muro.',
  wordGoal: 'palavras usadas', noPush: 'Sem notificações. Ao teu ritmo.',
  homeSubTail: 'uma língua, vivida todos os dias.',
  cardTitle: '8 palavras esperam tornar-se tuas.', cardBody: 'Escreve livremente com as palavras que te importam hoje. Sem ecrã de revisão, sem pressão.',
  quietTitle: 'Mantém natural.', progressDone: 'concluído',
  emptyTitle: 'Ainda sem recursos', emptyHint: 'Importa o teu primeiro texto para começar a ler.',
  librarySub: 'Cada texto é um lugar onde ficar um pouco mais.',
  writingSub: 'Escreve um pequeno mundo com pelo menos cinco das palavras vivas de hoje.', writingBadge: '8 palavras · sem pressão',
  nudge: 'UM EMPURRÃO GENTIL', nudgeTitle: 'Não existe uma primeira linha perfeita.',
  nudgeBody: 'Deixa as palavras encontrarem uma memória, uma opinião ou um pedacinho de hoje.',
  editorPlaceholder: 'Começa onde estiveres…', wordsCounter: 'palavras',
  wallToday: 'O MURO · HOJE', wallTitle: '«Um pequeno começo.»', wallFallback: 'As tuas palavras juntaram-se ao muro de hoje.', cosign: '♡ Assinar',
  addEyebrow: 'BIBLIOTECA PESSOAL', addTitle: 'Adiciona um texto que queiras guardar.',
  addSub: 'Importa um ficheiro ou cola um link. Os parágrafos ficam intactos.',
  pickFile: 'Escolher um ficheiro', orUrl: 'ou cola um URL',
  importError: 'Não foi possível ler este URL automaticamente. Copia o texto da página e cola-o abaixo.',
  pastePlaceholder: 'Cola o texto aqui…', createResource: 'Criar o recurso', pasteLink: '… ou cola um texto diretamente',
  pastedTitle: 'Texto colado', difficultyLabel: 'Dificuldade', auto: 'Automático', categoryLabel: 'Categoria',
  newCategory: 'Nova categoria', manageCategories: 'Gerir categorias', categoryName: 'Nome da categoria', doneLabel: 'Concluído',
  difficulty: { beginner: 'Iniciante', intermediate: 'Intermédio', advanced: 'Avançado', native: 'Nativo' },
  categories: { story: 'História', article: 'Artigo', culture: 'Cultura', script: 'Guião', book: 'Livro', news: 'Notícias', scientific: 'Científico' },
}

export const copy: Record<UiLanguage, AppCopy> = { fr, en, es, zh, ru, pt }

// ---------------------------------------------------------------------------
// Reader labels
// ---------------------------------------------------------------------------

export type ReaderCopy = {
  back: string
  previous: string
  next: string
  wordsPerPage: string
  progress: string
  renameHint: string
  editText: string
  doneEditing: string
  saveText: string
  deleteResource: string
  confirmDelete: string
  cancel: string
  teacherMode: string
  focus: string
  chapterDefault: string
  marking: string
  marks: { verb: string; noun: string; adjective: string; adverb: string; expression: string; [key: string]: string }
  silentLetter: string
  addMarking: string
  newMarking: string
  markingName: string
  markingNamePlaceholder: string
  createMarking: string
  rename: string
  delete: string
  colorAlreadyUsed: string
  customColor: string
  hexCode: string
  moveUp: string
  moveDown: string
  styleHighlight: string
  styleUnderline: string
  styleOverlay: string
  markHintWord: string
  markHintSilent: string
  coverReset: string
  coverChange: string
  chapterRename: string
  wordLabel: string
  parentLabel: string
  pronunciationLabel: string
  translationLabel: string
  tagLabel: string
  tags: { noun: string; verb: string; adjective: string; adverb: string; expression: string; other: string }
  knowledgeLabel: string
  knownByHeart: string
  contextLabel: string
  linkedWordsLabel: string
  linkedWordsSingular: string
  linkedWordsPlural: string
  addLinkedWord: string
  referenceWordLabel: string
  grammaticalFormsLabel: string
  derivedWordsLabel: string
  relationTypeLabel: string
  relationGrammaticalForm: string
  relationDerivative: string
  noLinkedWords: string
  newLinkedWordTitle: string
  setAsReferenceTooltip: string
  openLinkedWord: string
  saveWord: string
  savedWord: string
  editWord: string
  wikiOpen: string
  focusHint: string
  focusExit: string
  resetFormatting: string
  resetTeacherMode: string
  backToLibrary: string
}

const frReader: ReaderCopy = {
  back: '← Bibliothèque', previous: '←', next: '→', wordsPerPage: 'mots / page',
  progress: 'Progression', renameHint: 'Clique sur le titre ou la couverture pour les modifier',
  editText: 'Modifier le texte', doneEditing: 'Terminer', saveText: 'Enregistrer le texte',
  deleteResource: 'Supprimer la ressource', confirmDelete: 'Confirmer la suppression ?', cancel: 'Annuler',
  teacherMode: 'Teacher Mode', focus: 'Learning Focus',
  chapterDefault: 'Chapitre',
  marking: 'Marquage',
  marks: { verb: 'Verbe', noun: 'Nom', adjective: 'Adjectif', adverb: 'Adverbe', expression: 'Expression' },
  silentLetter: 'Lettre muette',
  addMarking: 'Marquage',
  newMarking: 'Nouveau marquage',
  markingName: 'Nom du marquage',
  markingNamePlaceholder: 'ex. Proposition, Connecteur...',
  createMarking: 'Créer le marquage',
  rename: 'Renommer',
  delete: 'Supprimer',
  colorAlreadyUsed: 'Couleur déjà utilisée',
  customColor: 'Couleur personnalisée',
  hexCode: 'Code #hex',
  moveUp: 'Monter',
  moveDown: 'Descendre',
  styleHighlight: 'Surligné', styleUnderline: 'Souligné', styleOverlay: 'Surbrillance',
  markHintWord: 'Clique sur un mot pour le marquer. Re-clique pour retirer.',
  markHintSilent: 'Clique sur une lettre pour la griser. Re-clique pour la rétablir.',
  coverReset: 'Couverture par défaut', coverChange: 'Changer la couverture', chapterRename: 'Cliquer pour renommer le chapitre',
  wordLabel: 'Mot', parentLabel: 'Mot de référence',
  pronunciationLabel: 'Prononciation',
  translationLabel: 'Traduction',
  tagLabel: 'Tag',
  tags: { noun: 'Nom', verb: 'Verbe', adjective: 'Adjectif', adverb: 'Adverbe', expression: 'Expression', other: 'Autre' },
  knowledgeLabel: 'Niveau de connaissance', knownByHeart: 'Connu par cœur',
  contextLabel: 'Phrase d’origine',
  linkedWordsLabel: 'Mots liés',
  linkedWordsSingular: 'Voir mot lié',
  linkedWordsPlural: 'Voir mots liés',
  addLinkedWord: 'Ajouter un mot lié',
  referenceWordLabel: 'Mot de référence',
  grammaticalFormsLabel: 'Formes grammaticales',
  derivedWordsLabel: 'Mots dérivés',
  relationTypeLabel: 'Type de relation',
  relationGrammaticalForm: 'Forme grammaticale',
  relationDerivative: 'Mot dérivé',
  noLinkedWords: 'Aucun mot lié pour le moment',
  newLinkedWordTitle: 'Nouveau mot lié',
  setAsReferenceTooltip: 'Définir ce nouveau mot comme mot de référence',
  openLinkedWord: 'Ouvrir la fiche de ce mot',
  saveWord: 'Enregistrer le mot', savedWord: '✓ Enregistré', editWord: 'Modifier',
  wikiOpen: 'Dictionnaire : active puis clique sur un mot',
  focusHint: 'Clique sur un mot pour noter sa traduction, son mot de référence et sa prononciation.',
  focusExit: 'Quitter le plein écran',
  resetFormatting: 'Réinitialiser le formatage',
  resetTeacherMode: 'Réinitialiser le Teacher Mode',
  backToLibrary: 'Revenir à la bibliothèque',
}

const enReader: ReaderCopy = {
  back: '← Library', previous: '←', next: '→', wordsPerPage: 'words / page',
  progress: 'Progress', renameHint: 'Click the title or the cover to change them',
  editText: 'Edit text', doneEditing: 'Done', saveText: 'Save text',
  deleteResource: 'Delete resource', confirmDelete: 'Really delete this resource?', cancel: 'Cancel',
  teacherMode: 'Teacher Mode', focus: 'Learning Focus',
  chapterDefault: 'Chapter',
  marking: 'Marking',
  marks: { verb: 'Verb', noun: 'Noun', adjective: 'Adjective', adverb: 'Adverb', expression: 'Expression' },
  silentLetter: 'Silent letter',
  addMarking: 'Marking',
  newMarking: 'New Marking',
  markingName: 'Marking name',
  markingNamePlaceholder: 'e.g. Clause, Connector...',
  createMarking: 'Create marking',
  rename: 'Rename',
  delete: 'Delete',
  colorAlreadyUsed: 'Color already used',
  customColor: 'Custom color',
  hexCode: '#hex code',
  moveUp: 'Move up',
  moveDown: 'Move down',
  styleHighlight: 'Highlight', styleUnderline: 'Underline', styleOverlay: 'Overlay',
  markHintWord: 'Click a word to mark it. Click again to remove.',
  markHintSilent: 'Click a letter to grey it out. Click again to restore.',
  coverReset: 'Default cover', coverChange: 'Change cover', chapterRename: 'Click to rename the chapter',
  wordLabel: 'Word', parentLabel: 'Reference word',
  pronunciationLabel: 'Pronunciation',
  translationLabel: 'Translation',
  tagLabel: 'Tag',
  tags: { noun: 'Noun', verb: 'Verb', adjective: 'Adjective', adverb: 'Adverb', expression: 'Expression', other: 'Other' },
  knowledgeLabel: 'Knowledge level', knownByHeart: 'Known by heart',
  contextLabel: 'Source sentence',
  linkedWordsLabel: 'Linked words',
  linkedWordsSingular: 'See linked word',
  linkedWordsPlural: 'See linked words',
  addLinkedWord: 'Add linked word',
  referenceWordLabel: 'Reference word',
  grammaticalFormsLabel: 'Grammatical forms',
  derivedWordsLabel: 'Derived words',
  relationTypeLabel: 'Relation type',
  relationGrammaticalForm: 'Grammatical form',
  relationDerivative: 'Derived word',
  noLinkedWords: 'No linked words yet',
  newLinkedWordTitle: 'New linked word',
  setAsReferenceTooltip: 'Set this new word as reference word',
  openLinkedWord: 'Open this word’s card',
  saveWord: 'Save word', savedWord: '✓ Saved', editWord: 'Edit',
  wikiOpen: 'Dictionary: toggle on, then click a word',
  focusHint: 'Click a word to note its translation, reference word and pronunciation.',
  focusExit: 'Exit fullscreen',
  resetFormatting: 'Reset formatting',
  resetTeacherMode: 'Reset Teacher Mode',
  backToLibrary: 'Back to library',
}

const esReader: ReaderCopy = {
  back: '← Biblioteca', previous: '←', next: '→', wordsPerPage: 'palabras / página',
  progress: 'Progreso', renameHint: 'Haz clic en el título o la portada para modificarlos',
  editText: 'Editar el texto', doneEditing: 'Terminar', saveText: 'Guardar el texto',
  deleteResource: 'Eliminar el recurso', confirmDelete: '¿Eliminar este recurso?', cancel: 'Cancelar',
  teacherMode: 'Teacher Mode', focus: 'Learning Focus',
  chapterDefault: 'Capítulo',
  marking: 'Marcado',
  marks: { verb: 'Verbo', noun: 'Sustantivo', adjective: 'Adjetivo', adverb: 'Adverbio', expression: 'Expresión' },
  silentLetter: 'Letra muda',
  addMarking: 'Marcado',
  newMarking: 'Nuevo marcado',
  markingName: 'Nombre del marcado',
  markingNamePlaceholder: 'ej. Proposición, Conector...',
  createMarking: 'Crear marcado',
  rename: 'Renombrar',
  delete: 'Eliminar',
  colorAlreadyUsed: 'Color ya utilizado',
  customColor: 'Color personalizado',
  hexCode: 'Código #hex',
  moveUp: 'Subir',
  moveDown: 'Bajar',
  styleHighlight: 'Resaltado', styleUnderline: 'Subrayado', styleOverlay: 'Sobrescrito',
  markHintWord: 'Haz clic en una palabra para marcarla. Haz clic de nuevo para quitarla.',
  markHintSilent: 'Haz clic en una letra para atenuarla. Haz clic de nuevo para restaurarla.',
  coverReset: 'Portada por defecto', coverChange: 'Cambiar la portada', chapterRename: 'Haz clic para renombrar el capítulo',
  wordLabel: 'Palabra', parentLabel: 'Palabra de referencia',
  pronunciationLabel: 'Pronunciación',
  translationLabel: 'Traducción',
  tagLabel: 'Etiqueta',
  tags: { noun: 'Sustantivo', verb: 'Verbo', adjective: 'Adjetivo', adverb: 'Adverbio', expression: 'Expresión', other: 'Otro' },
  knowledgeLabel: 'Nivel de conocimiento', knownByHeart: 'Aprendido de memoria',
  contextLabel: 'Frase de origen',
  linkedWordsLabel: 'Palabras vinculadas',
  linkedWordsSingular: 'Ver palabra vinculada',
  linkedWordsPlural: 'Ver palabras vinculadas',
  addLinkedWord: 'Añadir palabra vinculada',
  referenceWordLabel: 'Palabra de referencia',
  grammaticalFormsLabel: 'Formas gramaticales',
  derivedWordsLabel: 'Palabras derivadas',
  relationTypeLabel: 'Tipo de relación',
  relationGrammaticalForm: 'Forma gramatical',
  relationDerivative: 'Palabra derivada',
  noLinkedWords: 'Sin palabras vinculadas por ahora',
  newLinkedWordTitle: 'Nueva palabra vinculada',
  setAsReferenceTooltip: 'Establecer esta nueva palabra como palabra de referencia',
  openLinkedWord: 'Abrir la ficha de esta palabra',
  saveWord: 'Guardar palabra', savedWord: '✓ Guardado', editWord: 'Editar',
  wikiOpen: 'Diccionario: actívalo y haz clic en una palabra',
  focusHint: 'Haz clic en una palabra para anotar su traducción, su palabra de referencia y su pronunciación.',
  focusExit: 'Salir de pantalla completa',
  resetFormatting: 'Restablecer formato',
  resetTeacherMode: 'Restablecer Teacher Mode',
  backToLibrary: 'Volver a la biblioteca',
}

const zhReader: ReaderCopy = {
  back: '← 书库', previous: '←', next: '→', wordsPerPage: '词 / 页',
  progress: '进度', renameHint: '点击标题或封面即可修改',
  editText: '编辑文字', doneEditing: '完成', saveText: '保存文字',
  deleteResource: '删除资源', confirmDelete: '确定删除这个资源吗？', cancel: '取消',
  teacherMode: 'Teacher Mode', focus: 'Learning Focus',
  chapterDefault: '章节',
  marking: '标记',
  marks: { verb: '动词', noun: '名词', adjective: '形容词', adverb: '副词', expression: '表达' },
  silentLetter: '不发音字母',
  addMarking: '标记',
  newMarking: '新建标记',
  markingName: '标记名称',
  markingNamePlaceholder: '例如：从句、连接词...',
  createMarking: '创建标记',
  rename: '重命名',
  delete: '删除',
  colorAlreadyUsed: '颜色已被使用',
  customColor: '自定义颜色',
  hexCode: '#hex 代码',
  moveUp: '上移',
  moveDown: '下移',
  styleHighlight: '高亮', styleUnderline: '下划线', styleOverlay: '覆盖色',
  markHintWord: '点击单词进行标记，再次点击取消。',
  markHintSilent: '点击字母将其变灰，再次点击恢复。',
  coverReset: '默认封面', coverChange: '更换封面', chapterRename: '点击重命名章节',
  wordLabel: '单词', parentLabel: '参考词 / 词根',
  pronunciationLabel: '发音',
  translationLabel: '翻译',
  tagLabel: '标签',
  tags: { noun: '名词', verb: '动词', adjective: '形容词', adverb: '副词', expression: '短语', other: '其他' },
  knowledgeLabel: '掌握程度', knownByHeart: '熟记于心',
  contextLabel: '原句',
  linkedWordsLabel: '相关词',
  linkedWordsSingular: '查看关联词',
  linkedWordsPlural: '查看关联词',
  addLinkedWord: '添加关联词',
  referenceWordLabel: '参考词 / 词根',
  grammaticalFormsLabel: '语法形式',
  derivedWordsLabel: '派生词',
  relationTypeLabel: '关系类型',
  relationGrammaticalForm: '语法形式',
  relationDerivative: '派生词',
  noLinkedWords: '暂无关联词',
  newLinkedWordTitle: '新建关联词',
  setAsReferenceTooltip: '将此新词设为参考词',
  openLinkedWord: '打开该词的卡片',
  saveWord: '保存单词', savedWord: '✓ 已保存', editWord: '编辑',
  wikiOpen: '词典：先启用，再点击单词',
  focusHint: '点击单词，记录它的翻译、参考词和发音。',
  focusExit: '退出全屏',
  resetFormatting: '重置格式',
  resetTeacherMode: '重置 Teacher Mode',
  backToLibrary: '返回书库',
}

const ruReader: ReaderCopy = {
  back: '← Библиотека', previous: '←', next: '→', wordsPerPage: 'слов / страница',
  progress: 'Прогресс', renameHint: 'Нажми на заголовок или обложку, чтобы изменить',
  editText: 'Редактировать текст', doneEditing: 'Готово', saveText: 'Сохранить текст',
  deleteResource: 'Удалить ресурс', confirmDelete: 'Удалить этот ресурс?', cancel: 'Отмена',
  teacherMode: 'Teacher Mode', focus: 'Learning Focus',
  chapterDefault: 'Глава',
  marking: 'Разметка',
  marks: { verb: 'Глагол', noun: 'Существительное', adjective: 'Прилагательное', adverb: 'Наречие', expression: 'Выражение' },
  silentLetter: 'Немая буква',
  addMarking: 'Разметка',
  newMarking: 'Новая разметка',
  markingName: 'Название разметки',
  markingNamePlaceholder: 'напр. Придаточное, Союз...',
  createMarking: 'Создать разметку',
  rename: 'Переименовать',
  delete: 'Удалить',
  colorAlreadyUsed: 'Цвет уже используется',
  customColor: 'Пользовательский цвет',
  hexCode: 'Код #hex',
  moveUp: 'Вверх',
  moveDown: 'Вниз',
  styleHighlight: 'Выделение', styleUnderline: 'Подчёркивание', styleOverlay: 'Заливка',
  markHintWord: 'Нажми на слово, чтобы отметить. Ещё раз — чтобы убрать.',
  markHintSilent: 'Нажми на букву, чтобы сделать её серой. Ещё раз — вернуть.',
  coverReset: 'Обложка по умолчанию', coverChange: 'Сменить обложку', chapterRename: 'Нажми, чтобы переименовать главу',
  wordLabel: 'Слово', parentLabel: 'Опорное слово',
  pronunciationLabel: 'Произношение',
  translationLabel: 'Перевод',
  tagLabel: 'Тег',
  tags: { noun: 'Существительное', verb: 'Глагол', adjective: 'Прилагательное', adverb: 'Наречие', expression: 'Выражение', other: 'Другое' },
  knowledgeLabel: 'Уровень знания', knownByHeart: 'Знаю наизусть',
  contextLabel: 'Исходное предложение',
  linkedWordsLabel: 'Связанные слова',
  linkedWordsSingular: 'Смотреть связанное слово',
  linkedWordsPlural: 'Смотреть связанные слова',
  addLinkedWord: 'Добавить связанное слово',
  referenceWordLabel: 'Опорное слово',
  grammaticalFormsLabel: 'Грамматические формы',
  derivedWordsLabel: 'Производные слова',
  relationTypeLabel: 'Тип связи',
  relationGrammaticalForm: 'Грамматическая форма',
  relationDerivative: 'Производное слово',
  noLinkedWords: 'Пока нет связанных слов',
  newLinkedWordTitle: 'Новое связанное слово',
  setAsReferenceTooltip: 'Сделать это новое слово опорным',
  openLinkedWord: 'Открыть карточку этого слова',
  saveWord: 'Сохранить слово', savedWord: '✓ Сохранено', editWord: 'Изменить',
  wikiOpen: 'Словарь: включи, затем нажми на слово',
  focusHint: 'Нажми на слово, чтобы записать перевод, опорное слово и произношение.',
  focusExit: 'Выйти из полноэкранного режима',
  resetFormatting: 'Сбросить разметку',
  resetTeacherMode: 'Сбросить Teacher Mode',
  backToLibrary: 'Вернуться в библиотеку',
}

const ptReader: ReaderCopy = {
  back: '← Biblioteca', previous: '←', next: '→', wordsPerPage: 'palavras / página',
  progress: 'Progresso', renameHint: 'Clica no título ou na capa para os modificar',
  editText: 'Editar o texto', doneEditing: 'Concluir', saveText: 'Guardar o texto',
  deleteResource: 'Eliminar o recurso', confirmDelete: 'Eliminar este recurso?', cancel: 'Cancelar',
  teacherMode: 'Teacher Mode', focus: 'Learning Focus',
  chapterDefault: 'Capítulo',
  marking: 'Marcação',
  marks: { verb: 'Verbo', noun: 'Nome', adjective: 'Adjetivo', adverb: 'Advérbio', expression: 'Expressão' },
  silentLetter: 'Letra muda',
  addMarking: 'Marcação',
  newMarking: 'Nova marcação',
  markingName: 'Nome da marcação',
  markingNamePlaceholder: 'ex. Oração, Conector...',
  createMarking: 'Criar marcação',
  rename: 'Renomear',
  delete: 'Eliminar',
  colorAlreadyUsed: 'Cor já utilizada',
  customColor: 'Cor personalizada',
  hexCode: 'Código #hex',
  moveUp: 'Subir',
  moveDown: 'Descer',
  styleHighlight: 'Realçado', styleUnderline: 'Sublinhado', styleOverlay: 'Sobreposição',
  markHintWord: 'Clica numa palavra para a marcar. Clica de novo para remover.',
  markHintSilent: 'Clica numa letra para a esbater. Clica de novo para restaurar.',
  coverReset: 'Capa padrão', coverChange: 'Mudar a capa', chapterRename: 'Clica para renomear o capítulo',
  wordLabel: 'Palavra', parentLabel: 'Palavra de referência',
  pronunciationLabel: 'Pronúncia',
  translationLabel: 'Tradução',
  tagLabel: 'Etiqueta',
  tags: { noun: 'Nome', verb: 'Verbo', adjective: 'Adjetivo', adverb: 'Advérbio', expression: 'Expressão', other: 'Outro' },
  knowledgeLabel: 'Nível de conhecimento', knownByHeart: 'Decorado',
  contextLabel: 'Frase de origem',
  linkedWordsLabel: 'Palavras ligadas',
  linkedWordsSingular: 'Ver palavra ligada',
  linkedWordsPlural: 'Ver palavras ligadas',
  addLinkedWord: 'Adicionar palavra ligada',
  referenceWordLabel: 'Palavra de referência',
  grammaticalFormsLabel: 'Formas gramaticais',
  derivedWordsLabel: 'Palavras derivadas',
  relationTypeLabel: 'Tipo de relação',
  relationGrammaticalForm: 'Forma gramatical',
  relationDerivative: 'Palavra derivada',
  noLinkedWords: 'Sem palavras ligadas por enquanto',
  newLinkedWordTitle: 'Nova palavra ligada',
  setAsReferenceTooltip: 'Definir esta nova palavra como palavra de referência',
  openLinkedWord: 'Abrir a ficha desta palavra',
  saveWord: 'Guardar palavra', savedWord: '✓ Guardado', editWord: 'Editar',
  wikiOpen: 'Dicionário: ativa e clica numa palavra',
  focusHint: 'Clica numa palavra para anotar a tradução, a palavra de referência e a pronúncia.',
  focusExit: 'Sair do ecrã inteiro',
  resetFormatting: 'Repor formatação',
  resetTeacherMode: 'Repor Teacher Mode',
  backToLibrary: 'Voltar à biblioteca',
}

export const readerCopy: Record<UiLanguage, ReaderCopy> = {
  fr: frReader, en: enReader, es: esReader, zh: zhReader, ru: ruReader, pt: ptReader,
}

export * from './i18n/teacherCopy'
export * from './i18n/writeCopy'
export * from './i18n/exercisesCopy'
export * from './i18n/settingsCopy'
export * from './i18n/vocabCopy'
export * from './i18n/speakingCopy'
export * from './i18n/resourcesCopy'
