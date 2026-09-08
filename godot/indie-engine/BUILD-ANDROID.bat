@echo off
setlocal EnableExtensions
title Among Funk v0.1.0 - Android Builder

set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "OUTPUT_DIR=%PROJECT_DIR%export"
set "OUTPUT_APK=%OUTPUT_DIR%\Among-Funk-v0.1.0-Android.apk"
set "GODOT_EXE="

for %%G in (godot.exe godot4.exe Godot_v4.7.2-stable_win64.exe) do (
    where %%G >nul 2>nul
    if not errorlevel 1 if not defined GODOT_EXE set "GODOT_EXE=%%G"
)

if not defined GODOT_EXE (
    echo Godot 4.7.2 was not found automatically.
    echo Drag Godot_v4.7.2-stable_win64.exe into this window, then press ENTER.
    set /p "GODOT_EXE=Godot path: "
)

if not exist "%GODOT_EXE%" (
    where "%GODOT_EXE%" >nul 2>nul
    if errorlevel 1 (
        echo.
        echo ERROR: Godot executable not found.
        pause
        exit /b 1
    )
)

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo.
echo Building Android APK...
"%GODOT_EXE%" --headless --path "%PROJECT_DIR%" --export-release "Android" "%OUTPUT_APK%"
if errorlevel 1 (
    echo.
    echo BUILD FAILED.
    echo Install the Godot Android export templates, Android SDK and Java 17,
    echo then configure Editor Settings - Export - Android and retry.
    pause
    exit /b 1
)

echo.
echo APK created successfully:
echo %OUTPUT_APK%
start "" "%OUTPUT_DIR%"
pause
