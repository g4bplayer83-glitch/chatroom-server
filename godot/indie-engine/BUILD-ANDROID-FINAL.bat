@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Among Funk v0.1.0 - Android Final Builder

echo ============================================================
echo  AMONG FUNK v0.1.0 - COMPILATION ANDROID CORRIGEE
echo ============================================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0BUILD-ANDROID-FINAL.ps1"
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" (
    echo ECHEC DE LA COMPILATION. Code : %RESULT%
) else (
    echo COMPILATION TERMINEE ET APK VERIFIE.
)
echo.
pause
exit /b %RESULT%
