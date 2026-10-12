@echo off
title Build Better Calendar Installer
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Install Node.js LTS from https://nodejs.org and then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo Installing dependencies...
  call npm ci
  if errorlevel 1 (
    echo.
    echo Installation failed.
    pause
    exit /b 1
  )
)

echo Building Windows installer...
call npm run dist
if errorlevel 1 (
  echo.
  echo Build failed. Review the messages above.
  pause
  exit /b 1
)

echo.
echo Done. Open the "dist" folder to find the installer.
pause
