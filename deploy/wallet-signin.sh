#!/usr/bin/env bash
# Run as root on the server: signs the Agentic Wallet in as user 'mizan' (for the quote-only wallet sampler).
set -u
cd /opt/mizan || { echo "/opt/mizan missing - run deploy.bat first"; exit 1; }
[ -d node_modules/@binance/agentic-wallet ] || sudo -u mizan -H bash -c "cd /opt/mizan && npm install --omit=dev --no-audit --no-fund --loglevel=error"
# Headless (async) login: 'signin --json' returns the login URL + pairing code, 'verify' waits for approval.
J=$(sudo -u mizan -H bash -c "cd /opt/mizan && npx baw auth signin --json" 2>&1)
if echo "$J" | grep -q ALREADY_CONNECTED; then echo "Already signed in on the server."; else
  URL=$(echo "$J" | sed -n 's/.*"urlForWeb": *"\([^"]*\)".*/\1/p' | head -1)
  QR=$(echo "$J" | sed -n 's/.*"qrCodeId": *"\([^"]*\)".*/\1/p' | head -1)
  PC=$(echo "$J" | sed -n 's/.*"pairingCode": *"\([^"]*\)".*/\1/p' | head -1)
  if [ -z "$URL" ] || [ -z "$QR" ]; then echo "Unexpected signin output:"; echo "$J"; exit 1; fi
  echo
  echo "======================================================================"
  echo " 1. Open this URL in your PC browser (it shows a QR code):"
  echo "    $URL"
  echo " 2. Scan that QR with the Binance App (scan icon on the Home screen)."
  echo " 3. Confirm ONLY if the app shows pairing code:  $PC"
  echo "======================================================================"
  echo "Waiting for your confirmation..."
  sudo -u mizan -H bash -c "cd /opt/mizan && npx baw auth verify --qrCodeId '$QR'"
fi
echo; echo "== Wallet on server =="
sudo -u mizan -H bash -c "cd /opt/mizan && npx baw wallet status --json" | head -c 600; echo
systemctl restart mizan-wallet 2>/dev/null || echo "(mizan-wallet service not installed yet - run deploy.bat)"
echo "== Sampler first pass (about 1-3 min) =="
sleep 90; journalctl -u mizan-wallet -n 4 --no-pager
