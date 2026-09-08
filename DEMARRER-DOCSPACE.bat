@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Installe Node.js 22 ou plus recent depuis https://nodejs.org puis relance.
  pause
  exit /b 1
)
node scripts\start-local.cjs
if errorlevel 1 pause
