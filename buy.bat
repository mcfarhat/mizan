@echo off
REM Guarded buy via Binance Agentic Wallet:  buy.bat NVDA 5
cd /d "%~dp0"
node scripts\buy.mjs %*
pause
