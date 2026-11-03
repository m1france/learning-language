# Mise en service Oracle — 1 novembre 2026

> **Mise à jour du 3 novembre 2026 — nouvelle authentification dans le dépôt, pas encore déployée.**
> Lire [AUTHENTIFICATION.md](AUTHENTIFICATION.md) pour les comptes Google/e-mail/téléphone, SQLite, les fournisseurs, les nouvelles variables et la sauvegarde.
> Ce document conserve l’état et les procédures du déploiement du **1er novembre 2026**. Ses mentions de mot de passe propriétaire, `basic_auth`, `APP_PASSWORD_HASH` ou `DEPLOYMENT_TOKEN`, de liens entièrement privés et de progression exclusivement locale décrivent l’ancienne version. Elles ne doivent pas être réappliquées à la nouvelle configuration.
> Pour une mise à jour, déployer ensemble l’image reconstruite et les fichiers Caddy/Quadlet actuels, préserver tout le répertoire de données et valider réellement les fournisseurs. Les anciens résultats HTTP 401 ne prouvent pas le fonctionnement du nouvel onboarding. **Aucune nouvelle publication ni modification du VPS n’a été réalisée pendant ce travail.**

## Référence historique du 1er novembre 2026


## Résultat

L’application est hébergée sur **https://mathisbnl.fr**, avec HTTPS et authentification propriétaire. `https://www.mathisbnl.fr` redirige vers le domaine principal en conservant le chemin et les paramètres.

Le déploiement reste privé : les liens de leçons demandent également le mot de passe. Les droits entre plusieurs utilisateurs ne sont pas implémentés.

## Infrastructure

- VPS : `opc@129.151.252.159`, Oracle Linux 9.8, x86_64 ; 945 Mio de RAM visible.
- Clé SSH testée : `~/.ssh/ssh-key-2026-10-11.key`, avec vérification stricte de la clé d’hôte. La clé `oracle-always-free` était refusée au contrôle.
- Podman 5.8.2, cgroup v2, réseau Netavark/Aardvark ; Caddy 2.11.7 ; image Node 24 construite sur le Mac pour `linux/amd64`.
- Services `vivre-app.service` et `vivre-caddy.service`, générés par Quadlet et rattachés au démarrage de `multi-user.target`.
- Unités : `/etc/containers/systemd/`. Caddyfile : `/opt/vivre-la-langue/Caddyfile`.
- Leçons : `/opt/vivre-la-langue/data`, montage persistant avec label SELinux privé. Certificats et configuration Caddy dans les volumes Podman dédiés.
- Application non root (`node`, UID 1000), système de fichiers en lecture seule, aucun port backend publié sur l’hôte.
- Limites systemd configurées : application 320 Mio, Caddy 128 Mio ; heap Node 128 Mio et `GOMEMLIMIT=80MiB` pour Caddy.
- Pare-feu local : HTTP/HTTPS ajoutés à la zone `public` de `ens3`, sans retirer SSH. Les règles Oracle autorisaient déjà TCP 22, 80 et 443 ; elles n’ont pas été modifiées.

Le cache automatique `dnf-makecache.service`, observé en activité après installation, est limité par `/etc/systemd/system/dnf-makecache.service.d/90-vivre-resources.conf` : mémoire 650 Mio, swap 1500 Mio, CPUWeight/IOWeight 10 et Nice 10. Le timer et les commandes de mise à jour sont conservés.

Le swap initial de 497 Mio est conservé. Le script a ajouté 2 Gio dans `/var/lib/vivre-la-langue.swap`, mode 600, avec entrée dans `/etc/fstab` et copie préalable de ce dernier. La réservation Kdump retourne `0` ; l’assistant n’a pas modifié les paramètres de boot.

## DNS et HTTPS

Les modifications ont été confirmées dans IONOS et contrôlées sur un serveur autoritaire IONOS, Cloudflare et Google :

| Type | Nom | Valeur | TTL |
| --- | --- | --- | --- |
| A | `@` | `129.151.252.159` | 300 |
| A | `www` | `129.151.252.159` | 300 |

Les MX, TXT, serveurs de noms et autres sous-domaines, notamment `gssa` et `n8n`, ont été préservés. Aucun changement n’a été effectué sur l’ancien serveur `79.72.28.219`.

Caddy a obtenu les certificats Let’s Encrypt pour le domaine principal et `www`. La vérification TLS réussit sans désactiver la validation des certificats.

| Contrôle externe sur le nouveau VPS | Résultat |
| --- | --- |
| HTTP domaine principal | 308 vers HTTPS |
| HTTPS sans identifiants | 401 |
| `/api/health` avec identifiants | 200, `status: ok` |
| Page avec identifiants | 200, HTML « Vivre la langue » |
| JavaScript principal, runtime et CSS | 200, types MIME corrects |
| `https://www.mathisbnl.fr/test?check=1` | 301 vers `https://mathisbnl.fr/test?check=1` |

Les vérifications ciblées utilisent `curl --resolve` pour isoler le serveur testé. Le cache système du Mac renvoyait initialement l’ancienne IP. Après rafraîchissement effectué par le propriétaire, le contrôle normal sans `--resolve` confirme `129.151.252.159`, HTTP/2 401 et `ssl_verify_result=0`. Le domaine fonctionne donc également via la résolution normale du Mac. Le contrôle authentifié final de `/api/health` sans forcer la résolution retourne aussi 200 depuis `129.151.252.159`, avec TLS valide.

## Accès et artefact

- Identifiants du site sur le Mac : `deploy/artifacts/acces-mathisbnl.txt`.
- Configuration locale : `deploy/artifacts/oracle.env`. Configuration active : `/etc/vivre-la-langue.env`, root, mode 600. La copie de transfert dans le dossier personnel du VPS a été retirée après comparaison.
- Les fichiers locaux sont en mode 600, exclus de Git et du contexte de construction. Aucune clé IA n’a été ajoutée à l’image.
- Archive : `deploy/artifacts/vivre-oracle-amd64.tar.gz`, environ 61 Mio.
- SHA-256 comparé après transfert : `d5b32f8bd49e8dd89b014139d571d10e7990c20450e5cd55ccd839bffe53df5d`.

## Validation et limites

Compilation frontend/backend et tests Coach/sécurité réussis. Image exécutée localement puis sur Oracle. Backend sans token : 401 ; token injecté par Caddy après authentification : 200. Un fichier temporaire a confirmé l’écriture avec l’UID 1000 et sa conservation après redémarrage de `vivre-app.service`, puis a été supprimé.

Le premier essai d’installation utilisait les dépôts Oracle par défaut et n’a pas abouti ; les connexions SSH suivantes ne répondaient plus. Le propriétaire a autorisé un redémarrage de cette instance uniquement. La reprise avec swap supplémentaire, limite mémoire et dépôts BaseOS/AppStream/Addons a réussi en environ 27 minutes. La cause précise du blocage initial n’est pas établie ; aucun journal persistant du boot précédent n’était disponible.

Pas de migration des données des navigateurs, de test des fournisseurs IA payants, de caméra/micro réels, de test de charge ou de nouveau redémarrage complet du VPS après déploiement. Les dépendances de démarrage systemd et le redémarrage du service applicatif ont été contrôlés. La page et ses ressources ont été vérifiées par HTTP ; cela ne constitue pas un nouveau test de tous les parcours de l’interface.

Voir [le guide Oracle Linux](DEPLOIEMENT_ORACLE_LINUX9.md) pour les sauvegardes, mises à jour et retours arrière. Les limites applicatives de l’audit restent applicables.
