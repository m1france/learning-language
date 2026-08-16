import type { Language } from '../../domain'

export type NicheTopic = {
  id: string
  title: string
  titleEn: string
  badge: string
  angles: string[]
  anglesEn: string[]
  prompterFr: string
  prompterEn: string
}

export type GlobalTopicCategory = {
  id: string
  icon: string
  title: string
  titleEn: string
  description: string
  descriptionEn: string
  subtopics: NicheTopic[]
}

export const GLOBAL_CATEGORIES: GlobalTopicCategory[] = [
  {
    id: 'lifestyle',
    icon: '✨',
    title: 'Lifestyle & Quotidien',
    titleEn: 'Lifestyle & Daily Life',
    description: 'Habitudes, matinées, bien-être et anecdotes de vie.',
    descriptionEn: 'Habits, mornings, wellness and everyday stories.',
    subtopics: [
      {
        id: 'morning-routine',
        title: 'Morning Routine & Productivité',
        titleEn: 'Morning Routine & Productivity',
        badge: 'Routine',
        angles: [
          'À quelle heure te réveilles-tu et quel est ton tout premier geste ?',
          'As-tu un rituel indispensable (café, sport, méditation, lecture) ?',
          'Comment ta matinée influence-t-elle le reste de ta journée ?',
        ],
        anglesEn: [
          'What time do you wake up and what is your very first gesture?',
          'Do you have a non-negotiable ritual (coffee, workout, journaling)?',
          'How does your morning shape the rest of your day?',
        ],
        prompterFr: `Chaque matin commence par un choix : celui de donner le ton à ma journée. Quand le réveil sonne, j’évite de regarder immédiatement mon téléphone. Je préfère ouvrir grand la fenêtre, respirer l'air frais et boire un grand verre d'eau. Ensuite, le café est un moment sacré. Ces quinze minutes de silence me permettent d'organiser mes priorités sans stress. Une matinée réussie n'est pas une course contre la montre, c'est un moment pour soi.`,
        prompterEn: `Every morning begins with a conscious choice: setting the tone for the day. When the alarm rings, I resist the urge to check my phone right away. Instead, I open the window, breathe in the fresh air, and drink a tall glass of water. Then, brewing coffee becomes a sacred ritual. Those quiet fifteen minutes allow me to organize my thoughts without feeling rushed. A great morning isn't a race; it is a moment to connect with yourself.`,
      },
      {
        id: 'skincare-care',
        title: 'Skincare & Prendre soin de soi',
        titleEn: 'Skincare & Self-care',
        badge: 'Beauté & Soin',
        angles: [
          'Quelle est ta routine de soin le matin et le soir ?',
          'Le produit miracle dont tu ne pourrais plus te passer ?',
          'Prendre soin de son apparence : vanité ou respect de soi ?',
        ],
        anglesEn: [
          'What is your skincare routine morning and evening?',
          'The one holy grail product you cannot live without?',
          'Self-care: is it superficial or a form of self-respect?',
        ],
        prompterFr: `Prendre soin de sa peau, c'est avant tout un rituel de déconnexion. Le soir, après une longue journée devant les écrans, nettoyer mon visage me donne l'impression de repartir à zéro. J'applique un sérum hydratant et une crème nourrissante. Plus que le résultat esthétique, c'est un instant d'apaisement où je prends le temps de m'écouter et de ralentir le rythme.`,
        prompterEn: `Taking care of my skin is above all a way to unplug. In the evening, after hours spent in front of screens, cleansing my face feels like hitting a reset button. I apply a hydrating serum and a gentle moisturizer. Beyond looking fresh, it is a soothing ritual that reminds me to slow down and take care of my well-being.`,
      },
      {
        id: 'storytime-unforgettable',
        title: 'Storytime : Mon souvenir le plus fou',
        titleEn: 'Storytime: A Crazy Memory',
        badge: 'Anecdote',
        angles: [
          'Où et quand cela s’est-il produit ?',
          'Quel rebondissement inattendu a transformé la situation ?',
          'Quelle leçon ou fou rire en gardes-tu aujourd’hui ?',
        ],
        anglesEn: [
          'Where and when did this memorable story happen?',
          'What unexpected twist changed the whole situation?',
          'What lesson or funny memory stayed with you?',
        ],
        prompterFr: `Il y a des journées où rien ne se passe comme prévu, et c'est exactement ce qui les rend inoubliables. Je me souviens d’un voyage où nous avons raté le dernier train au milieu de nulle part. Au lieu de paniquer, nous avons rencontré des locaux qui nous ont invités à partager leur repas. Ce qui devait être une catastrophe s'est transformé en l’une des plus belles soirées de ma vie.`,
        prompterEn: `Some days just do not go as planned, and that is precisely what makes them unforgettable. I remember getting stranded after missing the last train in the middle of nowhere. Instead of panicking, we ended up meeting locals who invited us over for dinner. What seemed like a complete disaster turned into one of the warmest memories of my entire life.`,
      },
      {
        id: 'habits-minimalism',
        title: 'Minimalisme & Habitudes saines',
        titleEn: 'Minimalism & Healthy Habits',
        badge: 'Philosophie',
        angles: [
          'Comment fais-tu le tri dans tes affaires et dans ton esprit ?',
          'Quelle petite habitude a eu le plus grand impact sur ta vie ?',
          'Moins posséder permet-il d’être plus libre ?',
        ],
        anglesEn: [
          'How do you declutter your space and your mind?',
          'Which tiny habit had the biggest compounding effect on you?',
          'Does owning less truly create more freedom?',
        ],
        prompterFr: `Le minimalisme n’est pas de vivre avec une seule chaise dans un salon vide, c’est choisir intentionnellement ce qui mérite notre attention. En éliminant les objets superflus et les distractions numériques, on gagne un espace mental incroyable. Moins d'encombrement extérieur signifie plus de clarté intérieure pour se concentrer sur ce qui compte vraiment.`,
        prompterEn: `Minimalism is not about living in an empty white room with one chair; it is about choosing intentionally what deserves your energy. By getting rid of excess clutter and endless digital distractions, you unlock immense mental clarity. Fewer distractions outside mean more peace and focus on what truly matters inside.`,
      },
    ],
  },
  {
    id: 'sport',
    icon: '⚡',
    title: 'Sport & Dépassement',
    titleEn: 'Sports & Performance',
    description: 'Discipline physique, esprit d’équipe, fitness et résilience.',
    descriptionEn: 'Physical discipline, team spirit, fitness and grit.',
    subtopics: [
      {
        id: 'football-passion',
        title: 'Football & Émotions collectives',
        titleEn: 'Football & Collective Energy',
        badge: 'Ballon rond',
        angles: [
          'Quel match ou moment historique t’a fait vibrer ?',
          'Pourquoi ce sport déchaîne-t-il autant de passions dans le monde ?',
          'Que penses-tu de l’évolution tactique et de la pression médiatique ?',
        ],
        anglesEn: [
          'Which historic match or moment gave you goosebumps?',
          'Why does football trigger such universal emotion worldwide?',
          'What do you think about modern tactics and media pressure?',
        ],
        prompterFr: `Le football est bien plus qu'un simple jeu à onze contre onze. C'est un langage universel capable de rassembler des millions de personnes autour d’une seule seconde d’émotion pure. Un but à la quatre-vingt-dixième minute peut faire chavirer un stade entier. C'est cette intensité dramatique et imprévisible qui rend ce sport si captivant.`,
        prompterEn: `Football is far more than just twenty-two players on a pitch. It is a universal language that brings millions together over a single moment of pure drama. A last-minute goal can make an entire stadium erupt with joy. It is this unpredictable, raw intensity that makes the sport so universally captivating.`,
      },
      {
        id: 'fitness-strength',
        title: 'Musculation & Discipline au quotidien',
        titleEn: 'Fitness & Daily Discipline',
        badge: 'Entraînement',
        angles: [
          'Comment trouves-tu la motivation les jours où tu as la flemme ?',
          'L’importance de la régularité par rapport à l’intensité.',
          'Comment l’effort physique renforce-t-il le mental ?',
        ],
        anglesEn: [
          'How do you stay consistent on days when motivation is zero?',
          'Why consistency beats extreme intensity in the long run.',
          'How physical training builds mental resilience.',
        ],
        prompterFr: `La motivation est éphémère, mais la discipline reste. Les jours où l’on a le moins envie d’aller s’entraîner sont souvent ceux où la séance est la plus gratifiante. Pousser son corps à progresser barre après barre apprend la patience et l'humilité. Ce n'est pas seulement une transformation physique, c'est avant tout un entraînement du mental.`,
        prompterEn: `Motivation comes and goes, but discipline endures. The days when you least feel like working out are often the ones where showing up matters most. Pushing your physical limits rep after rep teaches patience, humility, and grit. It is not just about building strength; it is about strengthening your mind.`,
      },
      {
        id: 'running-endurance',
        title: 'Course à pied & Esprit libre',
        titleEn: 'Running & Mental Freedom',
        badge: 'Endurance',
        angles: [
          'Pourquoi cours-tu : performance, santé ou méditation ?',
          'Le défi du premier kilomètre versus l’euphorie du coureur.',
          'Ton parcours ou environnement idéal pour courir.',
        ],
        anglesEn: [
          'Why do you run: performance, cardio, or pure meditation?',
          'The resistance of the first kilometer vs the runner’s high.',
          'Your dream landscape or playlist for a long run.',
        ],
        prompterFr: `Chausser ses baskets et partir courir sans destination précise est l'un des sentiments les plus libérateurs qui soit. Les cinq premières minutes sont toujours les plus rudes, le temps que le souffle se cale. Mais une fois le rythme trouvé, l'esprit s'évade et les tracas du quotidien s'effacent foulée après foulée.`,
        prompterEn: `Lacing up your running shoes and heading out the door is one of the most liberating feelings in the world. The first few minutes are always challenging while your breathing settles. But once you lock into the rhythm, your mind clears up, and daily stress melts away stride after stride.`,
      },
      {
        id: 'extreme-sports',
        title: 'Sports extrêmes & Adrénaline',
        titleEn: 'Extreme Sports & Adrenaline',
        badge: 'Sensations',
        angles: [
          'Quel sport extrême as-tu déjà testé ou aimerais-tu tenter ?',
          'La frontière entre maîtrise du risque et recherche du frisson.',
          'Comment gérer la peur avant de s’élancer ?',
        ],
        anglesEn: [
          'Which extreme sport have you tried or dream of attempting?',
          'The fine line between calculated risk and pure thrill-seeking.',
          'How do you overcome fear right before taking the leap?',
        ],
        prompterFr: `Se retrouver face au vide avant un saut ou au sommet d’une vague géante procure une poussée d’adrénaline incomparable. La peur est naturelle, mais elle aiguise tous les sens. Dans ces moments précis, le futur et le passé disparaissent : il n’y a que l’instant présent et une concentration absolue.`,
        prompterEn: `Standing on the edge before a leap or facing down a giant wave triggers an unmatched surge of adrenaline. Fear is natural, but it sharpens every single sense. In those exact seconds, past and future vanish: there is only the present moment and absolute hyper-focus.`,
      },
    ],
  },
  {
    id: 'fashion',
    icon: '🧥',
    title: 'Mode, Style & Création',
    titleEn: 'Fashion & Style',
    description: 'Tendances, identité vestimentaire, vintage et design.',
    descriptionEn: 'Trends, personal identity, vintage and aesthetics.',
    subtopics: [
      {
        id: 'streetwear-culture',
        title: 'Streetwear & Culture Urbaine',
        titleEn: 'Streetwear & Urban Culture',
        badge: 'Streetwear',
        angles: [
          'Comment le streetwear est passé de la rue aux podiums de luxe ?',
          'Quelle est ta paire de sneakers préférée et pourquoi ?',
          'La culture des drops et de la rareté : passion ou spéculation ?',
        ],
        anglesEn: [
          'How streetwear transitioned from underground skate parks to luxury runways.',
          'What is your all-time favorite pair of sneakers and why?',
          'Drop culture and limited editions: genuine passion or hype speculation?',
        ],
        prompterFr: `Le streetwear n'est pas une simple tendance passagère, c’est le reflet d’une culture née dans la rue, le skate et le hip-hop. Aujourd'hui, il a conquis les plus grandes maisons de couture. Porter une pièce rare ou une paire de sneakers iconique est une façon d'affirmer son identité et son appartenance à une communauté créative.`,
        prompterEn: `Streetwear is not just a passing trend; it is the living legacy of street culture, skateboarding, and hip-hop. Today, it has reshaped the highest luxury runways. Rocking an iconic pair of sneakers or an authentic piece is a way to express individuality and belong to a creative global movement.`,
      },
      {
        id: 'vintage-thrifting',
        title: 'Vintage, Friperies & Pièces Uniques',
        titleEn: 'Vintage & Thrifting Culture',
        badge: 'Vintage',
        angles: [
          'Le plaisir de chiner la perle rare après des heures de recherche.',
          'Pourquoi les vêtements anciens ont-ils souvent une meilleure qualité ?',
          'La seconde main face à la surconsommation de la fast fashion.',
        ],
        anglesEn: [
          'The thrill of hunting down a hidden gem after digging through thrift racks.',
          'Why older garments often boast superior craftsmanship and fabrics.',
          'Second-hand shopping as an antidote to fast-fashion waste.',
        ],
        prompterFr: `Chiner dans une friperie ressemble à une véritable chasse au trésor. Chaque veste en cuir vieilli ou chaque pull en laine raconte une histoire qui a traversé les décennies. Au-delà de l'éthique écologique de la seconde main, cela permet de créer un style inimitable qu'on ne retrouvera sur personne d'autre.`,
        prompterEn: `Thrifting feels like embarking on a genuine treasure hunt. Every weathered leather jacket or vintage wool sweater carries a unique story that has traveled across decades. Beyond being an eco-friendly choice, second-hand fashion allows you to craft an authentic signature look no one can duplicate.`,
      },
      {
        id: 'slow-fashion',
        title: 'Slow Fashion & Vestiaire Durable',
        titleEn: 'Slow Fashion & Capsule Wardrobe',
        badge: 'Éco-responsable',
        angles: [
          'Acheter moins mais acheter mieux : ton avis sur la capsule wardrobe ?',
          'L’impact écologique de l’industrie textile.',
          'Comment reconnaître une coupe et une matière faites pour durer ?',
        ],
        anglesEn: [
          'Buy less, choose well: what do you think of capsule wardrobes?',
          'The environmental footprint of modern textile mass production.',
          'How to identify timeless tailoring and durable natural fabrics.',
        ],
        prompterFr: `La mode rapide nous pousse à consommer constamment des vêtements jetables qui perdent leur éclat après trois lavages. Adopter la slow fashion, c’est investir dans des basiques intemporels, des matières nobles comme le lin ou la laine, et privilégier la longévité à l'effet de mode éphémère.`,
        prompterEn: `Fast fashion conditions us to constantly buy disposable clothes that lose their shape after a few washes. Embracing slow fashion means investing in timeless essentials, choosing high-grade fabrics like linen and wool, and valuing durability over short-lived fleeting trends.`,
      },
    ],
  },
  {
    id: 'tech',
    icon: '🤖',
    title: 'Tech, IA & Futur',
    titleEn: 'Tech, AI & Future',
    description: 'Intelligence artificielle, innovations, réseaux et société de demain.',
    descriptionEn: 'Artificial intelligence, gadgets, software and tomorrow’s world.',
    subtopics: [
      {
        id: 'ai-revolution',
        title: 'L’Intelligence Artificielle au quotidien',
        titleEn: 'Artificial Intelligence in Everyday Life',
        badge: 'Intelligence Artificielle',
        angles: [
          'Comment utilises-tu l’IA aujourd’hui dans ton travail ou tes études ?',
          'L’IA va-t-elle remplacer les créatifs ou devenir leur meilleur allié ?',
          'Quelles limites éthiques devrions-nous fixer rapidement ?',
        ],
        anglesEn: [
          'How do you leverage AI today in your daily work or studies?',
          'Will AI replace creative thinkers or become their ultimate collaborator?',
          'What urgent ethical boundaries should we put in place?',
        ],
        prompterFr: `L'intelligence artificielle transforme notre monde à une vitesse vertigineuse. Outil surpuissant pour apprendre, rédiger ou coder, elle bouleverse nos méthodes de travail. La véritable question n'est pas de savoir si l'IA va nous dépasser, mais comment nous allons cultiver notre créativité et notre esprit critique pour en tirer le meilleur parti.`,
        prompterEn: `Artificial intelligence is transforming our everyday world at a breathtaking pace. As an incredible accelerator for learning, writing, and coding, it is reshaping entire workflows. The real question is not whether AI will replace human ingenuity, but how we will sharpen our creativity and critical thinking to harness its potential.`,
      },
      {
        id: 'social-media-attention',
        title: 'Réseaux sociaux & Économie de l’attention',
        titleEn: 'Social Media & The Attention Economy',
        badge: 'Digital',
        angles: [
          'Combien de temps passes-tu sur les écrans par jour ?',
          'L’impact des algorithmes sur notre capacité de concentration.',
          'Comment réussir une détox digitale sans se couper du monde ?',
        ],
        anglesEn: [
          'How many hours of screen time do you average every day?',
          'The impact of short-form algorithm feeds on our attention span.',
          'How to pull off a digital detox without isolating yourself completely.',
        ],
        prompterFr: `Nos smartphones sont devenus le prolongement de nos mains, et les algorithmes rivalisent pour capturer chaque seconde de notre attention. Entre les flux infinis et les notifications incessantes, il devient héroïque de lire un livre d'une traite. Reprendre le contrôle de son attention est sans doute l'un des plus grands défis de notre génération.`,
        prompterEn: `Our smartphones have turned into an extension of our hands, with algorithms constantly competing for every fraction of our attention. Between endless feeds and non-stop notifications, reading a book uninterrupted feels almost heroic. Reclaiming control over our focus is arguably one of the defining challenges of our generation.`,
      },
      {
        id: 'gaming-esport',
        title: 'Jeux Vidéo & eSport : Un art interactif',
        titleEn: 'Gaming & eSports: Interactive Art',
        badge: 'Gaming',
        angles: [
          'Quel jeu a marqué ta vie par sa narration ou son gameplay ?',
          'L’eSport mérite-t-il le statut de discipline sportive officielle ?',
          'L’immersion dans les mondes virtuels et le futur du divertissement.',
        ],
        anglesEn: [
          'Which game profoundly impacted you through its storytelling or mechanics?',
          'Do competitive eSports deserve official recognition alongside traditional sports?',
          'Virtual world immersion and the next frontier of storytelling.',
        ],
        prompterFr: `Le jeu vidéo a cessé d’être un simple divertissement pour devenir l’une des formes d’art les plus complètes. Alliant composition musicale, mise en scène cinématographique et interactivité totale, il permet de vivre des émotions qu'aucun autre médium ne peut procurer avec autant d’intensité.`,
        prompterEn: `Video games have grown beyond simple entertainment to become one of the most complete art forms in human history. Blending orchestral music, cinematic directing, and deep interactivity, they immerse players in emotional journeys with unprecedented depth.`,
      },
    ],
  },
  {
    id: 'food',
    icon: '🍕',
    title: 'Gastronomie & Cuisine',
    titleEn: 'Food & Culinary Arts',
    description: 'Saveurs du monde, recettes secrètes, street food et convivialité.',
    descriptionEn: 'Global flavors, secret recipes, street food and dinner parties.',
    subtopics: [
      {
        id: 'comfort-food',
        title: 'Mon plat réconfortant suprême',
        titleEn: 'My Ultimate Comfort Food',
        badge: 'Gourmandise',
        angles: [
          'Quel plat te réchauffe le cœur après une journée éprouvante ?',
          'L’odeur ou la saveur qui te ramène immédiatement en enfance.',
          'Pourquoi la nourriture est-elle indissociable des émotions ?',
        ],
        anglesEn: [
          'Which heartwarming dish instantly rescues a rough day?',
          'The aroma or flavor that immediately brings back childhood nostalgia.',
          'Why food is deeply intertwined with human emotion and comfort.',
        ],
        prompterFr: `Rien ne vaut l’odeur d’un plat mijoté qui embaume la maison un soir d’hiver. Le plat réconfortant n’a pas besoin d’être raffiné : des pâtes fraîches au fromage fondant ou une soupe chaude préparée selon la recette familiale suffisent à apaiser l’esprit et à réchauffer les cœurs.`,
        prompterEn: `Nothing compares to the aroma of a slow-cooked meal filling the house on a cold winter night. Great comfort food doesn’t have to be fancy: homemade pasta with melted cheese or a steaming bowl of soup based on a family recipe is all it takes to warm your soul and brighten your spirit.`,
      },
      {
        id: 'street-food-world',
        title: 'Street Food & Saveurs du Monde',
        titleEn: 'Street Food & Night Markets',
        badge: 'Voyage culinaire',
        angles: [
          'La meilleure street food que tu aies goûtée en voyage.',
          'Tacos, baos, banh mi ou crêpes : quelle est ta spécialité favorite ?',
          'La cuisine de rue comme reflet authentique de la culture locale.',
        ],
        anglesEn: [
          'The most memorable street food dish you have ever tasted while traveling.',
          'Tacos, steam baos, banh mi, or crêpes: your go-to street delicacy?',
          'Street food stalls as the truest window into local culture and heritage.',
        ],
        prompterFr: `Manger sur un tabouret en plastique dans une ruelle animée d’un marché de nuit est souvent bien plus mémorable qu’un grand restaurant étoilé. La street food concentre toute la générosité et l’histoire d’un pays dans une bouchée croustillante, épicée et pleine de caractère.`,
        prompterEn: `Sitting on a plastic stool in a buzzing night market alley often creates far better memories than dining at a fancy restaurant. Street food captures all the warmth, generosity, and rich heritage of a culture in a single crispy, flavorful bite.`,
      },
    ],
  },
  {
    id: 'cinema',
    icon: '🎬',
    title: 'Cinéma & Pop Culture',
    titleEn: 'Cinema & Pop Culture',
    description: 'Films cultes, séries incontournables, théories et acteurs mythiques.',
    descriptionEn: 'Iconic movies, binge-worthy series, fan theories and directors.',
    subtopics: [
      {
        id: 'cult-movie-review',
        title: 'Critique de mon Film Culte',
        titleEn: 'Review of My All-Time Favorite Movie',
        badge: '7ème Art',
        angles: [
          'Quel film pourrais-tu regarder cinquante fois sans te lasser ?',
          'Ce qui t’a bouleversé : la photographie, le jeu d’acteur ou la musique ?',
          'Quelle scène culte reste gravée dans ta mémoire ?',
        ],
        anglesEn: [
          'Which movie could you rewatch fifty times without getting bored?',
          'What captivated you most: cinematography, acting performance, or soundtrack?',
          'Which iconic scene is forever etched in your mind?',
        ],
        prompterFr: `Il y a des chefs-d'œuvre qui vous marquent à jamais dès le premier visionnage. Qu'il s'agisse de la tension dramatique, de la photographie sublime ou d'une bande originale inoubliable, un grand film ne se contente pas de raconter une histoire : il vous transporte dans un autre univers et change votre regard sur le monde.`,
        prompterEn: `There are timeless masterpieces that stay with you forever from the very first screening. Whether it is the dramatic tension, breathtaking cinematography, or an unforgettable musical score, a legendary movie does not just tell a story: it completely transports you into another reality.`,
      },
      {
        id: 'series-binge',
        title: 'L’Âge d’Or des Séries TV',
        titleEn: 'The Golden Age of TV Shows',
        badge: 'Séries',
        angles: [
          'Quelle série as-tu dévorée en un week-end ?',
          'Pourquoi les séries développent-elles des personnages plus profonds que les films ?',
          'La fin d’une série qui t’a laissé un vide immense.',
        ],
        anglesEn: [
          'Which show did you binge-watch in a single weekend?',
          'Why long-format series allow richer character development than cinema.',
          'A series finale that left an unforgettable void once the screen went black.',
        ],
        prompterFr: `Les séries ont révolutionné l'art de la narration. En suivant l’évolution de personnages complexes au fil de dizaines d'épisodes, on développe un attachement émotionnel quasi familial. Quand le générique final retentit après plusieurs saisons, on a l'impression de dire au revoir à de vieux amis.`,
        prompterEn: `Prestige television has completely revolutionized the art of storytelling. Following complex characters across dozens of hours builds an emotional bond that feels almost personal. When the final credits roll after several seasons, it truly feels like bidding farewell to close friends.`,
      },
    ],
  },
  {
    id: 'business',
    icon: '💼',
    title: 'Business & Éloquence Pro',
    titleEn: 'Business & Pitching',
    description: 'Pitch d’un projet, entretien d’embauche, négociation et leadership.',
    descriptionEn: 'Pitching ideas, job interviews, negotiation and leadership.',
    subtopics: [
      {
        id: 'elevator-pitch',
        title: 'L’Elevator Pitch : Vendre son idée en 60s',
        titleEn: 'The 60-Second Elevator Pitch',
        badge: 'Pitch',
        angles: [
          'Quel problème douloureux ton projet résout-il ?',
          'Quelle est ta proposition de valeur unique face aux alternatives ?',
          'Quel est ton appel à l’action clair pour conclure le pitch ?',
        ],
        anglesEn: [
          'What burning pain point does your project solve?',
          'What is your unique value proposition against existing alternatives?',
          'What is your clear and decisive call to action to close the pitch?',
        ],
        prompterFr: `Imaginez pouvoir accomplir en trois clics ce qui vous prenait autrefois deux heures de travail fastidieux. Notre solution élimine les frictions quotidiennes grâce à une interface intuitive et intelligente. Nous ne vendons pas un simple outil, nous offrons du temps et de la sérénité à nos utilisateurs. Êtes-vous prêts à franchir le cap avec nous ?`,
        prompterEn: `Imagine completing in three clicks what used to take two hours of tedious manual effort. Our platform removes daily friction through a seamless and intelligent interface. We are not just selling software; we are giving people their precious time and peace of mind back. Are you ready to join us on this journey?`,
      },
      {
        id: 'job-interview-strengths',
        title: 'Entretien d’embauche : Parler de ses forces',
        titleEn: 'Job Interview: Articulating Your Strengths',
        badge: 'Carrière',
        angles: [
          'Comment te présenterais-tu en trois phrases percutantes ?',
          'Une situation difficile où tu as su rebondir avec brio.',
          'Ce qui te motive le plus dans tes projets professionnels.',
        ],
        anglesEn: [
          'How would you pitch your background in three impactful sentences?',
          'A tough setback and how you turned it into a major success.',
          'What genuinely fuels your drive and professional curiosity.',
        ],
        prompterFr: `Ce qui me caractérise avant tout, c'est ma capacité à transformer des défis complexes en solutions concrètes et élégantes. Dans mes précédentes expériences, j'ai appris que l'écoute et l'esprit d'équipe sont aussi cruciaux que l'expertise technique. Je recherche aujourd'hui un environnement exigeant où je pourrai apporter une réelle valeur ajoutée.`,
        prompterEn: `What defines my approach above all is the ability to turn complex hurdles into actionable, elegant solutions. Across my career, I have learned that active listening and team collaboration are just as critical as technical craft. I am now looking for a challenging environment where I can create measurable impact.`,
      },
    ],
  },
  {
    id: 'mindset',
    icon: '🧠',
    title: 'Développement Personnel & Mental',
    titleEn: 'Mindset & Personal Growth',
    description: 'Confiance en soi, résilience, gestion du stress et quête de sens.',
    descriptionEn: 'Self-confidence, resilience, stress management and purpose.',
    subtopics: [
      {
        id: 'public-speaking-confidence',
        title: 'Vaincre le trac & Prendre la parole',
        titleEn: 'Overcoming Stage Fright & Public Speaking',
        badge: 'Éloquence',
        angles: [
          'Que ressens-tu dans ton corps avant de monter sur scène ou parler en public ?',
          'La technique de respiration ou de visualisation qui t’aide à canaliser l’énergie.',
          'Pourquoi la vulnérabilité captive-t-elle plus que la fausse perfection ?',
        ],
        anglesEn: [
          'What physical sensations arise before you step on stage or speak up?',
          'The breathing or visualization trick that channels your nervous energy.',
          'Why authentic vulnerability connects far more deeply than fake perfection.',
        ],
        prompterFr: `Avoir le trac n’est pas un signe de faiblesse, c’est la preuve que ce que vous vous apprêtez à dire compte vraiment. Le secret n'est pas de faire disparaître la peur, mais d'apprendre à danser avec elle. En respirant profondément et en se concentrant sur le message plutôt que sur le regard des autres, la voix trouve naturellement sa force.`,
        prompterEn: `Feeling butterflies before speaking is not a flaw; it is proof that what you have to share genuinely matters. The goal is never to extinguish nervous energy, but to channel it into passion. By breathing deeply and focusing on your message rather than self-judgment, your natural voice commands the room.`,
      },
      {
        id: 'impostor-syndrome',
        title: 'Surmonter le Syndrome de l’Imposteur',
        titleEn: 'Overcoming Impostor Syndrome',
        badge: 'Confiance',
        angles: [
          'As-tu déjà pensé que ta réussite n’était due qu’à la chance ?',
          'Comment faire la paix avec ses doutes et reconnaître sa valeur ?',
          'La différence entre humilité et auto-sabotage.',
        ],
        anglesEn: [
          'Have you ever felt your accomplishments were merely luck or timing?',
          'How to make peace with self-doubt and own your hard-earned value.',
          'Drawing the line between healthy humility and quiet self-sabotage.',
        ],
        prompterFr: `Douter de soi est souvent l'apanage de ceux qui ont des standards élevés. Si vous êtes assis à cette table aujourd'hui, ce n'est pas par hasard : c'est le fruit de vos efforts, de vos nuits de travail et de votre persévérance. Cessez de comparer vos coulisses à la scène publique des autres.`,
        prompterEn: `Self-doubt is frequently the trademark of people holding themselves to the highest standards. If you are sitting at the table today, it is not an accident: it is the compounding result of your dedication, late nights, and persistence. Stop comparing your behind-the-scenes to other people’s highlight reels.`,
      },
    ],
  },
]

export const IMPROV_CHALLENGES: { id: number; fr: string; en: string; category: string }[] = [
  { id: 1, fr: 'Vends-moi une chaussette trouée comme si c’était un article de haute couture.', en: 'Sell me a sock with a hole in it like it is haute couture.', category: 'Humour' },
  { id: 2, fr: 'Explique le fonctionnement d’Internet à un chevalier du Moyen Âge.', en: 'Explain how the Internet works to a medieval knight.', category: 'Décalé' },
  { id: 3, fr: 'Défends l’idée que l’ananas sur la pizza est une invention géniale.', en: 'Defend the controversial statement that pineapple on pizza is culinary genius.', category: 'Débat' },
  { id: 4, fr: 'Invente une excuse absurde pour justifier deux heures de retard au travail.', en: 'Invent an absurd excuse to justify arriving two hours late to work.', category: 'Storytelling' },
  { id: 5, fr: 'Décris ta dernière journée comme la bande-annonce d’un blockbuster hollywoodien.', en: 'Describe your yesterday as a dramatic Hollywood movie trailer.', category: 'Cinéma' },
  { id: 6, fr: 'Présente ta ville à un extraterrestre qui vient tout juste d’atterrir.', en: 'Introduce your hometown to an alien who just landed in your garden.', category: 'Science-fiction' },
  { id: 7, fr: 'Explique ton plat préféré à quelqu’un qui n’a jamais eu de papilles gustatives.', en: 'Describe your favorite comfort food to someone who has never tasted anything.', category: 'Émotions' },
  { id: 8, fr: 'Convaincs ton audience d’adopter un pigeon voyageur plutôt qu’un smartphone.', en: 'Convince the audience to ditch their smartphones for carrier pigeons.', category: 'Humour' },
  { id: 9, fr: 'Raconte ton pire rendez-vous comme s’il s’agissait d’une affaire criminelle du FBI.', en: 'Narrate your worst date as if it were a high-stakes FBI investigation.', category: 'Storytelling' },
  { id: 10, fr: 'Prononce un discours présidentiel passionné pour interdire les réveils matinaux.', en: 'Deliver a passionate presidential speech to outlaw morning alarm clocks.', category: 'Éloquence' },
  { id: 11, fr: 'Fais l’éloge funèbre d’une plante verte morte après trois jours dans ton salon.', en: 'Give a heartfelt eulogy for a houseplant that died after three days.', category: 'Absurde' },
  { id: 12, fr: 'Explique pourquoi les chats dominent secrètement la planète.', en: 'Explain why cats are secretly the true masters of planet Earth.', category: 'Conspiration' },
  { id: 13, fr: 'Décris l’objet posé immédiatement à ta droite comme s’il avait des pouvoirs magiques.', en: 'Describe the object to your immediate right as if it held legendary magical powers.', category: 'Imaginaire' },
  { id: 14, fr: 'Raconte ta routine du matin mais uniquement avec des métaphores sportives.', en: 'Describe your morning routine using exclusively sports commentary metaphors.', category: 'Performance' },
  { id: 15, fr: 'Pitch une startup qui vend de l’air frais en canette aux parisiens.', en: 'Pitch a startup selling canned fresh mountain breeze to stressed city dwellers.', category: 'Business' },
  { id: 16, fr: 'Si tu devenais invisible pendant 24 heures, que ferais-tu en premier ?', en: 'If you turned invisible for 24 hours, what is the very first thing you would do?', category: 'Dilemme' },
  { id: 17, fr: 'Explique la règle du hors-jeu en football à ta grand-mère avec des gâteaux.', en: 'Explain the offside rule in football using kitchen pastries.', category: 'Pédagogie' },
  { id: 18, fr: 'Raconte la dispute la plus futile que tu aies eue avec un ami proche.', en: 'Recall the most ridiculous argument you ever had with a close friend.', category: 'Vie réelle' },
  { id: 19, fr: 'Donne trois raisons irréfutables pour lesquelles les siestes devraient être obligatoires.', en: 'Give three undeniable reasons why afternoon naps should be legally mandatory.', category: 'Plaidoyer' },
  { id: 20, fr: 'Parle pendant une minute sans utiliser une seule fois le mot « oui » ni « non ».', en: 'Speak for a full minute without once saying the words "yes" or "no".', category: 'Défi verbal' },
  { id: 21, fr: 'Décris ton métier ou tes études comme une quête épique de jeu de rôle médiéval.', en: 'Describe your daily job or studies as an epic medieval RPG quest.', category: 'Fantastique' },
  { id: 22, fr: 'Quelle chanson as-tu honte d’adorer sous la douche et pourquoi ?', en: 'Which guilty pleasure song do you scream in the shower and why?', category: 'Confidence' },
  { id: 23, fr: 'Présente la météo de demain comme si une invasion de zombies était prévue.', en: 'Present tomorrow’s weather forecast during an impending zombie apocalypse.', category: 'Jeu de rôle' },
  { id: 24, fr: 'Convaincs un jury que le sommeil est plus important que la nourriture.', en: 'Convince a jury that sleep is fundamentally superior to food.', category: 'Rhétorique' },
  { id: 25, fr: 'Raconte une rencontre insolite avec un animal dans la nature ou en ville.', en: 'Recount an unexpected encounter with an animal in nature or in the city.', category: 'Anecdote' },
  { id: 26, fr: 'Quel conseil donnerais-tu à la personne que tu étais il y a 10 ans ?', en: 'What advice would you whisper to your ten-years-younger self?', category: 'Inspiration' },
  { id: 27, fr: 'Imagine que tu découvres que ton meilleur ami est en réalité un espion international.', en: 'Imagine discovering that your closest friend is actually an elite secret agent.', category: 'Impro' },
  { id: 28, fr: 'Défends la cause des stylos à bille qui disparaissent mystérieusement des trousses.', en: 'Defend the tragic cause of ballpoint pens that vanish into thin air.', category: 'Humour' },
  { id: 29, fr: 'Explique pourquoi la musique des années 80 est inégalable.', en: 'Explain why 80s music remains undefeated across musical history.', category: 'Musique' },
  { id: 30, fr: 'Fais la critique culinaire ultra-gastronomique d’un bol de céréales au lait tiède.', en: 'Deliver a three-star Michelin restaurant review for a bowl of soggy cereal.', category: 'Parodie' },
  { id: 31, fr: 'Si tu pouvais téléporter une pièce de ta maison n’importe où sur Terre, où irait-elle ?', en: 'If you could teleport one room of your house anywhere on Earth, where and why?', category: 'Voyage' },
  { id: 32, fr: 'Invente un nouveau sport olympique combinant deux activités improbables.', en: 'Invent a brand new Olympic sport combining two completely unrelated hobbies.', category: 'Créativité' },
  { id: 33, fr: 'Explique pourquoi le café du matin a meilleur goût que toute autre boisson.', en: 'Explain why the first sip of morning coffee tastes better than anything else.', category: 'Plaisir' },
  { id: 34, fr: 'Raconte un fou rire incontrôlable au pire moment possible.', en: 'Tell the story of an uncontrollable burst of laughter at the worst possible moment.', category: 'Souvenir' },
  { id: 35, fr: 'Pitch un film d’horreur où le grand méchant est un aspirateur robot autonome.', en: 'Pitch a thriller horror flick where the main villain is a smart robot vacuum.', category: 'Cinéma' },
  { id: 36, fr: 'Pourquoi tout le monde devrait apprendre au moins deux langues vivantes ?', en: 'Why should every single human be required to learn at least two languages?', category: 'Langues' },
  { id: 37, fr: 'Prends la défense de quelqu’un accusé d’avoir volé la dernière part de gâteau.', en: 'Act as a top defense lawyer for someone accused of stealing the last slice of cake.', category: 'Plaidoirie' },
  { id: 38, fr: 'Raconte ton tout premier souvenir d’enfance avec le plus de détails sensoriels possibles.', en: 'Describe your very first childhood memory with vivid sensory details.', category: 'Mémoire' },
  { id: 39, fr: 'Si les animaux pouvaient parler, lequel serait le plus insupportable ?', en: 'If all animals gained human speech, which species would be the most annoying?', category: 'Humour' },
  { id: 40, fr: 'Décris l’odeur de la pluie sur le bitume chaud en été.', en: 'Describe the enchanting scent of summer rain hitting hot asphalt (petrichor).', category: 'Poésie' },
  { id: 41, fr: 'Pourquoi devrions-nous célébrer les échecs autant que les victoires ?', en: 'Why should we celebrate our failures just as loudly as our victories?', category: 'Philosophie' },
  { id: 42, fr: 'Invente une légende urbaine sur les chaussettes perdues dans la machine à laver.', en: 'Invent an urban myth explaining where missing washing machine socks end up.', category: 'Mythe' },
  { id: 43, fr: 'Présente une invention du futur qui rendrait la vie de tout le monde 10 fois plus facile.', en: 'Present a futuristic invention that would make daily life 10x smoother.', category: 'Futur' },
  { id: 44, fr: 'Pourquoi lire un livre en papier est-il irremplaçable face aux liseuses ?', en: 'Why is turning real paper book pages irreplaceable compared to e-readers?', category: 'Culture' },
  { id: 45, fr: 'Si tu pouvais dîner avec un personnage historique mort ou vivant, qui choisirais-tu ?', en: 'If you could have dinner with any historical figure, who would it be and why?', category: 'Histoire' },
  { id: 46, fr: 'Explique pourquoi la curiosité est la qualité humaine la plus précieuse.', en: 'Explain why relentless curiosity is the single most valuable human trait.', category: 'Valeurs' },
  { id: 47, fr: 'Raconte une coïncidence tellement improbable qu’elle semblait écrite par un scénariste.', en: 'Narrate a coincidence so unbelievable it felt scripted by a film writer.', category: 'Destin' },
  { id: 48, fr: 'Fais l’éloge des personnes qui marchent vite dans la rue.', en: 'Give a passionate tribute to fast walkers who conquer city sidewalks.', category: 'Humeur' },
  { id: 49, fr: 'Quel superpouvoir inutile mais amusant aimerais-tu posséder au quotidien ?', en: 'Which totally useless yet fun superpower would you pick for everyday life?', category: 'Fun' },
  { id: 50, fr: 'Convaincs-moi de tout plaquer pour partir élever des lamas dans les Andes.', en: 'Convince me to drop everything and move to the Andes to raise lamas.', category: 'Évasion' },
  { id: 51, fr: 'Décris le silence parfait et où peut-on encore le trouver aujourd’hui.', en: 'Describe what absolute silence feels like and where to find it today.', category: 'Méditation' },
  { id: 52, fr: 'Pourquoi les souvenirs de vacances semblent-ils toujours plus magiques avec le temps ?', en: 'Why do holiday memories always grow more magical with the passage of time?', category: 'Nostalgie' },
  { id: 53, fr: 'Explique à un enfant de 5 ans pourquoi le ciel est bleu.', en: 'Explain to a five-year-old child why the sky is blue without complex jargon.', category: 'Vulgarisation' },
  { id: 54, fr: 'Raconte ta relation d’amour-haine avec le bouton « snooze » de ton réveil.', en: 'Detail your complex love-hate relationship with your phone snooze button.', category: 'Quotidien' },
  { id: 55, fr: 'Quel est le plus beau compliment que l’on t’ait jamais fait et pourquoi t’a-t-il touché ?', en: 'What is the most touching compliment you ever received and why did it move you?', category: 'Cœur' },
]

export function getPromptText(niche: NicheTopic, lang: Language): string {
  return lang === 'en' ? niche.prompterEn : niche.prompterFr
}

export function getChallengeText(challenge: typeof IMPROV_CHALLENGES[0], lang: Language): string {
  return lang === 'en' ? challenge.en : challenge.fr
}
