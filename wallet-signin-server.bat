@echo off
REM One-time: sign the Agentic Wallet in ON THE SERVER (user mizan) for the quote-only wallet sampler.
cd /d "%~dp0"
set /p SERVER_IP=<..\agentcensus-server-ip.txt
scp -o StrictHostKeyChecking=accept-new deploy\wallet-signin.sh root@%SERVER_IP%:/root/wallet-signin.sh || goto end
ssh -t -o StrictHostKeyChecking=accept-new root@%SERVER_IP% "bash /root/wallet-signin.sh"
:end
pause
