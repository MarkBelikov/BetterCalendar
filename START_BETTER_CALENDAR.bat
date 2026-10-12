@echo off
title Better Calendar Setup
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
  echo Installing Better Calendar dependencies...
  call npm ci
  if errorlevel 1 (
    echo.
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo Starting Better Calendar...
call npm start
