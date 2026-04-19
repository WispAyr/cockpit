# Cockpit deploy

Two install targets that share a repo.

## Designer (server-side)

Target: **big-server**, sibling of Outrider. Lives at `/root/services/cockpit`.

```bash
ssh big-server
cd /root/services
git clone git@github.com:WispAyr/cockpit.git
cd cockpit
npm ci
cat > .env.designer <<EOF
OUTRIDER_ORIGIN=https://outrider.wispayr.online
OUTRIDER_ADMIN_TOKEN=$(cat /root/services/outrider/.env | grep ^COCKPIT_ADMIN_TOKEN= | cut -d= -f2)
EOF
npm --workspace @cockpit/designer run build
pm2 start ecosystem.designer.js
pm2 save
```

Nginx: route `cockpit.wispayr.online` → `127.0.0.1:4030`. Certbot + done.

## Runtime (per vehicle)

Target: **vehicle edge node** (NUC / Pi / Jetson).

Prereqs:
- Ubuntu 22.04+ or Debian 12+
- Starlink or 4G uplink reachable by the node
- WG key pair issued by Outrider at provisioning time (optional, for
  private-only routes)

```bash
# on your mac, after provisioning via Outrider portal or script:
export VEHICLE_ID=<uuid>
export DEVICE_KEY=<starlink-kind-secret>
ssh root@<vehicle-ip> "VEHICLE_ID=$VEHICLE_ID DEVICE_KEY=$DEVICE_KEY bash -s" \
  < scripts/install-edge.sh
```

Kiosk display:

```ini
# /etc/systemd/system/cockpit-kiosk.service
[Unit]
Description=Cockpit kiosk browser
After=cockpit-runtime.service graphical.target
Wants=cockpit-runtime.service

[Service]
Type=simple
ExecStartPre=/bin/sh -c 'until curl -sf http://127.0.0.1:4040 >/dev/null; do sleep 1; done'
ExecStart=/usr/bin/chromium --kiosk --noerrdialogs --disable-infobars --start-fullscreen http://127.0.0.1:4040
Restart=on-failure
User=kiosk

[Install]
WantedBy=graphical.target
```

## Verify

Designer:
```bash
curl -s https://cockpit.wispayr.online | grep "Cockpit · Designer"
```

Runtime on a vehicle:
```bash
curl -s http://127.0.0.1:4040/api/manifest/current | jq .source   # "outrider vN" | "cache" | "bundled-chase"
```

If you see `bundled-chase` in production, the runtime couldn't reach Outrider
AND hasn't cached a manifest yet — check `.env.runtime`, Starlink, the
device key, and the vehicle's last-seen timestamp in the Outrider fleet page.
