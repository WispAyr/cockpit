/**
 * PM2 config for the edge runtime. Runs ON THE VEHICLE, not on big-server.
 * Pair with a chrome-kiosk launcher (see INSTALL.md).
 */
module.exports = {
  apps: [{
    name: "cockpit-runtime",
    cwd: "/opt/cockpit/packages/runtime",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 4040 -H 127.0.0.1",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "500M",
    env: { NODE_ENV: "production", PORT: "4040" },
    env_file: "../../.env.runtime",
    out_file: "/var/log/cockpit/runtime-out.log",
    error_file: "/var/log/cockpit/runtime-error.log",
    merge_logs: true,
    time: true,
  }],
};
