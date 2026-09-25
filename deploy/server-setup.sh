#!/usr/bin/env bash
# Mizan: server setup (run as root). Designed to co-exist with AgentCensus on the same box:
#   own user (mizan), own dir (/opt/mizan), own systemd units (mizan-*), own port (8090, localhost only),
#   own Caddy site file (/etc/caddy/sites.d/mizan.caddy). It never edits AgentCensus files; it only
#   ensures the main Caddyfile imports sites.d/*.caddy, and validates Caddy before reloading.
# Usage: DOMAIN=mizan.example.com bash server-setup.sh   (expects /root/mizan.tgz uploaded by deploy.bat)
set -euo pipefail
DOMAIN="${DOMAIN:?set DOMAIN}"
APP_DIR=/opt/mizan
APP_USER=mizan
echo "== Mizan setup: $DOMAIN =="

command -v node >/dev/null || { echo "node missing (AgentCensus setup installs Node 22)"; exit 1; }
command -v caddy >/dev/null || { echo "caddy missing"; exit 1; }

# 1. user + code (tarball from git archive; data/ and .env are preserved across deploys)
id -u $APP_USER >/dev/null 2>&1 || useradd -m -s /bin/bash $APP_USER
mkdir -p $APP_DIR/data
tar -xzf /root/mizan.tgz -C $APP_DIR
[ -f /root/mizan.env ] && install -m 600 /root/mizan.env $APP_DIR/.env && rm -f /root/mizan.env
if [ -d /root/mizan-data ]; then            # first deploy: seed collected history
  cp -n /root/mizan-data/*.jsonl $APP_DIR/data/ 2>/dev/null || true; rm -rf /root/mizan-data
fi
chown -R $APP_USER:$APP_USER $APP_DIR
sudo -u $APP_USER -H bash -c "cd $APP_DIR && npm install --omit=dev --no-audit --no-fund --loglevel=error" || echo "!! npm install failed (wallet sampler will stay idle)"

# 2. systemd units
cat > /etc/systemd/system/mizan-web.service <<UNIT
[Unit]
Description=Mizan dashboard + API
After=network.target
[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node scripts/server.mjs
Environment=PORT=8090 HOST=127.0.0.1 NODE_ENV=production
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/mizan-collect.service <<UNIT
[Unit]
Description=Mizan collector (tokenized-stock integrity snapshots every 5 min)
After=network-online.target
[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node scripts/collect.mjs
Restart=always
RestartSec=30
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/mizan-wallet.service <<UNIT
[Unit]
Description=Mizan wallet sampler (Agentic Wallet QUOTES ONLY, every 15 min; idle until 'baw auth signin' as user mizan)
After=network-online.target
[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=HOME=/home/$APP_USER
ExecStart=/usr/bin/node scripts/wallet-sampler.mjs
Restart=always
RestartSec=60
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable mizan-web mizan-collect mizan-wallet >/dev/null
systemctl restart mizan-web mizan-collect mizan-wallet

# 3. Caddy: own site file + import line (idempotent), validate before reload, roll back on failure
mkdir -p /etc/caddy/sites.d
cat > /etc/caddy/sites.d/mizan.caddy <<CADDY
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8090
}
CADDY
cp /etc/caddy/Caddyfile /root/Caddyfile.bak.mizan
grep -q 'import /etc/caddy/sites.d/\*.caddy' /etc/caddy/Caddyfile || printf '\nimport /etc/caddy/sites.d/*.caddy\n' >> /etc/caddy/Caddyfile
if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
  systemctl reload caddy
  echo "-- caddy: reloaded with $DOMAIN"
else
  echo "!! caddy validation failed, restoring previous Caddyfile"; cat /tmp/caddy-validate.log | tail -5
  cp /root/Caddyfile.bak.mizan /etc/caddy/Caddyfile; exit 1
fi

sleep 3
systemctl is-active mizan-web mizan-collect mizan-wallet agentcensus-web caddy | paste -sd' ' | sed 's/^/-- status (mizan-web mizan-collect mizan-wallet agentcensus-web caddy): /'
curl -s -o /dev/null -w "-- local dashboard: HTTP %{http_code}\n" http://127.0.0.1:8090/
echo "== Done: https://$DOMAIN (HTTPS once DNS A record -> this server) =="
