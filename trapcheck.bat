@echo off
REM QUOTE-ONLY: checks whether the Agentic Wallet quotes the trap routes. Nothing is bought.
REM   trapcheck.bat                    (GOOGL NVDA MSFT at $1k and $10k)
REM   trapcheck.bat AMD LLY --sizes=1000,5000,10000
cd /d "%~dp0"
node scripts\trapcheck.mjs %*
pause
