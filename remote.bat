@echo off
REM Run a Mizan wallet command ON THE SERVER (where the Agentic Wallet session lives).
REM   remote.bat buy NVDA 5
REM   remote.bat verify
REM   remote.bat agent plan "$6 into halal AI"
REM   remote.bat agent list      /  remote.bat agent run
REM   remote.bat trapcheck GOOGL NVDA
REM   remote.bat logs router     (last 60 log lines of a service)
setlocal
cd /d "%~dp0"
set /p SERVER_IP=<..\agentcensus-server-ip.txt
>"%TEMP%\mizan-cmd.txt" echo %*
scp -q -o StrictHostKeyChecking=accept-new "%TEMP%\mizan-cmd.txt" deploy\run.sh root@%SERVER_IP%:/root/ || goto end
ssh -t -o StrictHostKeyChecking=accept-new root@%SERVER_IP% "bash /root/run.sh /root/mizan-cmd.txt"
:end
pause
