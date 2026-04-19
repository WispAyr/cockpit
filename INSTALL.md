# Cockpit edge install (short form)

For the impatient: install Cockpit runtime on a fresh vehicle node.

```bash
# 1. In the Outrider portal: Fleet → Register vehicle. Copy the uuid +
#    one device_key from the provisioning output.

# 2. On the vehicle (as root):
export VEHICLE_ID=00000000-0000-0000-0000-000000000000
export DEVICE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

curl -fsSL https://raw.githubusercontent.com/WispAyr/cockpit/main/scripts/install-edge.sh | bash

# 3. Point any browser at http://127.0.0.1:4040 — you'll see the bundled
#    Chase template. Once Outrider reaches the node, it'll hot-swap to
#    whatever manifest you've published.
```

Troubleshooting: `pm2 logs cockpit-runtime` for runtime errors;
`journalctl -u cockpit-kiosk` for display issues.
