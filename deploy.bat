@echo off
REM Mizan: deploy to the (shared) Hetzner server. Uses Windows ssh/scp + your existing SSH key.
REM First run uploads .env and the locally collected history; later runs only ship code.
REM Uses as few SSH connections as possible (-n: never wait on the keyboard; one check call, one upload, one setup call).
setlocal
cd /d "%~dp0"
set IPFILE=..\agentcensus-server-ip.txt
set SSHOPTS=-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o ServerAliveInterval=15
set /p SERVER_IP=<"%IPFILE%"
if "%MIZAN_DOMAIN%"=="" set /p MIZAN_DOMAIN=<deploy\domain.txt
if "%MIZAN_DOMAIN%"=="" (echo [ERROR] put the domain in deploy\domain.txt & pause & exit /b 1)
echo == Deploying Mizan to %SERVER_IP% as %MIZAN_DOMAIN% ==
git add -A 2>nul && git commit -q -m "deploy" >nul 2>nul
git archive --format=tar.gz -o "%TEMP%\mizan.tgz" HEAD || goto fail

REM 1) one check: what does the server already have?
set HAS_OK=& set HAS_ENV=& set HAS_TRADES=& set HAS_PLANS=
ssh -n %SSHOPTS% root@%SERVER_IP% "test -f /opt/mizan/.env && echo ENV; test -f /opt/mizan/data/trades.jsonl && echo TRADES; test -f /opt/mizan/data/plans.json && echo PLANS; mkdir -p /root/mizan-data; echo OK" > "%TEMP%\mizan-state.txt"
for /f %%a in ('type "%TEMP%\mizan-state.txt"') do set HAS_%%a=1
if not defined HAS_OK (echo [ERROR] could not reach the server to check its state - nothing uploaded & goto fail)

REM 2) one upload with everything that's needed
set FILES="%TEMP%\mizan.tgz" deploy\server-setup.sh
if exist agent-studio\.env (copy /y agent-studio\.env "%TEMP%\mizan-agent.env" >nul & set FILES=%FILES% "%TEMP%\mizan-agent.env")
if not defined HAS_ENV (echo -- first deploy: uploading .env & copy /y .env "%TEMP%\mizan.env" >nul & set FILES=%FILES% "%TEMP%\mizan.env")
if not defined HAS_TRADES if exist data\trades.jsonl (copy /y data\trades.jsonl "%TEMP%\mizan-trades.jsonl" >nul & set FILES=%FILES% "%TEMP%\mizan-trades.jsonl")
if not defined HAS_PLANS if exist data\plans.json (copy /y data\plans.json "%TEMP%\mizan-plans.json" >nul & set FILES=%FILES% "%TEMP%\mizan-plans.json")
scp %SSHOPTS% %FILES% root@%SERVER_IP%:/root/ || goto fail
if not defined HAS_ENV scp %SSHOPTS% data\snapshots-*.jsonl root@%SERVER_IP%:/root/mizan-data/
del /q "%TEMP%\mizan-agent.env" "%TEMP%\mizan.env" "%TEMP%\mizan-trades.jsonl" "%TEMP%\mizan-plans.json" 2>nul

REM 3) one setup call
ssh -n %SSHOPTS% root@%SERVER_IP% "DOMAIN=%MIZAN_DOMAIN% bash /root/server-setup.sh" || goto fail
echo.
echo Deployed: https://%MIZAN_DOMAIN%
pause
exit /b 0
:fail
echo [ERROR] deploy failed - see above
pause
exit /b 1
