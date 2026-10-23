@echo off
rem Double-click to open kaareyesAiEditor in your browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page...
  start "" https://nodejs.org
  echo Install Node.js LTS, then double-click this file again.
  pause
  exit /b 1
)
node app\server.mjs
pause
