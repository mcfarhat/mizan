@echo off
REM Mizan: deploy to the (shared) Hetzner server. Uses Windows ssh/scp + your existing SSH key.
REM First run uploads .env and the locally collected history; later runs only ship code.
setlocal
cd /d "%~dp0"
set IPFILE=..\agentcensus-server-ip.txt
set SSHOPTS=-o StrictHostKeyChecking=accept-new
set /p SERVER_IP=<"%IPFILE%"
if "%MIZAN_DOMAIN%"=="" set /p MIZAN_DOMAIN=<deploy\domain.txt
if "%MIZAN_DOMAIN%"=="" (echo [ERROR] put the domain in deploy\domain.txt & pause & exit /b 1)
echo == Deploying Mizan to %SERVER_IP% as %MIZAN_DOMAIN% ==
git add -A 2>nul && git commit -q -m "deploy" >nul 2>nul
git archive --format=tar.gz -o "%TEMP%\mizan.tgz" HEAD || goto fail
scp %SSHOPTS% "%TEMP%\mizan.tgz" deploy\server-setup.sh root@%SERVER_IP%:/root/ || goto fail
ssh %SSHOPTS% root@%SERVER_IP% "test -f /opt/mizan/.env" && goto skip_env
echo -- first deploy: uploading .env and collected history
scp %SSHOPTS% .env root@%SERVER_IP%:/root/mizan.env || goto fail
ssh %SSHOPTS% root@%SERVER_IP% "mkdir -p /root/mizan-data"
scp %SSHOPTS% data\snapshots-*.jsonl root@%SERVER_IP%:/root/mizan-data/
:skip_env
ssh %SSHOPTS% root@%SERVER_IP% "test -f /opt/mizan/data/trades.jsonl" || (if exist data\trades.jsonl scp %SSHOPTS% data\trades.jsonl root@%SERVER_IP%:/root/mizan-trades.jsonl)
ssh %SSHOPTS% root@%SERVER_IP% "test -f /opt/mizan/data/plans.json" || (if exist data\plans.json scp %SSHOPTS% data\plans.json root@%SERVER_IP%:/root/mizan-plans.json)
ssh %SSHOPTS% root@%SERVER_IP% "DOMAIN=%MIZAN_DOMAIN% bash /root/server-setup.sh" || goto fail
echo.
echo Live (once DNS points to %SERVER_IP%): https://%MIZAN_DOMAIN%
pause
exit /b 0
:fail
echo [ERROR] deploy failed - see above
pause
exit /b 1
