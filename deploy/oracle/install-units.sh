#!/usr/bin/env bash
set -euo pipefail
if [[ "$EUID" -ne 0 ]]; then
  echo 'Exécute avec sudo bash deploy/oracle/install-units.sh' >&2
  exit 1
fi
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
command -v podman >/dev/null
[[ -s /etc/vivre-la-langue.env ]] || { echo 'Crée /etc/vivre-la-langue.env avant cette étape.' >&2; exit 1; }
grep -qx 'APP_DOMAIN=mathisbnl.fr' /etc/vivre-la-langue.env
grep -qx 'APP_ORIGIN=https://mathisbnl.fr' /etc/vivre-la-langue.env
podman image exists localhost/vivre-la-langue:oracle
podman image exists docker.io/library/caddy:2-alpine
chmod 600 /etc/vivre-la-langue.env
install -d -m 0755 /opt/vivre-la-langue /etc/containers/systemd
install -d -m 0700 -o 1000 -g 1000 /opt/vivre-la-langue/data
install -m 0644 "$script_dir/../Caddyfile" /opt/vivre-la-langue/Caddyfile
for unit in "$script_dir"/*.container "$script_dir"/*.network "$script_dir"/*.volume; do
  install -m 0644 "$unit" /etc/containers/systemd/
done
systemctl daemon-reload
systemctl cat vivre-app.service vivre-caddy.service >/dev/null
printf '%s\n' 'Unités installées et générées. Aucun service démarré.' 'Valide Caddy puis démarre les services selon le guide Oracle Linux.'
