#!/usr/bin/env bash
# Install the runtime without letting package metadata exhaust a 1 GiB VPS.
set -euo pipefail
if [[ "$EUID" -ne 0 ]]; then
  echo 'Exécute avec sudo bash deploy/oracle/bootstrap-runtime.sh' >&2
  exit 1
fi

swap_path=/var/lib/vivre-la-langue.swap
ram_kib=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
swap_kib=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
if (( ram_kib < 1572864 && swap_kib < 2097152 )); then
  if [[ ! -e "$swap_path" ]]; then
    free_kib=$(df -Pk /var/lib | awk 'NR == 2 {print $4}')
    (( free_kib >= 3145728 )) || { echo 'Au moins 3 Gio libres sont nécessaires avant création du swap.' >&2; exit 1; }
    install -m 0600 /dev/null "$swap_path"
    dd if=/dev/zero of="$swap_path" bs=1M count=2048 status=progress
    mkswap "$swap_path"
  fi
  # Never reformat an existing file: require a valid, private swap file.
  [[ -f "$swap_path" && ! -L "$swap_path" ]]
  [[ $(stat -c '%u:%a' "$swap_path") == 0:600 ]]
  [[ $(blkid -p -s TYPE -o value "$swap_path") == swap ]]
  if ! awk -v path="$swap_path" '$1 == path {found=1} END {exit !found}' /proc/swaps; then
    swapon "$swap_path"
  fi
  if ! awk -v path="$swap_path" '$1 == path {found=1} END {exit !found}' /etc/fstab; then
    cp -an /etc/fstab /etc/fstab.before-vivre
    printf '%s none swap sw 0 0\n' "$swap_path" >> /etc/fstab
    systemctl daemon-reload
  fi
fi

# Keep automatic metadata refresh from monopolizing this small web host.
install -d -m 0755 /etc/systemd/system/dnf-makecache.service.d
cat > /etc/systemd/system/dnf-makecache.service.d/90-vivre-resources.conf <<'UNIT'
[Service]
CPUWeight=10
IOWeight=10
Nice=10
MemoryMax=650M
MemorySwapMax=1500M
UNIT
systemctl daemon-reload

# The transient unit bounds the installer; the application has its own limits.
systemd-run --wait --pipe --collect --unit="vivre-install-runtime-$(date +%s)" \
  -p MemoryMax=650M -p MemorySwapMax=1500M \
  /usr/bin/dnf --disablerepo='*' --enablerepo=ol9_baseos_latest \
  --enablerepo=ol9_appstream --enablerepo=ol9_addons \
  --setopt=install_weak_deps=False install -y podman rsync openssl
podman --version
podman info --format '{{.Host.CgroupsVersion}}'
free -m
