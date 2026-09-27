@echo off
REM Hire the Mizan agent end-to-end on BSC testnet (ERC-8183), as an outside buyer would.
REM   hire-test.bat                 hire with task "GOOGL 10000"
REM   hire-test.bat hire NVDA 5000  custom task
REM   hire-test.bat status 123      job status
REM   hire-test.bat settle 123      release escrow after the dispute window
cd /d "%~dp0"
if not exist node_modules\viem call npm install --no-audit --no-fund --loglevel=error
if "%1"=="" (node scripts\hire-test.mjs hire) else (node scripts\hire-test.mjs %*)
pause
