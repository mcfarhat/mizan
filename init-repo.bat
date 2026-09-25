@echo off
REM One-time: make mizan its own git repository (separate from agentcensus).
cd /d "%~dp0"
if exist .git (echo Already a git repo. & pause & exit /b 0)
git init -b main
git add -A
git commit -m "Mizan day 1: data probe scaffold, token seed list, DX journal"
echo.
echo Done. .env and probe-output are ignored by git (check below - should list nothing secret):
git ls-files
pause
