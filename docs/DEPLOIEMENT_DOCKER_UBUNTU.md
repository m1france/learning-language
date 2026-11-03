# Déployer Vivre la langue sur Oracle — 129.151.252.159

Guide préparé le 1 novembre 2026. Tu exécutes les commandes : aucune connexion SSH ni modification du VPS n'a été effectuée depuis cet audit.

> **Mise à jour après connexion SSH :** la cible utilise **Oracle Linux Server 9.8, x86_64**, avec l'utilisateur **opc**. La nouvelle clé `~/.ssh/oracle-always-free` fonctionne. Linux rapporte **498 Mio de RAM** et **497 Mio de swap** ; aucune commande Docker n'a été trouvée dans le PATH. **Ne pas exécuter la section d'installation Ubuntu (`apt`) ci-dessous ni compiler l'application sur le VPS.** Il reste à vérifier la réservation mémoire `crashkernel`, l'espace disque et les services déjà présents avant de finaliser l'installation adaptée à Oracle Linux. La partie Ubuntu reste une référence générique, pas la procédure validée pour cette cible.

Connexion confirmée pour cette instance :

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/oracle-always-free opc@129.151.252.159
```

## Choix du déploiement

Deux conteneurs : l'application Node/Hono et Caddy pour HTTPS + mot de passe. Le port Node 3001 n'est **pas publié**. Les leçons sont conservées dans un volume Docker `vivre-la-langue_lessons`. MySQL n'est pas nécessaire pour ce déploiement privé. Les images sont reconstruites à partir des sources, pas à partir des anciens `dist`.

Cette version convient à **un seul propriétaire**. Toutes les pages et API, y compris les liens `/share/…`, demandent le même identifiant. Ne donne pas ce mot de passe aux élèves : il permet aussi de modifier ou supprimer les leçons. L'accès public aux leçons exige d'abord de vrais droits enseignant/lecteur.

Le domaine n'étant pas encore choisi, les exemples utilisent `langues.ton-domaine.fr`. Remplace-le par le tien. Un nom de domaine avec HTTPS est nécessaire au parcours décrit, notamment pour caméra/micro. Aucun domaine n'a été configuré.

## 1. Préserver les données avant de changer d'adresse

Le VPS stocke les leçons publiées, mais les textes, le vocabulaire, les clés API et réglages sont dans `localStorage`. Les vidéos/audio, conversations et certains historiques sont dans IndexedDB. Le nouveau serveur **ne récupère pas** ces données. Un changement de domaine crée un nouvel espace de stockage navigateur.

- Si possible, conserve exactement l'ancien domaine et le même profil navigateur : changer seulement son DNS conserve généralement ce stockage local. Ne vide pas les données du site.
- Garde une sauvegarde de ton profil navigateur avant la migration. Télécharge les enregistrements importants depuis l'application. Il n'existe pas encore d'export/import complet de toutes les bases IndexedDB dans l'interface.
- Sur l'ancien site, un export partiel de `localStorage` est possible depuis la console du navigateur : `copy(JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])), null, 2))`. Conserve le résultat localement dans un fichier privé : il peut contenir tes clés API. Ce n'est **pas** une sauvegarde des vidéos ni des conversations IndexedDB, ni une procédure de restauration complète.
- Si tu disposes d'une sauvegarde de l'ancien serveur, récupère `shared_lessons.json` et/ou un dump MySQL. Sans cette sauvegarde, aucune récupération de l'ancien VPS ne peut être promise.

## 2. Vérifier le VPS et se connecter

Depuis ton Mac, avec l'utilisateur et la clé de création de ton instance :

```bash
ssh -i /chemin/vers/ta-cle-privee ubuntu@129.151.252.159
```

`ubuntu` correspond aux images Ubuntu. Pour Oracle Linux, l'utilisateur par défaut est généralement `opc` et les commandes d'installation ci-dessous doivent être adaptées. Vérifie d'abord :

```bash
cat /etc/os-release
uname -m
free -h
df -h /
sudo ss -ltnp
command -v docker
```

La suite suppose Ubuntu 22.04/24.04/26.04 64 bits et des droits `sudo`. Ne réinstalle pas Docker s'il fonctionne déjà. Si les ports 80/443 servent déjà un autre site, n'arrête pas ce site : utilise son reverse proxy existant selon la section dédiée plus bas.

## 3. DNS et réseau Oracle

Dans la zone DNS de ton domaine, crée :

| Type | Nom | Valeur |
| --- | --- | --- |
| A | `langues` | `129.151.252.159` |

Au début, utilise un enregistrement DNS direct, sans proxy CDN. Supprime ou corrige un éventuel AAAA qui pointerait ailleurs.

Dans la console Oracle : instance → VNIC/sous-réseau → NSG associé ou Security List. Ajoute des règles entrantes **stateful**, ports source « All » :

| Protocole | Port destination | Source |
| --- | --- | --- |
| TCP | 22 | ton IP publique `/32` si possible, en conservant ton accès actuel |
| TCP | 80 | `0.0.0.0/0` |
| TCP | 443 | `0.0.0.0/0` |

N'ouvre pas 3001, 3306 ou l'API d'administration Caddy. Vérifie aussi la route Internet Gateway et le pare-feu de l'OS. Ne supprime pas les règles Oracle existantes ni les règles iSCSI. Sur les images Ubuntu Oracle, ne remplace pas aveuglément le pare-feu par UFW.

```bash
sudo iptables -S
sudo ip6tables -S
```

S'il faut ouvrir HTTP/HTTPS dans une chaîne INPUT restrictive, ajoute uniquement ces autorisations, avant le REJECT existant, puis sauvegarde avec l'outil déjà utilisé par la machine :

```bash
sudo iptables -I INPUT 1 -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT
```

Ces deux commandes concernent le trafic vers l'hôte. Les ports publiés Docker passent aussi par les chaînes de transfert Docker ; si leur politique bloque, inspecte `FORWARD`/`DOCKER-USER` et adapte le pare-feu existant. Ne fais pas de `iptables -F`. Le filtrage Oracle reste nécessaire : les ports publiés Docker peuvent contourner UFW.

## 4. Installer Docker si absent (Ubuntu uniquement)

Sur une machine où Docker n'est pas déjà installé :

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl rsync nano
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF_DOCKER
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF_DOCKER
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker compose version
```

Si `apt` détecte un conflit avec Docker/Podman/containerd déjà présents, suis la documentation officielle sans désinstaller automatiquement les services utilisés par d'autres applications.

## 5. Copier le dépôt corrigé depuis le Mac

Sur le VPS, crée un dossier neuf, sans écraser une installation existante :

```bash
mkdir -p "$HOME/apps/vivre-la-langue"
chmod 700 "$HOME/apps/vivre-la-langue"
```

Dans un **nouveau terminal de ton Mac**, en conservant la session SSH ouverte :

```bash
cd /Users/mathis/Documents/GitHub/learning-language
rsync -az --exclude='.git' --exclude='.claude' --exclude='node_modules' --exclude='server/node_modules' --exclude='dist' --exclude='server/dist' --exclude='server/data' --exclude='.env' --exclude='*.tsbuildinfo' --exclude='vite.config.js' --exclude='vite.config.d.ts' --exclude='.DS_Store' --exclude='deploy/backups' -e 'ssh -i /chemin/vers/ta-cle-privee' ./ ubuntu@129.151.252.159:apps/vivre-la-langue/
```

Cette commande copie aussi les corrections locales non commitées. Elle n'utilise pas `--delete` et ne transfère ni clés API locales ni ancienne base de données.

## 6. Préparer les secrets sur le VPS

Retour dans la session SSH :

```bash
cd "$HOME/apps/vivre-la-langue"
umask 077
cp -n .env.example .env
chmod 600 .env
sudo docker run --rm -it caddy:2-alpine caddy hash-password
openssl rand -hex 32
nano .env
```

Le premier outil demande un **nouveau mot de passe d'accès au site** puis affiche son hash bcrypt. La commande OpenSSL crée un secret distinct entre Caddy et le backend. Dans `.env`, complète :

```dotenv
APP_DOMAIN=langues.ton-domaine.fr
APP_USER=mathis
APP_PASSWORD_HASH='$2a$14$COLLER_LE_HASH_COMPLET_ICI'
DEPLOYMENT_TOKEN=COLLER_LES_64_CARACTERES_HEXADECIMAUX_ICI
```

Conserve les **guillemets simples autour du hash bcrypt**, pour que Compose préserve les `$`. N'utilise pas le mot de passe en clair dans ce champ. Ne copie pas le `.env` dans Git ou dans cette conversation. Les clés IA personnelles continuent à se saisir dans les paramètres du navigateur ; elles ne sont pas préconfigurées sur le serveur.

## 7. Construire et démarrer

```bash
cd "$HOME/apps/vivre-la-langue"
sudo docker compose config --quiet
sudo docker compose build --pull
sudo docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=80 app caddy
```

La construction compile le frontend et le backend dans des étapes séparées. Le runtime ne contient pas les dépendances de développement, FFmpeg ou yt-dlp. Le backend fonctionne avec un utilisateur non root et un système de fichiers en lecture seule, sauf le volume des leçons.

Caddy obtient le certificat quand le domaine pointe bien vers le VPS et que les ports requis sont accessibles. Sur une petite instance à 1 Go de RAM, la compilation peut manquer de mémoire : surveille `free -h` et les logs. Aucune mesure de capacité n'a été faite sur ton VPS.

## 8. Vérifier le résultat depuis le Mac

Remplace le domaine avant de lancer :

```bash
curl -I https://langues.ton-domaine.fr
curl -u mathis https://langues.ton-domaine.fr/api/health
curl -I http://langues.ton-domaine.fr
```

Résultats attendus : `401` sans identifiants en HTTPS, JSON `status: ok` avec le mot de passe demandé par curl, redirection HTTP vers HTTPS. Ne mets pas le mot de passe après `-u mathis:` dans l'historique du terminal.

Dans le navigateur : ouvre le domaine, connecte-toi, importe un texte, recharge et vérifie sa conservation, teste caméra/micro et vérifie l'absence d'erreurs dans la console. Publie une petite leçon, ouvre son lien dans une fenêtre privée et vérifie que le mot de passe est demandé. Sur le VPS, `sudo docker compose restart app` ne doit pas faire disparaître cette leçon. Les appels IA/DeepL demandent tes propres clés et restent à tester réellement.

Vérifie que 3001/3306 ne sont pas accessibles publiquement. Une simple commande `compose up` réussie ne prouve ni DNS, ni HTTPS, ni authentification, ni fonctionnement dans le navigateur.

## Sauvegarder et restaurer les leçons serveur

Sur le VPS :

```bash
cd "$HOME/apps/vivre-la-langue"
mkdir -p deploy/backups
chmod 700 deploy/backups
umask 077
sudo docker compose exec -T app node -e 'const fs=require("node:fs");process.stdout.write(fs.existsSync("/app/data/shared_lessons.json")?fs.readFileSync("/app/data/shared_lessons.json","utf8"):"{}")' > "deploy/backups/lessons-$(date +%Y%m%d-%H%M%S).json"
```

Copie ces fichiers hors du VPS et conserve aussi `.env` dans un emplacement privé. Cela ne sauvegarde **pas** les données des navigateurs. Les certificats sont dans le volume Caddy ; ils peuvent être réémis, mais leur sauvegarde évite des réémissions inutiles.

Pour restaurer un fichier JSON connu et vérifié, arrête d'abord l'application et garde une sauvegarde de la version actuelle. Adapte le nom du fichier :

```bash
sudo docker compose stop app
sudo docker compose run --rm --no-deps -T app node -e 'const fs=require("node:fs");const raw=fs.readFileSync(0,"utf8");const data=JSON.parse(raw);if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Invalid backup");fs.writeFileSync("/app/data/shared_lessons.json",raw,{mode:0o600})' < deploy/backups/lessons-YYYYMMDD-HHMMSS.json
sudo docker compose up -d app
```

La restauration remplace les leçons du volume, pas les données locales. Ne réutilise pas un ancien fichier de synchronisation globale qui contient les clés API. Le mode MySQL hérité n'est pas utilisé par cette configuration : un dump SQL demande une migration explicite vers le fichier des leçons.

## Mettre à jour et revenir en arrière

Avant une mise à jour, sauvegarde les leçons et garde une copie du dossier source et du `.env`. Sur le VPS :

```bash
sudo docker image tag vivre-la-langue:local vivre-la-langue:previous
```

Recopie ensuite les sources modifiées par `rsync`, puis :

```bash
sudo docker compose build --pull
sudo docker compose up -d
sudo docker compose ps
```

Pour revenir à l'image précédente, sans reconstruire :

```bash
sudo docker image tag vivre-la-langue:previous vivre-la-langue:local
sudo docker compose up -d --no-build --force-recreate app
```

Si la configuration a changé, restaure également ses anciens fichiers et secrets. Les images de base Node/Caddy utilisent des tags mis à jour : pour une exploitation strictement reproductible, épingle des digests validés et mets-les à jour périodiquement. `docker compose down` conserve les volumes ; **`docker compose down -v` les supprime**.

## Si un reverse proxy utilise déjà 80/443

Ne démarre pas le service Caddy fourni sur ces mêmes ports. Utilise `sudo docker compose up -d --build app` et raccorde le proxy existant à l'application par un réseau Docker dédié, ou publie seulement `127.0.0.1:3001:3001` dans un override local si ce proxy tourne sur l'hôte.

Le proxy existant doit réaliser les mêmes protections que `deploy/Caddyfile` : HTTPS, authentification sur **toutes** les routes, remplacement de l'en-tête `X-Deployment-Token` par le secret du `.env`, suppression de l'en-tête Authorization avant le backend. N'expose pas le secret au navigateur. Ne publie jamais directement `0.0.0.0:3001` pour contourner un problème d'accès.

## Sources vérifiées

- [Connexion à une instance Oracle](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/accessinginstance.htm)
- [Security Lists Oracle](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm)
- [Problèmes connus Compute et pare-feu Ubuntu](https://docs.oracle.com/en-us/iaas/Content/Compute/known-issues.htm)
- [Installation Docker sur Ubuntu et limites UFW](https://docs.docker.com/engine/install/ubuntu/)
- [Authentification Caddy](https://caddyserver.com/docs/caddyfile/directives/basic_auth)
- [HTTPS automatique Caddy](https://caddyserver.com/docs/automatic-https)
