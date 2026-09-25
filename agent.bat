@echo off
REM Mizan basket agent
REM   agent.bat plan "$6 into halal AI"      preview + save a plan
REM   agent.bat list                          show plans
REM   agent.bat run                           execute due plans now (guarded auto)
REM   agent.bat loop                          keep running, checks every 10 min
cd /d "%~dp0"
node scripts\agent.mjs %*
if /i not "%1"=="loop" pause
