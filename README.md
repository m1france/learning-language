# Vivre la langue

Application React/Vite d’apprentissage des langues : lecture de textes importés, vocabulaire/SRS, écriture, studio oral et assistant IA. Le serveur Hono gère les comptes et sauvegarde leur progression dans SQLite. Le mode invité conserve sa progression dans le navigateur.

Le parcours retenu propose **Google et un accès invité après consentement**, sans achat ni service d’envoi à configurer. Le code e-mail/téléphone avec indicatif pays et codes de connexion est conservé pour une activation ultérieure, mais ces options restent désactivées. Les caches sont séparés par compte. Les clés API personnelles et les fichiers audio/vidéo restent sur l’appareil ; les historiques textuels et métadonnées enregistrés peuvent être synchronisés.

**État au 3 novembre 2026 : connexion Google réelle validée en local, sans nouveau déploiement.** La création du compte, le profil et les langues, puis la sauvegarde SQLite ont été vérifiés ; le contrôle d’intégrité retourne `ok`. Le dernier déploiement documenté, du 1er novembre, utilisait encore la protection propriétaire de Caddy. La nouvelle version et son parcours Google sur le domaine de production restent à valider après un déploiement demandé explicitement.

## Configurer et lancer

Le guide [Authentification et données](docs/AUTHENTIFICATION.md) décrit la configuration Google, les options e-mail/SMS préparées pour plus tard, le schéma SQLite, les sauvegardes, les limites et les offres d’hébergement gratuites.

Utiliser **Node 22.23 ou Node 24 LTS** :

```bash
npm ci
npm --prefix server ci
cp -n server/.env.example server/.env
chmod 600 server/.env
npm run dev:server
```

Renseigner Google dans `server/.env`, ignoré par Git. Laisser Resend et Twilio vides : aucun compte fournisseur, achat ni envoi e-mail/SMS n’est nécessaire pour le parcours retenu. Aucun fournisseur non configuré ne simule l’envoi d’un code ; le mode invité reste disponible. Ne jamais placer un secret dans une variable `VITE_`.

Dans un autre terminal, lancer `npm run dev`, puis ouvrir **http://127.0.0.1:5173**. Vite transmet `/api` au serveur local. Les scripts du serveur chargent automatiquement `server/.env`. Ne pas exposer le serveur de développement à Internet.

Si la surveillance échoue avec `EMFILE`, utiliser le backend sans observateurs de fichiers :

```bash
npm run build:server
npm --prefix server start
```

Reconstruire puis relancer ce processus après chaque modification serveur. Le frontend conserve son terminal Vite.

## Données et identité

La base `server/data/accounts.sqlite` est initialisée au démarrage. En production, elle se trouve dans `/app/data`, monté sur un volume persistant. Le schéma est documenté dans [server/src/db-init.sql](server/src/db-init.sql).

La progression invitée peut être importée explicitement dans un compte vide. Google identifie le compte connecté. Si l’e-mail ou le téléphone sont activés plus tard, leurs identités resteront distinctes : une adresse identique ne déclenche pas de fusion automatique de comptes.

Les nouvelles routes de progression sont authentifiées et vérifient le compte de l’onglet. Les anciennes routes `/api/sync` restent désactivées. Une divergence entre deux appareils demande de choisir la version à conserver ; elle n’écrase pas silencieusement l’autre version. `DATABASE_URL` reste une option MySQL historique pour les leçons, pas un branchement direct de la base des comptes à Supabase ou Neon.

## Compilation et vérification

```bash
npm run build
npm run build:server
npm run test:security
npm run test:sync
npm run test:sharing
npm run test:coach
npm run audit:code
```

Les tests d’authentification et de sécurité utilisent des comptes fictifs, des dossiers temporaires, des ports locaux et des fournisseurs simulés. Ils vérifient notamment OAuth/OTP, révocation, origines, limites, isolation, conflits, propriété et persistance. Une vérification distincte a suivi le vrai parcours Google local et confirmé l’écriture de progression dans SQLite. Les options e-mail/SMS restent désactivées, sans test de livraison réelle. Le parcours sur le domaine de production et la charge du VPS ne sont pas encore validés.

`audit:code` produit l’inventaire `docs/audit/code-inventory.json`. Les dépendances sont verrouillées dans les deux `package-lock.json`.

## Production Oracle

La cible existante utilise Podman/Quadlet sur Oracle Linux 9 et une image `linux/amd64` construite sur le Mac. Le fichier `docker-compose.yml` couvre une cible Docker. La configuration actuelle du dépôt sert publiquement l’onboarding ; le serveur protège les comptes avec des sessions en cookie `HttpOnly`, `Secure` en production.

Pour publier cette version, suivre [AUTHENTIFICATION.md](docs/AUTHENTIFICATION.md), configurer Google dans l’environnement serveur, conserver le volume de données et déployer ensemble l’application et Caddy. La base n’ajoute pas d’abonnement au VPS existant. Les e-mails et SMS ne sont pas activés ; une activation ultérieure des SMS serait payante. Le secret OAuth communiqué doit être renouvelé avant la mise en ligne et conservé uniquement côté serveur.

Les documents [Mise en service Oracle](docs/MISE_EN_SERVICE_ORACLE.md), [Déploiement Oracle](docs/DEPLOIEMENT_ORACLE.md) et [Oracle Linux 9](docs/DEPLOIEMENT_ORACLE_LINUX9.md) conservent l’historique du 1er novembre et les références d’infrastructure. Leurs anciennes consignes de connexion propriétaire ne décrivent pas la nouvelle version. L’[audit du 1er novembre](docs/AUDIT_2026-11-01.md) reste une référence datée.

Les parcours Google réels et les captures sont décrits dans [la vérification du 3 novembre](docs/QA_AUTH_2026-11-03.md).
