@echo off
REM Grab a snapshot of the LIVE Mizan site (page + API answers) so the demo video can be recorded from real data.
cd /d "%~dp0"
if not exist probe-output\demo mkdir probe-output\demo
set B=https://mizan.greateck.com
set O=probe-output\demo
echo Capturing live data from %B% ...
curl -s -f -o %O%\index.html "%B%/" || goto fail
curl -s -f -o %O%\api-index.json "%B%/api/index" || goto fail
curl -s -f -o %O%\heat-1000.json "%B%/api/heatmap?size=1000" || goto fail
curl -s -f -o %O%\heat-10000.json "%B%/api/heatmap?size=10000" || goto fail
curl -s -f -o %O%\check-GOOGL-10000.json "%B%/api/check/GOOGL?usd=10000&maxCost=1&channel=any"
curl -s -f -o %O%\check-NVDA-5000.json "%B%/api/check/NVDA?usd=5000&maxCost=1&channel=any"
curl -s -f -o %O%\check-GOOGL-10000-wallet.json "%B%/api/check/GOOGL?usd=10000&maxCost=1&channel=wallet"
curl -s -f -o %O%\hist-GOOGL-10000.json "%B%/api/history/GOOGL?size=10000"
curl -s -f -o %O%\hist-NVDA-5000.json "%B%/api/history/NVDA?size=5000"
curl -s -f -o %O%\hist-GOOGL-1000.json "%B%/api/history/GOOGL?size=1000"
curl -s -f -o %O%\hist-NVDA-1000.json "%B%/api/history/NVDA?size=1000"
curl -s -f -o %O%\health.json "%B%/health"
dir %O%
echo Done - tell Claude "captured".
pause
exit /b 0
:fail
echo [ERROR] could not reach %B%
pause
exit /b 1
