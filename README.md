# Vivre la langue

Un outil local d'apprentissage des langues, façon my_lute : aucune ressource n'est fournie par défaut — c'est toi qui importes tes textes et qui apprends avec. La colombe du logo symbolise la chute des frontières : on apprend une langue pour se connecter aux autres.

## Lancer le projet

```bash
npm install
npm run dev
```

La version de production se construit avec `npm run build`. Le dossier `dist/` est volontairement conservé pour le déploiement statique décrit dans le cahier des charges.

## Périmètre fonctionnel

- Onboarding sans test de niveau : prénom + langue d'interface.
- Interface traduite en 6 langues (English, Español, Français, 中文, Русский, Português) — drapeaux discrets en haut à droite de l'accueil pour changer à tout moment. Le contenu importé n'est jamais traduit.
- Bibliothèque Reading vide au départ : import de fichiers (.txt, .md, .epub, .pdf), d'URL ou de texte collé, avec difficulté et catégories personnalisables (ajout, renommage, suppression).
- Lecteur : mots cliquables, définition contextuelle (locale, Wiktionary ou IA), marquage grammatical avec couleurs par défaut personnalisables, lettres muettes, édition du texte, couvertures.
- Learning Focus grammar pour projeter et annoter un texte.
- Studio vocal, Mur des mots et Contexte natif.
- Persistance locale : tout reste dans le navigateur.

## À relier pour la mise en production

Le prototype emploie un stockage local. La prochaine couche est l'API Hono/tRPC avec MySQL et MinIO : authentification, ressources importées, dictionnaire/Wiktionary, SRS SM-2, enregistrement MediaRecorder et services de transcription/feedback.
