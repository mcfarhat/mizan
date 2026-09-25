@echo off
REM Commit current Mizan work:  commit.bat "message"
cd /d "%~dp0"
set MSG=%~1
if "%MSG%"=="" set MSG=Mizan: work in progress
git add -A
git commit -m "%MSG%"
git log --oneline -5
pause
