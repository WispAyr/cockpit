#!/usr/bin/env bash
# Installs the Cockpit runtime on a vehicle edge node (Debian/Ubuntu).
# Idempotent — re-run to update.
#
# Usage (as root, with VEHICLE_ID + DEVICE_KEY already to hand):
#   curl -fsSL https://raw.githubusercontent.com/WispAyr/cockpit/main/scripts/install-edge.sh | bash

set -euo pipefail

REPO="${COCKPIT_REPO:-https://github.com/WispAyr/cockpit.git}"
BRANCH="${COCKPIT_BRANCH:-main}"
PREFIX="${COCKPIT_PREFIX:-/opt/cockpit}"
OUTRIDER_ORIGIN="${OUTRIDER_ORIGIN:-https://outrider.wispayr.online}"

if [ "$(id -u)" -ne 0 ]; then echo "run as root" >&2; exit 1; fi

command -v node >/dev/null 2>&1 || {
  echo "installing nodejs 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
}

command -v pm2 >/dev/null 2>&1 || npm i -g pm2

mkdir -p /var/lib/cockpit /var/log/cockpit

if [ ! -d "$PREFIX/.git" ]; then
  git clone -b "$BRANCH" "$REPO" "$PREFIX"
else
  git -C "$PREFIX" fetch --all --prune
  git -C "$PREFIX" checkout "$BRANCH"
  git -C "$PREFIX" reset --hard "origin/$BRANCH"
fi

cd "$PREFIX"
npm ci

if [ ! -f "$PREFIX/.env.runtime" ]; then
  cat > "$PREFIX/.env.runtime" <<EOF
OUTRIDER_ORIGIN=$OUTRIDER_ORIGIN
VEHICLE_ID=${VEHICLE_ID:-}
DEVICE_KEY=${DEVICE_KEY:-}
MANIFEST_POLL_MS=30000
MANIFEST_CACHE_PATH=/var/lib/cockpit/manifest.json
EOF
  chmod 600 "$PREFIX/.env.runtime"
  echo "wrote $PREFIX/.env.runtime — edit in VEHICLE_ID + DEVICE_KEY if they were not passed in."
fi

npm --workspace @cockpit/runtime run build

pm2 startOrReload "$PREFIX/ecosystem.runtime.js"
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

echo
echo "✓ Cockpit runtime installed at $PREFIX"
echo "  listening on 127.0.0.1:4040"
echo "  next: point a chrome-kiosk at http://127.0.0.1:4040 on vehicle boot."
