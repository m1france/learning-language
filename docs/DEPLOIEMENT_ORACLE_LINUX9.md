# Oracle Linux 9 — mathisbnl.fr

> **Mise à jour du 3 novembre 2026 — nouvelle authentification dans le dépôt, pas encore déployée.**
> Lire [AUTHENTIFICATION.md](AUTHENTIFICATION.md) pour les comptes Google/e-mail/téléphone, SQLite, les fournisseurs, les nouvelles variables et la sauvegarde.
> Ce document conserve l’état et les procédures du déploiement du **1er novembre 2026**. Ses mentions de mot de passe propriétaire, `basic_auth`, `APP_PASSWORD_HASH` ou `DEPLOYMENT_TOKEN`, de liens entièrement privés et de progression exclusivement locale décrivent l’ancienne version. Elles ne doivent pas être réappliquées à la nouvelle configuration.
> Pour une mise à jour, déployer ensemble l’image reconstruite et les fichiers Caddy/Quadlet actuels, préserver tout le répertoire de données et valider réellement les fournisseurs. Les anciens résultats HTTP 401 ne prouvent pas le fonctionnement du nouvel onboarding. **Aucune nouvelle publication ni modification du VPS n’a été réalisée pendant ce travail.**

## Référence historique du 1er novembre 2026


Cible : `opc@129.151.252.159`, Oracle Linux 9.8 x86_64. Guide préparé et vérifié le 1 novembre 2026. Voir [l'état réel de la mise en service](MISE_EN_SERVICE_ORACLE.md) pour distinguer les étapes effectuées de celles restant à réaliser.

La clé testée avec succès pendant la mise en service est `~/.ssh/ssh-key-2026-10-11.key`. La clé `oracle-always-free` est actuellement refusée par le serveur ; ne pas la supprimer pour autant.

Le site sera privé, avec le même mot de passe propriétaire pour toutes les pages et API. Les liens partagés ne seront pas publics. Les données principales restent dans les navigateurs : le nouveau VPS n'en fait pas de sauvegarde automatique.

## 1. Récupérer les 448 Mio réservés à Kdump

**Déjà effectué sur cette instance** : le contrôle après mise en service retourne `0` pour `/sys/kernel/kexec_crash_size` et 945 Mio de RAM visible. Passer cette étape si la valeur est déjà `0`. Aucun changement de boot supplémentaire n’est nécessaire pour une mise à jour de l’application.

Le noyau réserve actuellement `469762048` octets, soit 448 Mio, avec `crashkernel=1G-64G:448M,64G-:512M`. Pour ce petit VPS, on peut récupérer cette mémoire en désactivant Kdump. **Cela supprime la collecte spécialisée de dumps en cas de plantage du noyau.** Les journaux ordinaires restent disponibles. Cette étape modifie le démarrage et nécessite un redémarrage ; garder l'accès à la console Oracle.

Dans la session SSH du VPS :

```bash
sudo grubby --info=ALL | tee "$HOME/boot-before-vivre.txt"
sudo cp -n /etc/default/grub /etc/default/grub.before-vivre
sudo systemctl disable --now kdump
sudo grubby --update-kernel=ALL --remove-args='crashkernel'
sudo grubby --info=DEFAULT
```

La ligne `args` ne doit plus contenir `crashkernel=`. Le paramètre distinct `crash_kexec_post_notifiers` peut rester. Puis :

```bash
sudo reboot
```

La connexion SSH se ferme. Après le redémarrage, depuis le Mac :

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/ssh-key-2026-10-11.key opc@129.151.252.159
```

Sur le VPS :

```bash
free -h
cat /sys/kernel/kexec_crash_size
```

Le second résultat doit être `0`. La mémoire totale visible devrait augmenter d'environ 448 Mio ; la quantité disponible dépend des autres processus. Vérifier à nouveau après une mise à jour du noyau.

Pour réactiver ultérieurement Kdump :

```bash
sudo grubby --update-kernel=ALL --args='crashkernel=1G-64G:448M,64G-:512M'
sudo systemctl enable kdump
sudo reboot
```

## 2. Installer le runtime sur le VPS

Podman est fourni dans les dépôts Oracle Linux et n'utilise pas de daemon Docker permanent. Pour ce VPS de 1 Go, le script ajoute 2 Go de swap si nécessaire et limite la mémoire de l'installateur. Depuis le Mac :

```bash
scp -o IdentitiesOnly=yes -i ~/.ssh/ssh-key-2026-10-11.key deploy/oracle/bootstrap-runtime.sh opc@129.151.252.159:bootstrap-vivre-runtime.sh
ssh -o IdentitiesOnly=yes -i ~/.ssh/ssh-key-2026-10-11.key opc@129.151.252.159 'sudo bash ~/bootstrap-vivre-runtime.sh'
```

La première installation validée sur ce VPS Micro a pris environ 27 minutes. Le script limite cette commande aux dépôts BaseOS, AppStream et Addons ; il ne change pas la configuration permanente des dépôts. Il préserve le swap existant et ajoute uniquement `/var/lib/vivre-la-langue.swap` à `/etc/fstab`, avec une copie préalable de ce dernier. Il limite également les ressources et la priorité de `dnf-makecache.service`, sans désactiver son timer ni les mises à jour. Puis, sur le VPS :

```bash
podman --version
sudo podman info --format '{{.Host.CgroupsVersion}}'
sudo firewall-cmd --state
```

Quadlet exige cgroup v2. Si une commande échoue, conserver son erreur pour diagnostic avant de continuer. `firewall-cmd` peut être absent/inactif : il faudra alors identifier le pare-feu réellement utilisé, sans en installer un autre à l'aveugle.

Ne pas lancer `npm install` ou une compilation Docker sur ce VPS. Les limites mémoire des conteneurs sont des budgets initiaux, pas une garantie de capacité : application 320 Mio avec heap Node 128 Mio, Caddy 128 Mio. Observer la RAM/swap en usage réel.

## 3. Construire l'image depuis le Mac

Docker Desktop doit être installé et démarré sur le **Mac**. Le Docker CLI seul ne suffit pas. Dans un terminal local :

```bash
cd /Users/mathis/Documents/GitHub/learning-language
bash scripts/build-oracle-image.sh
```

Le script construit explicitement une image **linux/amd64**, même sur un Mac Apple Silicon. Il exporte le runtime dans `deploy/artifacts/vivre-oracle-amd64.tar.gz` et affiche son SHA-256. Les secrets, données, anciens builds et archives sont exclus du contexte Docker. Le build compile les sources dans ses propres étapes.

Cette construction sous émulation peut être plus lente sur Apple Silicon. Le script s'arrête si le daemon Docker est absent. L'image n'est poussée vers aucun registre public.

## 4. Transférer l'image et les fichiers de déploiement

Sur le VPS :

```bash
mkdir -p "$HOME/apps/vivre-la-langue"
chmod 700 "$HOME/apps/vivre-la-langue"
```

Sur le Mac :

```bash
cd /Users/mathis/Documents/GitHub/learning-language
rsync -az --exclude oracle.env --exclude acces-mathisbnl.txt -e 'ssh -i /Users/mathis/.ssh/ssh-key-2026-10-11.key -o IdentitiesOnly=yes' deploy/ opc@129.151.252.159:apps/vivre-la-langue/deploy/
```

Sur le VPS :

```bash
cd "$HOME/apps/vivre-la-langue"
sha256sum deploy/artifacts/vivre-oracle-amd64.tar.gz
sudo podman load -i deploy/artifacts/vivre-oracle-amd64.tar.gz
sudo podman image inspect localhost/vivre-la-langue:oracle --format '{{.Os}}/{{.Architecture}}'
sudo podman pull docker.io/library/caddy:2-alpine
```

Comparer le SHA-256 avec celui affiché sur le Mac. L'image doit annoncer `linux/amd64`.

## 5. Préparer les secrets

Sur le VPS :

```bash
sudo podman run --rm -it docker.io/library/caddy:2-alpine caddy hash-password
openssl rand -hex 32
sudo install -m 600 deploy/oracle/oracle.env.example /etc/vivre-la-langue.env
sudo vi /etc/vivre-la-langue.env
```

Choisir un nouveau mot de passe d'accès au site dans l'outil Caddy, puis copier le hash obtenu. OpenSSL génère le secret distinct entre Caddy et le backend. Exemple du fichier final :

```dotenv
APP_DOMAIN=mathisbnl.fr
APP_ORIGIN=https://mathisbnl.fr
APP_USER=mathis
APP_PASSWORD_HASH=$2a$14$COLLER_LE_HASH_COMPLET
DEPLOYMENT_TOKEN=COLLER_LES_64_CARACTERES_HEXADECIMAUX
```

**Ici les valeurs sont SANS guillemets** : c'est un env-file Podman, contrairement au `.env` de Compose. Le script d'installation vérifie le format du hash et du token. Ne pas envoyer ce fichier dans la conversation ni le mettre dans Git. Les clés IA restent saisies dans les paramètres du navigateur.

## 6. Installer les services et tester le backend avant la bascule

```bash
cd "$HOME/apps/vivre-la-langue"
sudo bash deploy/oracle/install-units.sh
sudo podman run --rm --env-file /etc/vivre-la-langue.env -v /opt/vivre-la-langue/Caddyfile:/etc/caddy/Caddyfile:ro,Z docker.io/library/caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl start vivre-app.service
sudo systemctl status vivre-app.service --no-pager
sudo podman exec vivre-app node -e 'fetch("http://127.0.0.1:3001/api/health",{headers:{"x-deployment-token":process.env.DEPLOYMENT_TOKEN}}).then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})'
sudo podman exec vivre-app node -e 'fetch("http://127.0.0.1:3001/api/health").then(r=>{console.log(r.status);process.exit(r.status===401?0:1)}).catch(()=>process.exit(1))'
```

Attendus : premier test `200` et `status: ok`, second test `401`. Aucun port 3001 n'est publié. L'application utilise un compte non root dans le conteneur et un rootfs en lecture seule. Ses données sont dans `/opt/vivre-la-langue/data`, avec un label SELinux privé `:Z` ; SELinux reste activé.

Les unités Quadlet génèrent les services systemd. Leur section `[Install]` les rattache au démarrage : il ne faut pas utiliser `systemctl enable` sur ces services générés. Les configurations et certificats Caddy ont leurs propres volumes.

Si un service n'est pas généré :

```bash
sudo /usr/lib/systemd/system-generators/podman-system-generator --dryrun
sudo journalctl -u vivre-app.service -n 80 --no-pager
```

## 7. Préparer les pare-feu et remplacer le site visible

Avant changement DNS, sauvegarder les données de l'ancienne application que tu souhaites conserver et noter son ancienne adresse : **79.72.28.219**. Les noms de serveurs DNS observés sont sous `ui-dns` ; utiliser l'interface du fournisseur qui gère réellement la zone.

Dans Oracle : NSG ou Security List associé au VPS, autoriser TCP entrant 80 et 443 depuis `0.0.0.0/0`. Conserver SSH 22 et ses règles actuelles. Ne pas ouvrir 3001, 3306 ou l'administration Caddy.

Si firewalld est actif, identifier la zone de l'interface réseau :

```bash
sudo firewall-cmd --get-active-zones
```

Puis autoriser HTTP/HTTPS dans **cette zone**. Remplacer `public` ci-dessous si la zone active porte un autre nom :

```bash
sudo firewall-cmd --zone=public --permanent --add-service=http
sudo firewall-cmd --zone=public --permanent --add-service=https
sudo firewall-cmd --reload
```

Ne pas vider les règles iptables et ne pas désactiver SELinux. Le filtrage Oracle doit aussi être correct, indépendamment des chaînes réseau créées par Podman.

Dans la zone DNS, modifier uniquement l'enregistrement de l'application :

| Type | Nom | Ancienne valeur observée | Nouvelle valeur |
| --- | --- | --- | --- |
| A | `@` / `mathisbnl.fr` | `79.72.28.219` | `129.151.252.159` |
| A | `www` | `79.72.28.219` | `129.151.252.159` |

Conserver MX, TXT, autres sous-domaines et serveurs DNS, notamment `gssa` et `n8n`. Aucun AAAA n'a été renvoyé lors du contrôle ; s'il en existe un au moment de modifier, vérifier qu'il dessert bien le nouveau site. Caddy redirige `www.mathisbnl.fr` vers `mathisbnl.fr`, en conservant le chemin.

Sur le VPS, après la modification DNS :

```bash
sudo systemctl start vivre-caddy.service
sudo systemctl status vivre-caddy.service --no-pager
sudo journalctl -u vivre-caddy.service -n 80 --no-pager
```

Caddy gère le certificat et la redirection HTTPS. Si la résolution publique pointe encore sur l'ancien VPS, attendre la propagation puis redémarrer uniquement Caddy pour relancer la demande. Une période de transition peut montrer l'ancienne application à certains visiteurs selon leur cache DNS.

## 8. Vérifier depuis le Mac

```bash
dig +short A mathisbnl.fr
curl -I http://mathisbnl.fr
curl -I https://mathisbnl.fr
curl -u mathis https://mathisbnl.fr/api/health
```

Attendus : nouvelle IP, redirection HTTP vers HTTPS, `401` en HTTPS sans identifiants, JSON `status: ok` avec le mot de passe demandé par curl.

Dans le navigateur : connexion, import d'un petit texte, rechargement, création/lecture d'une leçon et test de persistance après `sudo systemctl restart vivre-app.service`. Vérifier console, caméra/micro et appels IA avec tes propres clés. L'interface de publication possède encore des limites documentées dans l'audit : vérifier la présence réelle de la leçon après publication, pas seulement le message affiché.

Pour surveiller le VPS :

```bash
free -h
sudo podman stats --no-stream
sudo journalctl -u vivre-app.service -u vivre-caddy.service -n 80 --no-pager
```

## 9. Retirer l'ancienne application et conserver un retour arrière

Changer le DNS remplace l'application visible sur `mathisbnl.fr` ; cela ne supprime pas les fichiers de l'ancien VPS. Une fois le nouveau site vérifié, identifier le service/conteneur de l'ancienne application sur `79.72.28.219`, sauvegarder ses données utiles et retirer **uniquement ce service et ses fichiers**. Ne pas terminer l'instance ni supprimer un volume entier si elle héberge d'autres services. Le nom du service de l'ancienne application n'est pas encore connu : aucune commande de suppression ciblée ne peut être donnée sans cet inventaire.

Si la bascule échoue, restaurer temporairement l'enregistrement A vers `79.72.28.219` tant que l'ancien service existe. Pour arrêter le nouveau site sans perdre ses données :

```bash
sudo systemctl stop vivre-caddy.service vivre-app.service
```

Avant chaque mise à jour :

```bash
sudo podman image tag localhost/vivre-la-langue:oracle localhost/vivre-la-langue:previous
sudo cp -a /opt/vivre-la-langue/data "$HOME/vivre-data-backup-$(date +%Y%m%d-%H%M%S)"
```

Pour une sauvegarde cohérente du JSON lors d'une écriture concurrente, arrêter brièvement l'application pendant la copie. Conserver aussi `/etc/vivre-la-langue.env` dans un emplacement privé et les backups hors VPS. Ces sauvegardes ne couvrent pas localStorage/IndexedDB des navigateurs.

Après transfert et chargement de la nouvelle image, `sudo systemctl restart vivre-app.service` l'applique. Retour à l'image précédente : arrêter l'app, retaguer `previous` vers `oracle`, démarrer l'app. Ne pas supprimer les données ni les volumes de certificats pour une simple mise à jour.

## Validation de cette préparation

Build Docker `linux/amd64`, installation Podman, unités Quadlet, backend, accès anonyme refusé, volume persistant après redémarrage du service, DNS IONOS et certificats HTTPS ont été exécutés et vérifiés. Voir [le compte rendu de mise en service](MISE_EN_SERVICE_ORACLE.md) pour les résultats et limites. Les commandes de changement de boot ci-dessus sont conservées à titre de procédure ; l’assistant n’a pas modifié le boot pendant cette mise en service.

Sources : [swap Oracle Linux](https://docs.oracle.com/en/operating-systems/oracle-linux/9/stordev/stordev-ImplementingSwapSpaces.html), [Kdump et mémoire](https://docs.oracle.com/en/operating-systems/oracle-linux/9/boot/kdump-memory_reservation.html), [gestion des paramètres de boot](https://docs.oracle.com/en/learn/oracle-linux-kernels/), [installation Podman](https://docs.oracle.com/en/operating-systems/oracle-linux/podman/install.html), [Quadlet Oracle](https://docs.oracle.com/en/operating-systems/oracle-linux/podman/quadlets.html), [référence Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html).
