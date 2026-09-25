@echo off
REM Check fills of submitted Mizan trades (order status, tx hash, realized cost vs prediction)
cd /d "%~dp0"
node scripts\verify.mjs
pause
