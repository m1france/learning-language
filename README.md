# Vivre la langue

Prototype React/Vite de l'environnement d'immersion défini dans les spécifications.

## Lancer le projet

```bash
npm install
npm run dev
```

La version de production se construit avec `npm run build`. Le dossier `dist/` est volontairement conservé pour le déploiement statique décrit dans le cahier des charges.

## Périmètre fonctionnel livré

- Onboarding sans test de niveau, avec inversion de la langue d'interface.
- Tableau de bord et navigation responsive.
- Bibliothèque Reading avec filtres et import visuel de ressources.
- Lecteur : mots cliquables, définition contextuelle, tags, ajout discret au deck, grammaire visuelle, lettres muettes et contrôle de rythme.
- Premiers parcours pour Studio vocal, Mur des mots et Contexte natif.
- Persistance locale du profil pour conserver le parcours dans le navigateur.

## À relier pour la mise en production

Le prototype emploie des données de démonstration locales. La prochaine couche est l'API Hono/tRPC avec MySQL et MinIO : authentification, ressources importées, dictionnaire/Wiktionary, SRS SM-2, enregistrement MediaRecorder et services de transcription/feedback.
