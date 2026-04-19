module.exports = {
  apps: [{
    name: "cockpit-designer",
    cwd: "/root/services/cockpit/packages/designer",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 4030",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "600M",
    env: { NODE_ENV: "production", PORT: "4030" },
    env_file: "../../.env.designer",
    out_file: "/root/.pm2/logs/cockpit-designer-out.log",
    error_file: "/root/.pm2/logs/cockpit-designer-error.log",
    merge_logs: true,
    time: true,
  }],
};
