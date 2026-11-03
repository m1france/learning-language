# Déployer sur mathisbnl.fr — Oracle Linux

> **Mise à jour du 3 novembre 2026 — nouvelle authentification dans le dépôt, pas encore déployée.**
> Lire [AUTHENTIFICATION.md](AUTHENTIFICATION.md) pour les comptes Google/e-mail/téléphone, SQLite, les fournisseurs, les nouvelles variables et la sauvegarde.
> Ce document conserve l’état et les procédures du déploiement du **1er novembre 2026**. Ses mentions de mot de passe propriétaire, `basic_auth`, `APP_PASSWORD_HASH` ou `DEPLOYMENT_TOKEN`, de liens entièrement privés et de progression exclusivement locale décrivent l’ancienne version. Elles ne doivent pas être réappliquées à la nouvelle configuration.
> Pour une mise à jour, déployer ensemble l’image reconstruite et les fichiers Caddy/Quadlet actuels, préserver tout le répertoire de données et valider réellement les fournisseurs. Les anciens résultats HTTP 401 ne prouvent pas le fonctionnement du nouvel onboarding. **Aucune nouvelle publication ni modification du VPS n’a été réalisée pendant ce travail.**

## Référence historique du 1er novembre 2026


L’application est mise en service sur **https://mathisbnl.fr** depuis le 1 novembre 2026, sur le VPS Oracle `129.151.252.159`. HTTPS et accès privé par mot de passe sont actifs ; `www` redirige vers le domaine principal.

- **[Compte rendu et validations réelles](MISE_EN_SERVICE_ORACLE.md)** : DNS, certificats, services, données, identifiants locaux et limites.
- **[Procédure Oracle Linux 9](DEPLOIEMENT_ORACLE_LINUX9.md)** : préparation, construction depuis le Mac, transfert, sauvegardes, mises à jour et retour arrière.

Configuration testée : Oracle Linux 9.8 x86_64, utilisateur `opc`, clé `~/.ssh/ssh-key-2026-10-11.key`, Podman 5.8.2 et Quadlet/systemd. L’image `linux/amd64` est construite sur le Mac pour éviter de compiler sur ce VPS de 1 Go.

Les leçons sont dans `/opt/vivre-la-langue/data`. Le reste de la bibliothèque et les réglages personnels restent dans les navigateurs. Le site est privé, pour un propriétaire ; ne pas distribuer son mot de passe à des élèves.

Les enregistrements A `@` et `www` pointent sur `129.151.252.159`, TTL 300. Les sous-domaines et la messagerie ont été préservés. L’ancien VPS `79.72.28.219` n’a pas été modifié ni supprimé.

L’ancien guide [Docker / Ubuntu](DEPLOIEMENT_DOCKER_UBUNTU.md) reste une référence pour une autre cible. Ne pas utiliser ses commandes `apt` ni compiler sur cette instance Oracle Linux.
