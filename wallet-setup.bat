@echo off
REM One-time Binance Agentic Wallet setup for Mizan.
REM Prereq: Binance App with an MPC wallet (Wallet tab). Keep your phone nearby.
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Node.js not found. & pause & exit /b 1)
if not exist node_modules\@binance\agentic-wallet (
  echo [1/4] Installing Binance Agentic Wallet CLI...
  call npm install --no-audit --no-fund @binance/agentic-wallet
)
echo.
echo [2/4] Sign-in: a link / QR code appears below. Open it with the Binance App
echo       on your phone and confirm. First sign-in creates the Agentic Wallet.
echo.
call npx baw auth signin
echo.
echo (auth signin completes the login itself once you confirm in the app;
echo  'auth verify' needs a --qrCodeId and is not required here.)
echo.
echo [3/4] Your Agentic Wallet address (fund THIS with USDT on BSC):
call npx baw wallet address --json
echo.
echo [4/4] Security rules set in the app (daily limit, token scope):
call npx baw wallet settings --json
echo.
echo Done. Put the BSC address above into .env as WALLET_ADDRESS=0x...
pause
