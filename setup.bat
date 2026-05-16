@echo off
title Our Memory - Setup
echo.
echo  ===========================================
echo   Our Memory - First Time Setup
echo  ===========================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found.
    echo  Please download and install from: https://nodejs.org
    echo  Choose the LTS version, then run this file again.
    pause
    exit /b 1
)
echo  [OK] Node.js found.

:: Install project dependencies
echo.
echo  Installing project dependencies...
npm install
if %errorlevel% neq 0 (
    echo  [ERROR] npm install failed.
    pause
    exit /b 1
)
echo  [OK] Dependencies installed.

:: Install PM2 globally
echo.
echo  Installing PM2 (auto-start manager)...
npm install -g pm2
if %errorlevel% neq 0 (
    echo  [ERROR] PM2 install failed.
    pause
    exit /b 1
)

:: Install PM2 Windows startup helper
echo  Installing PM2 Windows startup...
npm install -g pm2-windows-startup
pm2-startup install

:: Start the server
echo.
echo  Starting the memory server...
pm2 start server.js --name "us-memory"
pm2 save

echo.
echo  ===========================================
echo   Setup complete!
echo.
echo   Your site: http://localhost:3001
echo.
echo   The server will auto-start with Windows.
echo   Run start-tunnel.bat to share with BF.
echo  ===========================================
echo.
pause
