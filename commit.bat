@echo off
REM Commit current Mizan work and push to GitHub:  commit.bat "message"
cd /d "%~dp0"
set MSG=%~1
if "%MSG%"=="" set MSG=Mizan: work in progress
git add -A
git commit -m "%MSG%"
git log --oneline -5
git remote get-url origin >nul 2>nul && (echo Pushing to GitHub... & git push -q origin HEAD || echo [WARN] push failed - check your GitHub login)
pause
