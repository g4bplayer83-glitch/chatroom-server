@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Among Funk v0.1.0 - Installation Android automatique

echo ============================================================
echo  AMONG FUNK v0.1.0 - INSTALLATION ANDROID AUTOMATIQUE
echo ============================================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALLER-ANDROID-AUTOMATIQUE.ps1"
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" (
    echo L'installation n'a pas pu etre terminee. Code : %RESULT%
) else (
    echo Installation et verification terminees.
)
echo.
pause
exit /b %RESULT%
