@echo off
REM Mizan collector: snapshots all tickers every 5 minutes into data\snapshots-*.jsonl
REM   run-collect.bat          -> loop (leave the window open)
REM   run-collect.bat once     -> single pass + table
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Node.js not found. & pause & exit /b 1)
if /i "%1"=="once" (
  node scripts\discover.mjs && node scripts\collect.mjs --once && node scripts\report.mjs
  pause
) else (
  node scripts\collect.mjs
)
