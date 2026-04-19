# Cockpit

Dashboard designer (in the Outrider portal) + edge runtime (in the vehicle).
Same repo, same manifest spec — shipped as an npm workspace.

## Shape

```
cockpit/
├─ packages/
│  ├─ schema/     # Manifest + widget types (the contract)
│  ├─ designer/   # Next 16 portal app — template picker, publish
│  └─ runtime/    # Next 16 kiosk app — polls Outrider, renders widgets
├─ templates/     # chase.json · livestream.json · sar.json · roaming.json
└─ scripts/
   └─ install-edge.sh   # one-shot installer for a vehicle edge node
```

## The contract

A **manifest** is a JSON document that describes the full in-vehicle screen:
theme, grid, widgets, bindings. Everything flows from here. See
[`packages/schema/src/manifest.ts`](packages/schema/src/manifest.ts).

A **widget** has:
- `type` — from a fixed registry (starlink, gps, weather, camera, stormfront, …)
- `grid` — CSS-grid placement (`{ col, row, w, h }` in a 12-col layout)
- `bind` — where its data comes from:
  - `prism` — a named Prism lens
  - `siphon` — a siphon source id
  - `local` — on-vehicle sensor (read via runtime's `/api/bind`)
  - `camera` — a provisioned vehicle camera slug
  - `static` — a literal value

## Flow

```
  Operator          Outrider          Vehicle
  ────────          ────────          ───────
   pick template ─→  POST              GET /api/manifest/:vehicle
                      /api/admin      (HMAC-signed every 30s)
                      /manifest   ──→  cockpit_manifests
                                           │
                                           ▼
                                       runtime renders grid,
                                       widgets poll /api/bind
                                       for live data
```

## Install

### Designer (on big-server, next to Outrider)

```bash
cd /root/services
git clone git@github.com:WispAyr/cockpit.git
cd cockpit
npm ci
cp .env.example .env.designer   # OUTRIDER_ORIGIN + OUTRIDER_ADMIN_TOKEN
npm --workspace @cockpit/designer run build
pm2 start ecosystem.designer.js
```

Nginx: `cockpit.wispayr.online` → `127.0.0.1:4030` (or serve under
`/designer` on the Outrider vhost).

### Runtime (on each vehicle edge node)

Two-step — provision the vehicle in Outrider first to get `VEHICLE_ID` +
a `starlink`-kind device key, then:

```bash
export VEHICLE_ID=…
export DEVICE_KEY=…       # use any one of the device keys from provisioning
curl -fsSL https://raw.githubusercontent.com/WispAyr/cockpit/main/scripts/install-edge.sh | bash
```

That script:
1. installs Node 22 + pm2 if missing,
2. clones the repo to `/opt/cockpit`,
3. writes `/opt/cockpit/.env.runtime`,
4. builds `@cockpit/runtime`,
5. starts it under pm2 on `127.0.0.1:4040`.

Then point a chrome-kiosk at `http://127.0.0.1:4040` on vehicle boot:

```bash
# /etc/systemd/system/cockpit-kiosk.service
[Service]
ExecStart=/usr/bin/chromium --kiosk --noerrdialogs --disable-infobars \
  --start-fullscreen http://127.0.0.1:4040
```

## Develop

```bash
npm ci
npm run dev:designer       # http://localhost:4030
npm run dev:runtime        # http://localhost:4040
```

Runtime's `/api/bind` returns stub data until real Prism/siphon URLs are in
the `.env.runtime`. The dashboard renders regardless.

## Roadmap (curated → generic)

Per the project plan, we start with a **fixed** widget set + **fixed**
templates. Once the widget contract is stable, the next release graduates it
into a Cockpit Widget SDK so tenants can author their own tiles. Until then,
new widgets = PR to `packages/runtime/app/widgets/registry.tsx` + a zod enum
entry in `packages/schema/src/widgets.ts`.
