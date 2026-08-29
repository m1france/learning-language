import type { UiLanguage } from '../domain'

export type VocabCopy = {
  searchPlaceholder: string
  allTags: string
  exportAnki: string
  exportAnkiTitle: string
  newWord: string
  close: string
  wordsListTitle: string
  noWordsFound: string
  filterNodesPlaceholder: string
  wordsCount: string
  linksCount: string
  zoomIn: string
  zoomOut: string
  resetView: string
  fullscreen: string
  exitFullscreen: string
  rootWord: string
  masteryKnown: string
  masteryLevel: string
  listenPronunciation: string
  editWord: string
  deleteWord: string
  deleteWordConfirm: string
  saveWordTitle: string
  editWordTitle: string
  wordField: string
  translationField: string
  pronunciationField: string
  referenceWordField: string
  referenceWordPlaceholder: string
  masteryField: string
  associatedTags: string
  addTagPlaceholder: string
  save: string
  cancel: string
  savedPageWordsTitle: string
  savedPageWordsSubtitle: string
  noSavedWordsOnPage: string
  defaultPrompts: {
    neighborhood: { translation: string; context: string }
    glow: { translation: string; context: string }
    usual: { translation: string; context: string }
    corner: { translation: string; context: string }
    exhibit: { translation: string; context: string }
    awake: { translation: string; context: string }
    friendly: { translation: string; context: string }
    remember: { translation: string; context: string }
  }
}

const frVocab: VocabCopy = {
  searchPlaceholder: 'Filtrer par mot, traduction ou racine...',
  allTags: 'Tous',
  exportAnki: 'Export Anki',
  exportAnkiTitle: 'Exporter tout en TSV Anki',
  newWord: 'Nouveau mot',
  close: 'Fermer',
  wordsListTitle: 'Liste des mots',
  noWordsFound: 'Aucun mot ne correspond à ta recherche.',
  filterNodesPlaceholder: 'Filtrer les nœuds...',
  wordsCount: 'mots',
  linksCount: 'liens',
  zoomIn: 'Zoom avant',
  zoomOut: 'Zoom arrière',
  resetView: 'Recentrer la vue',
  fullscreen: 'Plein écran',
  exitFullscreen: 'Quitter le plein écran',
  rootWord: 'Racine :',
  masteryKnown: 'Connu par cœur',
  masteryLevel: 'Niveau de maîtrise :',
  listenPronunciation: 'Écouter la prononciation',
  editWord: 'Modifier',
  deleteWord: 'Supprimer',
  deleteWordConfirm: 'Supprimer définitivement le mot',
  saveWordTitle: 'Enregistrer un mot',
  editWordTitle: 'Modifier le mot',
  wordField: 'Mot ou expression',
  translationField: 'Traduction',
  pronunciationField: 'Prononciation (IPA)',
  referenceWordField: 'Mot de référence / racine (optionnel)',
  referenceWordPlaceholder: 'ex. go (pour went), eat (pour eaten)...',
  masteryField: 'Niveau de maîtrise',
  associatedTags: 'Tags associés',
  addTagPlaceholder: 'Nouveau tag...',
  save: 'Enregistrer',
  cancel: 'Annuler',
  savedPageWordsTitle: 'Mots enregistrés sur cette page',
  savedPageWordsSubtitle: 'analysés et enregistrés par l’IA',
  noSavedWordsOnPage: 'Aucun mot enregistré pour cette page.',
  defaultPrompts: {
    neighborhood: { translation: 'quartier, voisinage', context: 'It is a quiet and friendly neighborhood with lots of green trees.' },
    glow: { translation: 'lueur, briller doucement', context: 'The warm glow of the morning sun lit up the entire room.' },
    usual: { translation: 'habituel, ordinaire', context: 'As usual, she was the first person to arrive at the meeting.' },
    corner: { translation: 'coin, angle', context: 'There is a cozy little coffee shop right around the corner.' },
    exhibit: { translation: 'exposer, pièce d’exposition', context: 'The gallery will exhibit modern paintings and sculptures next week.' },
    awake: { translation: 'éveillé, réveillé', context: 'I stayed awake late into the night, listening to the calm rain.' },
    friendly: { translation: 'amical, chaleureux', context: 'The locals were extremely welcoming and friendly to all visitors.' },
    remember: { translation: 'se souvenir, se rappeler', context: 'I still remember the first day I started learning this language.' },
  },
}

const enVocab: VocabCopy = {
  searchPlaceholder: 'Filter by word, translation, or root...',
  allTags: 'All',
  exportAnki: 'Export Anki',
  exportAnkiTitle: 'Export all to Anki TSV',
  newWord: 'New word',
  close: 'Close',
  wordsListTitle: 'Word list',
  noWordsFound: 'No words match your search.',
  filterNodesPlaceholder: 'Filter graph nodes...',
  wordsCount: 'words',
  linksCount: 'links',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  resetView: 'Recenter view',
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit fullscreen',
  rootWord: 'Root:',
  masteryKnown: 'Mastered',
  masteryLevel: 'Mastery level:',
  listenPronunciation: 'Listen to pronunciation',
  editWord: 'Edit',
  deleteWord: 'Delete',
  deleteWordConfirm: 'Permanently delete word',
  saveWordTitle: 'Save a word',
  editWordTitle: 'Edit word',
  wordField: 'Word or expression',
  translationField: 'Translation',
  pronunciationField: 'Pronunciation (IPA)',
  referenceWordField: 'Reference / root word (optional)',
  referenceWordPlaceholder: 'e.g. go (for went), eat (for eaten)...',
  masteryField: 'Mastery level',
  associatedTags: 'Associated tags',
  addTagPlaceholder: 'New tag...',
  save: 'Save',
  cancel: 'Cancel',
  savedPageWordsTitle: 'Saved words on this page',
  savedPageWordsSubtitle: 'analyzed and saved by AI',
  noSavedWordsOnPage: 'No words saved on this page.',
  defaultPrompts: {
    neighborhood: { translation: 'neighborhood, district', context: 'It is a quiet and friendly neighborhood with lots of green trees.' },
    glow: { translation: 'glow, soft shine', context: 'The warm glow of the morning sun lit up the entire room.' },
    usual: { translation: 'usual, ordinary', context: 'As usual, she was the first person to arrive at the meeting.' },
    corner: { translation: 'corner, angle', context: 'There is a cozy little coffee shop right around the corner.' },
    exhibit: { translation: 'exhibit, show piece', context: 'The gallery will exhibit modern paintings and sculptures next week.' },
    awake: { translation: 'awake, conscious', context: 'I stayed awake late into the night, listening to the calm rain.' },
    friendly: { translation: 'friendly, welcoming', context: 'The locals were extremely welcoming and friendly to all visitors.' },
    remember: { translation: 'remember, recall', context: 'I still remember the first day I started learning this language.' },
  },
}

const esVocab: VocabCopy = {
  searchPlaceholder: 'Filtrar por palabra, traducción o raíz...',
  allTags: 'Todos',
  exportAnki: 'Exportar Anki',
  exportAnkiTitle: 'Exportar todo a TSV Anki',
  newWord: 'Nueva palabra',
  close: 'Cerrar',
  wordsListTitle: 'Lista de palabras',
  noWordsFound: 'Ninguna palabra coincide con tu búsqueda.',
  filterNodesPlaceholder: 'Filtrar nodos...',
  wordsCount: 'palabras',
  linksCount: 'enlaces',
  zoomIn: 'Acercar',
  zoomOut: 'Alejar',
  resetView: 'Recentrar vista',
  fullscreen: 'Pantalla completa',
  exitFullscreen: 'Salir de pantalla completa',
  rootWord: 'Raíz:',
  masteryKnown: 'Dominado por completo',
  masteryLevel: 'Nivel de dominio:',
  listenPronunciation: 'Escuchar pronunciación',
  editWord: 'Editar',
  deleteWord: 'Eliminar',
  deleteWordConfirm: 'Eliminar definitivamente la palabra',
  saveWordTitle: 'Guardar palabra',
  editWordTitle: 'Editar palabra',
  wordField: 'Palabra o expresión',
  translationField: 'Traducción',
  pronunciationField: 'Pronunciación (IPA)',
  referenceWordField: 'Palabra raíz / lema (opcional)',
  referenceWordPlaceholder: 'ej. go (para went), eat (para eaten)...',
  masteryField: 'Nivel de dominio',
  associatedTags: 'Etiquetas asociadas',
  addTagPlaceholder: 'Nueva etiqueta...',
  save: 'Guardar',
  cancel: 'Cancelar',
  savedPageWordsTitle: 'Palabras guardadas en esta página',
  savedPageWordsSubtitle: 'analizadas y guardadas por la IA',
  noSavedWordsOnPage: 'No hay palabras guardadas en esta página.',
  defaultPrompts: {
    neighborhood: { translation: 'barrio, vecindario', context: 'It is a quiet and friendly neighborhood with lots of green trees.' },
    glow: { translation: 'resplandor, brillo suave', context: 'The warm glow of the morning sun lit up the entire room.' },
    usual: { translation: 'habitual, ordinario', context: 'As usual, she was the first person to arrive at the meeting.' },
    corner: { translation: 'esquina, rincón', context: 'There is a cozy little coffee shop right around the corner.' },
    exhibit: { translation: 'exhibir, pieza de exposición', context: 'The gallery will exhibit modern paintings and sculptures next week.' },
    awake: { translation: 'despierto, desvelado', context: 'I stayed awake late into the night, listening to the calm rain.' },
    friendly: { translation: 'amigable, acogedor', context: 'The locals were extremely welcoming and friendly to all visitors.' },
    remember: { translation: 'recordar, acordarse', context: 'I still remember the first day I started learning this language.' },
  },
}

const zhVocab: VocabCopy = {
  searchPlaceholder: '按单词、翻译或词根筛选...',
  allTags: '全部',
  exportAnki: '导出 Anki',
  exportAnkiTitle: '全量导出为 Anki TSV',
  newWord: '新增单词',
  close: '关闭',
  wordsListTitle: '词汇列表',
  noWordsFound: '未找到匹配的单词。',
  filterNodesPlaceholder: '筛选图谱节点...',
  wordsCount: '个词',
  linksCount: '条关联',
  zoomIn: '放大',
  zoomOut: '缩小',
  resetView: '重置视角',
  fullscreen: '全屏',
  exitFullscreen: '退出全屏',
  rootWord: '词根：',
  masteryKnown: '已完全掌握',
  masteryLevel: '熟练度：',
  listenPronunciation: '播放发音',
  editWord: '编辑',
  deleteWord: '删除',
  deleteWordConfirm: '永久删除此单词',
  saveWordTitle: '保存新单词',
  editWordTitle: '编辑单词',
  wordField: '单词或短语',
  translationField: '中文翻译',
  pronunciationField: 'IPA 国际音标',
  referenceWordField: '词根 / 原型词（可选）',
  referenceWordPlaceholder: '例如：go（went 的原型）、eat（eaten 的原型）...',
  masteryField: '熟练度等级',
  associatedTags: '关联标签',
  addTagPlaceholder: '新标签...',
  save: '保存',
  cancel: '取消',
  savedPageWordsTitle: '本页已记录词汇',
  savedPageWordsSubtitle: '经 AI 智能解析并入库',
  noSavedWordsOnPage: '当前页面暂无已保存单词。',
  defaultPrompts: {
    neighborhood: { translation: '街区，邻里', context: 'It is a quiet and friendly neighborhood with lots of green trees.' },
    glow: { translation: '微光，柔和的光芒', context: 'The warm glow of the morning sun lit up the entire room.' },
    usual: { translation: '通常的，惯常的', context: 'As usual, she was the first person to arrive at the meeting.' },
    corner: { translation: '拐角，角落', context: 'There is a cozy little coffee shop right around the corner.' },
    exhibit: { translation: '展览，展出', context: 'The gallery will exhibit modern paintings and sculptures next week.' },
    awake: { translation: '醒着的，警觉的', context: 'I stayed awake late into the night, listening to the calm rain.' },
    friendly: { translation: '友好的，热情的', context: 'The locals were extremely welcoming and friendly to all visitors.' },
    remember: { translation: '记得，回忆起', context: 'I still remember the first day I started learning this language.' },
  },
}

const ruVocab: VocabCopy = {
  searchPlaceholder: 'Фильтровать по слову, переводу или корню...',
  allTags: 'Все',
  exportAnki: 'Экспорт Anki',
  exportAnkiTitle: 'Экспортировать всё в TSV Anki',
  newWord: 'Новое слово',
  close: 'Закрыть',
  wordsListTitle: 'Список слов',
  noWordsFound: 'По вашему запросу ничего не найдено.',
  filterNodesPlaceholder: 'Фильтровать узлы графа...',
  wordsCount: 'слов',
  linksCount: 'связей',
  zoomIn: 'Приблизить',
  zoomOut: 'Отдалить',
  resetView: 'Сбросить вид',
  fullscreen: 'Во весь экран',
  exitFullscreen: 'Выйти из полноэкранного режима',
  rootWord: 'Корень:',
  masteryKnown: 'Выучено наизусть',
  masteryLevel: 'Уровень владения:',
  listenPronunciation: 'Прослушать произношение',
  editWord: 'Редактировать',
  deleteWord: 'Удалить',
  deleteWordConfirm: 'Окончательно удалить слово',
  saveWordTitle: 'Сохранить слово',
  editWordTitle: 'Редактировать слово',
  wordField: 'Слово или выражение',
  translationField: 'Перевод',
  pronunciationField: 'Произношение (IPA)',
  referenceWordField: 'Исходное слово / корень (необязательно)',
  referenceWordPlaceholder: 'напр. go (для went), eat (для eaten)...',
  masteryField: 'Уровень освоения',
  associatedTags: 'Связанные теги',
  addTagPlaceholder: 'Новый тег...',
  save: 'Сохранить',
  cancel: 'Отмена',
  savedPageWordsTitle: 'Слова, сохранённые на этой странице',
  savedPageWordsSubtitle: 'проанализированы и сохранены ИИ',
  noSavedWordsOnPage: 'На этой странице пока нет сохранённых слов.',
  defaultPrompts: {
    neighborhood: { translation: 'район, окрестности', context: 'It is a quiet and friendly neighborhood with lots of green trees.' },
    glow: { translation: 'свечение, мягкий свет', context: 'The warm glow of the morning sun lit up the entire room.' },
    usual: { translation: 'обычный, привычный', context: 'As usual, she was the first person to arrive at the meeting.' },
    corner: { translation: 'угол, закоулок', context: 'There is a cozy little coffee shop right around the corner.' },
    exhibit: { translation: 'выставлять, экспонат', context: 'The gallery will exhibit modern paintings and sculptures next week.' },
    awake: { translation: 'бодрствующий, проснувшийся', context: 'I stayed awake late into the night, listening to the calm rain.' },
    friendly: { translation: 'дружелюбный, приветливый', context: 'The locals were extremely welcoming and friendly to all visitors.' },
    remember: { translation: 'помнить, вспоминать', context: 'I still remember the first day I started learning this language.' },
  },
}

const ptVocab: VocabCopy = {
  searchPlaceholder: 'Filtrar por palavra, tradução ou raiz...',
  allTags: 'Todos',
  exportAnki: 'Exportar Anki',
  exportAnkiTitle: 'Exportar tudo para Anki TSV',
  newWord: 'Nova palavra',
  close: 'Fechar',
  wordsListTitle: 'Lista de palavras',
  noWordsFound: 'Nenhuma palavra encontrada para a sua busca.',
  filterNodesPlaceholder: 'Filtrar nós do grafo...',
  wordsCount: 'palavras',
  linksCount: 'ligações',
  zoomIn: 'Aumentar zoom',
  zoomOut: 'Diminuir zoom',
  resetView: 'Recentrar vista',
  fullscreen: 'Ecrã inteiro',
  exitFullscreen: 'Sair do ecrã inteiro',
  rootWord: 'Raiz:',
  masteryKnown: 'Memorizado na perfeição',
  masteryLevel: 'Nível de domínio:',
  listenPronunciation: 'Ouvir pronúncia',
  editWord: 'Editar',
  deleteWord: 'Eliminar',
  deleteWordConfirm: 'Eliminar definitivamente a palavra',
  saveWordTitle: 'Guardar palavra',
  editWordTitle: 'Editar palavra',
  wordField: 'Palavra ou expressão',
  translationField: 'Tradução',
  pronunciationField: 'Pronúncia (IPA)',
  referenceWordField: 'Palavra raiz / lema (opcional)',
  referenceWordPlaceholder: 'ex. go (para went), eat (para eaten)...',
  masteryField: 'Nível de domínio',
  associatedTags: 'Etiquetas associadas',
  addTagPlaceholder: 'Nova etiqueta...',
  save: 'Guardar',
  cancel: 'Cancelar',
  savedPageWordsTitle: 'Palavras guardadas nesta página',
  savedPageWordsSubtitle: 'analisadas e guardadas por IA',
  noSavedWordsOnPage: 'Nenhuma palavra guardada nesta página.',
  defaultPrompts: {
    neighborhood: { translation: 'bairro, vizinhança', context: 'It is a quiet and friendly neighborhood with lots of green trees.' },
    glow: { translation: 'brilho suave, resplendor', context: 'The warm glow of the morning sun lit up the entire room.' },
    usual: { translation: 'habitual, costumeiro', context: 'As usual, she was the first person to arrive at the meeting.' },
    corner: { translation: 'esquina, canto', context: 'There is a cozy little coffee shop right around the corner.' },
    exhibit: { translation: 'expor, peça de exposição', context: 'The gallery will exhibit modern paintings and sculptures next week.' },
    awake: { translation: 'acordado, desperto', context: 'I stayed awake late into the night, listening to the calm rain.' },
    friendly: { translation: 'amigável, acolhedor', context: 'The locals were extremely welcoming and friendly to all visitors.' },
    remember: { translation: 'lembrar-se, recordar', context: 'I still remember the first day I started learning this language.' },
  },
}

export const vocabCopy: Record<UiLanguage, VocabCopy> = {
  fr: frVocab,
  en: enVocab,
  es: esVocab,
  zh: zhVocab,
  ru: ruVocab,
  pt: ptVocab,
}
