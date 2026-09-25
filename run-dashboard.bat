@echo off
REM Mizan dashboard on http://localhost:8090 (reads data\ written by run-collect.bat)
cd /d "%~dp0"
start "" http://localhost:8090
node scripts\server.mjs
