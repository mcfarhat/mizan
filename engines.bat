@echo off
REM Compare Binance routing engines for the same buy (QUOTE ONLY):  engines.bat GOOGL ondo 10000
cd /d "%~dp0"
node scripts\engines.mjs %*
pause
