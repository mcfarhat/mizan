@echo off
REM One-time: sign the Agentic Wallet in ON THE SERVER (as user mizan) so the wallet sampler can fetch quotes.
REM A link / QR appears: open it with the Binance App, check the pairing code matches, confirm.
cd /d "%~dp0"
set /p SERVER_IP=<..\agentcensus-server-ip.txt
ssh -t -o StrictHostKeyChecking=accept-new root@%SERVER_IP% "sudo -u mizan -H bash -lc \"cd /opt/mizan && npx baw auth signin; npx baw wallet address --json | head -c 400; echo\"; systemctl restart mizan-wallet; sleep 20; journalctl -u mizan-wallet -n 3 --no-pager"
pause
