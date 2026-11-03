# Authentification, progression et hébergement des données

État du travail au **3 novembre 2026** : la nouvelle authentification est implémentée dans le dépôt et **la connexion Google réelle a été validée en local**. Le parcours a créé un compte, enregistré le profil et les langues, puis sauvegardé une première progression dans SQLite, à la révision 2. Le contrôle d’intégrité SQLite retourne `ok`.

**Cette version n’a pas été publiée sur le VPS.** Son fonctionnement sur le domaine de production reste à vérifier après un déploiement demandé explicitement. Le parcours retenu est **Google + invité** : l’activation e-mail/SMS est abandonnée pour cette mise en service, sans achat ni ouverture de compte chez un fournisseur d’envoi. Les tests de ces options futures utilisent des réponses simulées.

## Ce que fait l’application

Le parcours actuel présente Google et l’accès invité. Le code préparé pour une activation ultérieure sait aussi accepter une adresse e-mail ou un numéro de téléphone dans le même champ, afficher le pays avec son drapeau, son nom et son indicatif, puis vérifier un code à six chiffres. Ces options restent désactivées pour la mise en service retenue.

Google utilise une redirection vers Google puis un échange de code côté serveur. À la première connexion, l’utilisateur choisit son prénom avant d’ouvrir son espace.

Le bouton invité ouvre l’avertissement demandé, avec la case « J’accepte ». Cocher cette case ouvre l’application. La progression invitée reste dans le navigateur ; elle n’est pas envoyée dans la base des comptes. Le consentement est retenu dans ce navigateur jusqu’à son retrait ou à l’effacement du stockage.

Une progression invitée existante peut être copiée dans un compte vide après un choix explicite. Le compte ne récupère pas silencieusement les données d’un autre utilisateur du navigateur. Les données invitées sont conservées après la copie.

**L’identité de connexion compte.** Si les autres moyens sont activés ultérieurement, « Google » et « code par e-mail » créeront deux identités distinctes, même si leur adresse e-mail est identique. Le téléphone constitue également une identité distincte. Il n’existe pas encore de fonction permettant de les lier ou de fusionner leurs progressions. Réutiliser le même moyen de connexion pour retrouver le même compte.

## Architecture et emplacement de la base

Le serveur Hono conserve les comptes dans **SQLite**, avec le module `node:sqlite`. Aucun serveur de base de données séparé n’est nécessaire.

| Environnement | Emplacement |
| --- | --- |
| Développement, configuration par défaut | `server/data/accounts.sqlite` |
| Conteneur Docker ou Podman | `/app/data/accounts.sqlite` |
| Hôte Oracle avec le montage actuel | `/opt/vivre-la-langue/data/accounts.sqlite` |
| Emplacement personnalisé | `${DATA_DIR}/accounts.sqlite` |

Le fichier est créé et initialisé au démarrage du serveur. Le schéma lisible se trouve dans [server/src/db-init.sql](../server/src/db-init.sql) ; son application automatique est implémentée dans [server/src/account-store.ts](../server/src/account-store.ts).

| Table | Données conservées |
| --- | --- |
| `users` | Identifiant du compte, coordonnées vérifiées, prénom et état de l’onboarding |
| `identities` | Correspondance entre le fournisseur, son identifiant et le compte |
| `sessions` | Empreintes des jetons de session, compte et expiration |
| `challenges` | Demandes de code, expiration, tentatives et état de consommation |
| `rate_limits` | Compteurs persistants de limitation des requêtes |
| `oauth_states` | État OAuth temporaire, vérificateur PKCE et nonce |
| `user_progress` | Instantané de progression et numéro de révision par compte |
| `lesson_owners` | Propriété des leçons publiées depuis un compte |

SQLite utilise WAL, les clés étrangères et un délai d’attente de verrou de cinq secondes. Le fichier principal est créé avec des permissions privées. Les accès passent par le serveur ; le navigateur ne reçoit aucun accès direct au fichier.

`DATABASE_URL` ne configure **pas** cette base des comptes. Cette variable appartient à l’intégration MySQL historique des leçons partagées. Renseigner une URL PostgreSQL Supabase ou Neon ne migrera ni les comptes, ni les sessions, ni la progression. Une migration du schéma, du code d’accès et, si souhaité, de l’authentification est nécessaire pour adopter ces services.

## Données synchronisées et données locales

Le serveur conserve un instantané JSON par compte : ressources, vocabulaire, SRS, progression de lecture, textes enregistrés, réglages non secrets et autres données de l’état principal. Les instantanés complémentaires incluent les conversations de l’assistant, l’historique des exercices et les métadonnées du studio oral, dont les notes, transcriptions et analyses enregistrées.

Les clés API personnelles restent dans le cache local du compte sur chaque appareil. Elles sont retirées des sauvegardes distantes ; le serveur refuse les champs de clés non vides. Il faut donc les renseigner sur chaque appareil qui en a besoin.

Les fichiers audio et vidéo du studio oral restent dans IndexedDB sur leur appareil d’origine. Leurs métadonnées peuvent être synchronisées, mais les enregistrements eux-mêmes ne sont pas hébergés sur le serveur. L’import invité ne transfère pas ces fichiers dans le stockage média du compte : les originaux restent dans l’espace invité du navigateur. Un brouillon encore présent seulement dans un éditeur doit être enregistré pour faire partie de la progression sauvegardée.

Les caches `localStorage` et IndexedDB sont séparés par compte. L’espace invité conserve les noms historiques pour retrouver les anciennes données. L’API de progression exige à la fois la session et `X-Account-ID`, qui doit correspondre au compte de la session : un onglet resté sur le compte A ne peut pas envoyer ses données au compte B après un changement de cookie.

Une requête de progression est limitée à **10 Mio**, corps JSON compris. Ce plafond n’est pas une capacité totale allouée à tous les comptes. Les médias restent locaux et de très gros documents ou conversations peuvent néanmoins faire dépasser la limite ; une réponse HTTP 413 ne signifie pas que la sauvegarde a réussi.

La sauvegarde est différée après les modifications. Une erreur de réseau conserve le cache local et l’état « à sauvegarder ». Une divergence de révision renvoie HTTP 409 et demande de choisir une version dans **Réglages → Données** :

- Conserver la version de cet appareil pour la renvoyer avec la révision courante.
- Restaurer la version du compte ; un export JSON local est proposé avant son remplacement.

Il n’y a pas de fusion automatique des modifications concurrentes. L’export protège les données incluses dans l’instantané, pas les enregistrements audio/vidéo locaux.

## Configuration locale

Utiliser **Node 22.23 ou Node 24 LTS**. Le conteneur de production utilise Node 24. SQLite peut afficher un avertissement expérimental sur Node 22 ; aucun module natif supplémentaire n’est à compiler.

Créer `server/.env`, ignoré par Git, avec des valeurs propres au développement. Pour Google + invité, seuls les paramètres ci-dessous sont nécessaires ; les variables Resend et Twilio doivent rester vides ou absentes :

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3001
APP_ORIGIN=http://127.0.0.1:5173
GOOGLE_CLIENT_ID=875120269160-0telbrlveudsm47o6eit2hgvdkkr03hv.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=
TRUST_PROXY=0
```

Ne pas préfixer les secrets avec `VITE_` : les variables Vite sont destinées au code navigateur. Le client ID Google est public ; son secret, les clés Resend et les identifiants Twilio restent dans l’environnement du serveur. Le secret OAuth communiqué dans la conversation doit être **renouvelé dans Google Cloud avant la mise en ligne** ; sa valeur n’est reproduite dans aucun exemple.

```bash
npm ci
npm --prefix server ci
chmod 600 server/.env
npm run dev:server
```

Dans un autre terminal, lancer `npm run dev`, puis ouvrir **http://127.0.0.1:5173**. Les scripts `dev` et `start` du serveur chargent automatiquement `server/.env` lorsqu’ils sont exécutés avec `npm --prefix server`. Vite transmet `/api` au serveur local.

Si le mode surveillance du serveur échoue avec `EMFILE` ou si le système ne permet pas d’ajouter des observateurs de fichiers, lancer le backend sans surveillance :

```bash
npm run build:server
npm --prefix server start
```

Ce mode charge aussi `server/.env`. Après une modification du serveur, arrêter le processus, reconstruire puis relancer `start`. Le frontend peut conserver son propre terminal Vite.

Conserver le même nom d’hôte dans le navigateur, `APP_ORIGIN` et la configuration Google. `localhost` et `127.0.0.1` sont deux origines différentes. Si `APP_ORIGIN` est absent en développement, les deux origines locales sur le port 5173 sont autorisées ; en production, `APP_ORIGIN` est obligatoire et les mutations doivent venir exactement de cette origine.

### Google

Le parcours local a été validé avec le client Web **Advaya language**. Les URI de redirection autorisées suivantes ont été enregistrées dans Google Cloud avec l’autorisation du propriétaire :

```text
http://127.0.0.1:5173/api/auth/google/callback
https://mathisbnl.fr/api/auth/google/callback
```

Le callback local passe par Vite ; il ne faut donc pas enregistrer le port 3001 à la place du port 5173 pour ce parcours. Si le navigateur utilise `localhost`, ajouter aussi son URI exacte et aligner `APP_ORIGIN`.

La configuration locale utilise `server/.env`, ignoré par Git et en mode 600 ; les identifiants Google restent côté serveur. L’écran Google existant affiche **Quasar Indra** : ce branding partagé a été préservé. En cas de nouveau déploiement ou de changement d’environnement, vérifier les URI exactes, l’accès des comptes de test si nécessaire et `GOOGLE_CLIENT_SECRET`. Le serveur demande seulement `openid email profile`. Il vérifie la signature du jeton Google, son émetteur, son audience, sa fraîcheur, son nonce, l’adresse vérifiée et l’état du parcours ; il utilise PKCE. Voir [la documentation OpenID Connect de Google](https://developers.google.com/identity/openid-connect/openid-connect).

### Option ultérieure désactivée : e-mail avec Resend

Cette section décrit le code disponible ; aucune configuration Resend ni ouverture de compte n’est demandée pour Google + invité.

Créer une clé API Resend et vérifier un domaine d’envoi. Renseigner `RESEND_API_KEY` et une adresse `AUTH_EMAIL_FROM` appartenant à ce domaine, par exemple `Vivre la langue <connexion@exemple.fr>`. L’application appelle l’API HTTP Resend ; elle n’utilise pas un serveur SMTP local.

L’offre gratuite annoncée comprend **3 000 e-mails transactionnels par mois**, avec un plafond de **100 par jour** ; vérifier l’usage réel avant une ouverture à davantage d’utilisateurs. Chaque connexion et chaque renvoi consomment un envoi. Voir les [quotas officiels Resend](https://resend.com/docs/knowledge-base/account-quotas-and-limits).

Tester une réception réelle, les courriers indésirables et un second destinataire après vérification du domaine. Les tests automatisés du dépôt ne prouvent pas la délivrabilité de ce domaine.

### Option ultérieure désactivée : téléphone avec Twilio Verify

Cette section décrit le code disponible ; aucun achat, crédit ni service Twilio n’est demandé pour Google + invité.

Créer un service Twilio Verify, activer le canal SMS et configurer des codes de **six chiffres**. Renseigner les trois variables `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` et `TWILIO_VERIFY_SERVICE_SID`. Autoriser les pays destinataires nécessaires et vérifier les restrictions du compte d’essai avant un test réel.

Les SMS ne constituent pas un service gratuit permanent. Twilio facture Verify et l’acheminement selon le pays et le canal ; les crédits d’essai ne remplacent pas un budget d’exploitation. Voir les [tarifs Twilio Verify](https://www.twilio.com/en-us/verify/pricing). Cette dépense est distincte du coût de la base de données.

Un fournisseur incomplet reste indisponible dans l’interface. Le serveur renvoie HTTP 503 pour un envoi e-mail/SMS non configuré ; il n’invente pas de code envoyé. Un échec du fournisseur renvoie une erreur et ne connecte pas l’utilisateur.

## API et protections

Toutes les routes restent sur la même origine que l’application. Les mutations JSON utilisent `Content-Type: application/json` et doivent respecter `APP_ORIGIN` en production.

| Route | Fonction et accès |
| --- | --- |
| `GET /api/auth/config` | Disponibilité des fournisseurs, sans leurs secrets |
| `GET /api/auth/session` | Compte de la session, ou `user: null` |
| `POST /api/auth/code/request` | Demander un code pour `identifier` ; retourne `challengeId` |
| `POST /api/auth/code/verify` | Vérifier `challengeId` et `code`, puis créer la session |
| `GET /api/auth/google` | Démarrer le parcours Google |
| `GET /api/auth/google/callback` | Vérifier le retour Google et créer la session |
| `PATCH /api/auth/profile` | Enregistrer `name` et terminer l’onboarding ; session nécessaire |
| `POST /api/auth/logout` | Révoquer la session et effacer son cookie |
| `GET /api/account/progress` | Lire `{ payload, revision }` ; session + `X-Account-ID` |
| `PUT /api/account/progress` | Envoyer `{ payload, expectedRevision }` ; session + `X-Account-ID` |
| `GET /api/health` | État du serveur, accessible sans compte |

La session dure au plus 30 jours. Son jeton aléatoire est placé dans un cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production ; seule son empreinte est conservée en base. La déconnexion le révoque côté serveur.

Les demandes de code expirent au bout de dix minutes et autorisent au plus cinq tentatives. Les demandes d’envoi sont limitées par identité et par adresse IP, avec un délai minimal de 60 secondes entre deux envois. Les limites sont persistantes. Derrière Caddy, définir `TRUST_PROXY=1` uniquement lorsque l’application n’est accessible que par ce proxy, qui doit normaliser `X-Forwarded-For`. Sans cette confiance explicite, les limites IP sont regroupées sous une origine directe commune.

La publication, la liste personnelle et la suppression des leçons exigent également un compte et `X-Account-ID`. La lecture d’une leçon explicitement publiée et ses interactions élèves restent accessibles par son lien. Les anciennes leçons sans propriétaire de compte ne peuvent pas être réclamées en devinant leur identifiant.

Les anciennes routes `/api/sync` restent désactivées : le nouveau stockage authentifié utilise `/api/account/progress`. Le proxy DeepL reste disponible en invité avec la clé fournie par ce navigateur ; ses destinations sont fixes et ses requêtes limitées.

## Mise en service sur Oracle

Le nouveau parcours remplace la boîte de connexion HTTP Basic de Caddy. La configuration cible sert publiquement l’onboarding et laisse le serveur contrôler les comptes. Elle n’utilise plus `APP_USER`, `APP_PASSWORD_HASH` ni `DEPLOYMENT_TOKEN` comme authentification utilisateur.

Le passage en production doit déployer **ensemble** l’application reconstruite et la configuration Caddy mise à jour. Retirer seulement la protection HTTP Basic d’une ancienne image ne met pas en service les nouveaux comptes.

Sur la cible Podman/Quadlet, les variables serveur sont lues dans `/etc/vivre-la-langue.env`. Garder ce fichier en mode 600. Définir au minimum `APP_DOMAIN=mathisbnl.fr`, `APP_ORIGIN=https://mathisbnl.fr`, Google et `TRUST_PROXY=1`. Laisser les variables d’envoi e-mail/SMS vides. Le volume `/opt/vivre-la-langue/data:/app/data` doit être conservé et accessible à l’utilisateur 1000 du conteneur.

Les scripts existants sont [scripts/build-oracle-image.sh](../scripts/build-oracle-image.sh), [deploy/oracle/install-units.sh](../deploy/oracle/install-units.sh) et les fichiers Quadlet sous `deploy/oracle/`. Le premier reconstruit les deux projets et prépare une image `linux/amd64` ; l’installateur met en place les unités sans démarrer les services. Les procédures d’hôte restent dans [DEPLOIEMENT_ORACLE_LINUX9.md](DEPLOIEMENT_ORACLE_LINUX9.md). `docker-compose.yml` couvre la variante Docker avec le volume persistant `lessons`.

Avant de considérer une future publication terminée, vérifier sur le domaine : onboarding sans invite HTTP Basic, Google configuré, connexion Google réelle, accès invité avec consentement, déconnexion, reprise de progression depuis un second navigateur et accès public à une leçon publiée. La connexion Google et la sauvegarde ont été validées réellement en local ; ces contrôles sur le domaine de production restent à effectuer. Aucun déploiement n’est engagé par ce guide.

## Sauvegarde et restauration

Le mode WAL peut conserver des écritures récentes dans `accounts.sqlite-wal`. **Ne pas copier uniquement `accounts.sqlite` pendant que le serveur fonctionne.** Le fichier `shared_lessons.json` contient encore les leçons publiées : une sauvegarde complète doit le conserver avec la propriété des leçons enregistrée dans SQLite.

### Sauvegarde complète avec un bref arrêt

Sur l’hôte Oracle, cette procédure sauvegarde tout le répertoire de données et redémarre le service même si l’archivage échoue :

```bash
sudo bash <<'BACKUP'
set -euo pipefail
umask 077
install -d -m 0700 /opt/vivre-la-langue/backups
snapshot="/opt/vivre-la-langue/backups/data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
systemctl stop vivre-app.service
trap 'systemctl start vivre-app.service' EXIT
tar --xattrs --acls --selinux -C /opt/vivre-la-langue -czf "$snapshot" data
chmod 600 "$snapshot"
BACKUP
```

Copier ensuite l’archive dans un emplacement privé hors du VPS. Cette commande ne met en place aucune sauvegarde récurrente et ne copie aucun média conservé dans les navigateurs.

### Instantané des comptes sans arrêter le serveur

L’API de sauvegarde SQLite produit un fichier cohérent, y compris lorsque la base source utilise WAL. La commande suivante s’exécute dans le conteneur Node existant et affiche le chemin du fichier produit :

```bash
sudo podman exec -i vivre-app node --input-type=module <<'SQLITE_BACKUP'
import { DatabaseSync, backup } from 'node:sqlite'
process.umask(0o077)
const source = new DatabaseSync('/app/data/accounts.sqlite', { readOnly: true })
const target = '/app/data/accounts-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite'
await backup(source, target)
source.close()
const check = new DatabaseSync(target, { readOnly: true })
if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Sauvegarde invalide')
check.close()
console.log(target)
SQLITE_BACKUP
```

Extraire ensuite ce fichier vers un dossier privé hors du volume de l’application. Cet instantané couvre les comptes et leur progression, mais ne constitue pas à lui seul une sauvegarde atomique du fichier séparé des leçons. Pour sauvegarder tout l’ensemble au même instant, utiliser la procédure avec arrêt. Voir la [documentation de l’API de sauvegarde SQLite](https://sqlite.org/backup.html).

### Restauration

1. Arrêter `vivre-app.service` et conserver le répertoire de données actuel dans une sauvegarde distincte.
2. Restaurer l’archive complète dans un répertoire propre, ou restaurer l’instantané SQLite avec la version cohérente des leçons nécessaire. Ne pas combiner un nouveau fichier SQLite avec d’anciens fichiers `-wal` ou `-shm`.
3. Rétablir le propriétaire 1000:1000 du répertoire monté et des fichiers, un répertoire privé, le fichier SQLite en mode 600 et les contextes SELinux attendus sur Oracle.
4. Exécuter `PRAGMA integrity_check` avec Node/SQLite sur la copie restaurée, puis redémarrer le service et tester une connexion et la lecture de progression.

Une restauration rétablit aussi les sessions présentes dans la sauvegarde et peut annuler des révocations postérieures. Si la sauvegarde sert à reprendre après un incident de sécurité, révoquer les sessions restaurées et renouveler les secrets concernés avant la réouverture.

## Quels hébergeurs gratuits choisir ?

Comparaison des offres officielles consultées le **3 novembre 2026**. Les quotas peuvent évoluer ; « gratuit » s’applique au plan et à ses limites, pas à une capacité illimitée ni à la livraison des SMS.

| Solution | Offre gratuite pertinente | Intérêt pour ce projet et limites |
| --- | --- | --- |
| **SQLite sur le VPS existant** | Aucun abonnement de base supplémentaire | C’est l’implémentation livrée. Pas de nouveau compte à créer ; capacité liée au disque, à la mémoire et aux quotas du VPS. Sauvegardes et exploitation à assurer. |
| **Supabase** | 500 Mo de base PostgreSQL, 50 000 utilisateurs actifs mensuels, 1 Go de fichiers, deux projets actifs | Le choix managé le plus complet pour réunir base, tableau d’administration, Auth et stockage. Pause après une semaine d’inactivité sur Free. [Offre officielle](https://supabase.com/pricing). |
| **Neon** | 1 Go par projet, 100 CU-heures/mois/projet, 100 projets ; Better Auth jusqu’à 60 000 utilisateurs actifs mensuels par projet | Bon choix PostgreSQL, avec calcul suspendu après cinq minutes sans activité. Intégration et migration à réaliser. [Offre officielle](https://neon.com/pricing). |
| **Firebase** | Firestore : 1 Gio, 50 000 lectures et 20 000 écritures/jour ; authentification Google/e-mail disponible | Ensemble pratique si l’on choisit l’écosystème Google. Modèle de documents différent du SQL ; téléphone disponible sur Blaze et facturé par SMS. [Offre officielle](https://firebase.google.com/pricing). |

**Pour utiliser cette version tout de suite : conserver SQLite sur le VPS existant.** Pour déléguer l’administration de la base et disposer d’un tableau de bord complet, Supabase est la recommandation principale, avec une migration planifiée. Neon est une bonne alternative PostgreSQL si la priorité porte sur la base et ses ressources gratuites.

Avec Supabase, il faut aussi configurer un service SMTP pour envoyer des e-mails aux utilisateurs : le service intégré par défaut est réservé aux adresses de l’équipe et limité à deux messages par heure. Voir [la configuration SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp). La connexion téléphonique nécessite un fournisseur SMS externe, comme expliqué dans [la documentation Supabase téléphone](https://supabase.com/docs/guides/auth/phone-login).

Le lancement retenu propose donc **Google + invité**, sans fournisseur d’envoi à ouvrir ni achat à effectuer. L’e-mail via Resend pourrait être activé plus tard dans son quota gratuit. L’option téléphone reste implémentée et désactivée ; une activation ultérieure avec Twilio demanderait un budget distinct. Aucun projet Supabase, Neon ou Firebase n’a été créé par cette modification.

## Vérifications du dépôt

Depuis la racine du projet :

```bash
npm run build
npm run build:server
npm run test:security
npm run test:sync
npm run test:sharing
npm run test:coach
```

`test:security` lance aussi `scripts/check-auth.mjs`. Les tests utilisent des comptes fictifs, des répertoires temporaires, des ports locaux éphémères et des réponses de fournisseurs simulées. Ils contrôlent notamment OAuth/PKCE/nonce/audience, codes à usage unique, expiration et tentatives, cookies, révocation, origines, limites de taille, isolation entre comptes et onglets, conflits, propriété des leçons, persistance et corruption du stockage. `check-sync.mjs` vérifie les scénarios de synchronisation côté navigateur simulé.

Une vérification distincte a également suivi **le vrai parcours Google local**, avec création du compte, choix du profil et des langues, écriture d’une progression SQLite et contrôle d’intégrité réussi. Cette vérification complète les tests automatisés ; elle ne repose pas sur le fournisseur Google simulé.

Les options e-mail/SMS restent désactivées : leur délivrabilité réelle n’a pas été testée. Aucun de ces résultats ne valide encore le parcours Google sur le domaine de production, la capacité du VPS en charge ni la mise en production de cette version.
