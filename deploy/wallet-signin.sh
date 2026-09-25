#!/usr/bin/env bash
# Run as root on the server: signs the Agentic Wallet in as user 'mizan' (for the quote-only wallet sampler).
set -u
cd /opt/mizan || { echo "/opt/mizan missing - run deploy.bat first"; exit 1; }
[ -d node_modules/@binance/agentic-wallet ] || sudo -u mizan -H bash -c "cd /opt/mizan && npm install --omit=dev --no-audit --no-fund --loglevel=error"
echo "== Open the link / scan the QR below with the Binance App, check the pairing code, confirm =="
sudo -u mizan -H bash -c "cd /opt/mizan && npx baw auth signin"
echo; echo "== Wallet on server =="
sudo -u mizan -H bash -c "cd /opt/mizan && npx baw wallet status --json" | head -c 600; echo
systemctl restart mizan-wallet 2>/dev/null || echo "(mizan-wallet service not installed yet - run deploy.bat)"
echo "== Sampler first pass (about 1-3 min) =="
sleep 90; journalctl -u mizan-wallet -n 4 --no-pager
