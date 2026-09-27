@echo off
REM Mizan Agent Studio setup (run from the mizan folder)
REM   agent-studio.bat key               create the agent wallet (once) and show its address to fund
REM   agent-studio.bat register mainnet  register the ERC-8004 identity on BSC mainnet
REM   agent-studio.bat register testnet  ...and on testnet (where ERC-8183 jobs run)
cd /d "%~dp0"
if not exist node_modules\viem call npm install --no-audit --no-fund --loglevel=error
if /i "%1"=="key" node scripts\new-agent-key.mjs
if /i "%1"=="register" node scripts\register-8004.mjs %2
pause
