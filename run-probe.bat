@echo off
REM Mizan day-1 probe. Double-click, or: run-probe.bat AAPL
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Node.js not found. Install Node 20+ & pause & exit /b 1)
set T=%1
if "%T%"=="" set T=NVDA
node scripts\probe.mjs %T%
echo.
pause
