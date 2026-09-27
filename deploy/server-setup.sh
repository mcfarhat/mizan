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
[ -f /root/mizan-trades.jsonl ] && { [ -f $APP_DIR/data/trades.jsonl ] || mv /root/mizan-trades.jsonl $APP_DIR/data/trades.jsonl; }
[ -f /root/mizan-plans.json ] && { [ -f $APP_DIR/data/plans.json ] || mv /root/mizan-plans.json $APP_DIR/data/plans.json; }
chown -R $APP_USER:$APP_USER $APP_DIR
sudo -u $APP_USER -H bash -c "cd $APP_DIR && npm install --omit=dev --no-audit --no-fund --loglevel=error" || echo "!! npm install failed (wallet sampler will stay idle)"

# 1b. Agent Studio provider (ERC-8183 best-execution reports) - only once its .env has been uploaded
[ -f /root/mizan-agent.env ] && install -m 600 -o $APP_USER -g $APP_USER /root/mizan-agent.env $APP_DIR/agent-studio/.env && rm -f /root/mizan-agent.env
ROUTER=0
if [ -f $APP_DIR/agent-studio/.env ]; then
  ROUTER=1
  sudo -u $APP_USER -H bash -c "cd $APP_DIR/agent-studio && [ -d venv ] || python3 -m venv venv; venv/bin/pip install -q --upgrade pip && venv/bin/pip install -q -r requirements.txt" || echo "!! router venv install failed"
fi

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
cat > /etc/systemd/system/mizan-agent.service <<UNIT
[Unit]
Description=Mizan basket agent (runs due plans every 10 min, guarded; uses the server's Agentic Wallet session)
After=network-online.target
[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=HOME=/home/$APP_USER
ExecStart=/usr/bin/node scripts/agent.mjs loop
Restart=always
RestartSec=60
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/mizan-router.service <<UNIT
[Unit]
Description=Mizan Best-Execution Router (ERC-8183 provider, port 8091)
After=network-online.target mizan-web.service
[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/agent-studio
Environment=HOME=/home/$APP_USER PYTHONUNBUFFERED=1
ExecStart=$APP_DIR/agent-studio/venv/bin/python scripts/run_agent.py
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
if [ "$ROUTER" = 1 ]; then systemctl enable mizan-router >/dev/null; systemctl restart mizan-router; else echo "-- router: waiting for agent-studio/.env"; fi
systemctl enable mizan-web mizan-collect mizan-wallet mizan-agent >/dev/null
systemctl restart mizan-web mizan-collect mizan-wallet mizan-agent

# Housekeeping: cap journald, compress old snapshot files (the dashboard reads the last ~8 days uncompressed), drop very old ones.
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=300M\n' > /etc/systemd/journald.conf.d/mizan.conf
systemctl restart systemd-journald || true
cat > /etc/cron.daily/mizan-retention <<'CRON'
#!/bin/sh
# Mizan data retention: gzip snapshot/wallet files older than 14 days, delete archives older than 120 days.
D=/opt/mizan/data
find "$D" -maxdepth 1 \( -name 'snapshots-*.jsonl' -o -name 'wallet-*.jsonl' \) -mtime +14 -exec gzip -9 {} \;
find "$D" -maxdepth 1 -name '*.jsonl.gz' -mtime +120 -delete
CRON
chmod 755 /etc/cron.daily/mizan-retention

# 3. Caddy: own site file + import line (idempotent), validate before reload, roll back on failure
mkdir -p /etc/caddy/sites.d
cat > /etc/caddy/sites.d/mizan.caddy <<CADDY
$DOMAIN {
	encode gzip
	handle /erc8183* {
		reverse_proxy 127.0.0.1:8091
	}
	handle {
		reverse_proxy 127.0.0.1:8090
	}
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
systemctl is-active mizan-web mizan-collect mizan-wallet mizan-agent mizan-router agentcensus-web caddy | paste -sd' ' | sed 's/^/-- status (web collect wallet agent router | agentcensus caddy): /'
curl -s -o /dev/null -w "-- local dashboard: HTTP %{http_code}\n" http://127.0.0.1:8090/
sleep 2; echo "-- health: $(curl -s -m 20 http://127.0.0.1:8090/health || echo unreachable)"
echo "-- disk: $(df -h / | awk 'NR==2{print $3" used of "$2" ("$5")"}') · mizan data: $(du -sh /opt/mizan/data 2>/dev/null | cut -f1)"
PUB=$(curl -s -o /dev/null -m 15 -w "%{http_code}" "https://$DOMAIN/" || true)
if [ "$PUB" = "200" ]; then
  echo "-- public HTTPS: OK (https://$DOMAIN -> 200)"
else
  echo "!! public HTTPS check returned '$PUB' - check the DNS A record for $DOMAIN points to this server, and Caddy logs (journalctl -u caddy -n 30)"
fi
if systemctl is-enabled mizan-router >/dev/null 2>&1; then
  RT=$(curl -s -o /dev/null -m 15 -w "%{http_code}" "https://$DOMAIN/erc8183/" || true)
  echo "-- agent router via https://$DOMAIN/erc8183: HTTP $RT"
fi
echo "== Done: https://$DOMAIN =="
