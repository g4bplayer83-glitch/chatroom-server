$ErrorActionPreference = "Stop"

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Find-Godot {
    foreach ($name in @(
        "godot.console.exe",
        "godot4.console.exe",
        "Godot_v4.7.2-stable_win64_console.exe",
        "godot.exe",
        "godot4.exe",
        "Godot_v4.7.2-stable_win64.exe"
    )) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
        $local = Join-Path $PSScriptRoot $name
        if (Test-Path -LiteralPath $local) { return $local }
    }
    while ($true) {
        $entered = (Read-Host "Glisse l'executable Godot 4.7.2 ici").Trim().Trim('"')
        if (Test-Path -LiteralPath $entered -PathType Leaf) {
            return (Resolve-Path -LiteralPath $entered).Path
        }
        Write-Host "Godot est introuvable. Reessaie." -ForegroundColor Yellow
    }
}

function Find-Jdk17 {
    $candidates = @(
        $env:JAVA_HOME,
        "$env:ProgramFiles\Java\jdk-17",
        "$env:ProgramFiles\Eclipse Adoptium"
    )
    foreach ($candidate in $candidates) {
        if (-not $candidate) { continue }
        if (Test-Path -LiteralPath (Join-Path $candidate "bin\keytool.exe")) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
        if (Test-Path -LiteralPath $candidate -PathType Container) {
            $found = Get-ChildItem -LiteralPath $candidate -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "jdk-17*" } |
                Sort-Object Name -Descending |
                Select-Object -First 1
            if ($found -and (Test-Path -LiteralPath (Join-Path $found.FullName "bin\keytool.exe"))) {
                return $found.FullName
            }
        }
    }
    return $null
}

function Ensure-DebugKeystore([string]$JdkPath) {
    $androidHome = Join-Path $env:USERPROFILE ".android"
    $keystore = Join-Path $androidHome "debug.keystore"
    if (Test-Path -LiteralPath $keystore) { return $keystore }
    New-Item -ItemType Directory -Force -Path $androidHome | Out-Null
    $keytool = Join-Path $JdkPath "bin\keytool.exe"
    Write-Host "Creation du keystore Debug Android..."
    & $keytool -genkeypair -keystore $keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $keystore)) {
        throw "Impossible de creer le keystore Debug Android."
    }
    return $keystore
}

function Set-GodotEditorSetting([string]$Path, [string]$Key, [string]$Value) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $normalized = $Value.Replace('\', '/')
    $newLine = $Key + ' = "' + $normalized + '"'
    $lines = (Get-Content -LiteralPath $Path -Raw) -split "`r?`n"
    $pattern = '^' + [Regex]::Escape($Key) + '\s*='
    $found = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match $pattern) {
            $lines[$index] = $newLine
            $found = $true
        }
    }
    if (-not $found) { $lines += $newLine }
    $content = [String]::Join("`r`n", $lines).TrimEnd() + "`r`n"
    [IO.File]::WriteAllText($Path, $content, (New-Object Text.UTF8Encoding($false)))
}

$disabledExtensions = New-Object System.Collections.Generic.List[object]
$extensionListBackup = $null
$exitCode = 0

try {
    $projectDirectory = $PSScriptRoot
    if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory "project.godot"))) {
        throw "BUILD-ANDROID-FINAL.bat doit etre place dans le dossier contenant project.godot."
    }

    Write-Step "Verification de Godot et Java"
    $godotExe = Find-Godot
    $godotVersion = (& $godotExe --version 2>$null | Select-Object -First 1)
    if (-not $godotVersion.StartsWith("4.7.2")) {
        throw "Godot 4.7.2 est requis, version detectee : $godotVersion"
    }
    $jdkPath = Find-Jdk17
    if (-not $jdkPath) { throw "Java JDK 17 est introuvable. Relance d'abord l'installateur Android automatique." }
    $env:JAVA_HOME = $jdkPath
    $debugKeystore = Ensure-DebugKeystore $jdkPath

    $settingsPath = Join-Path $env:APPDATA "Godot\editor_settings-4.7.tres"
    if (Test-Path -LiteralPath $settingsPath) {
        Copy-Item -LiteralPath $settingsPath -Destination ($settingsPath + ".before-android-final") -Force
        Set-GodotEditorSetting $settingsPath "export/android/debug_keystore" $debugKeystore
        Set-GodotEditorSetting $settingsPath "export/android/debug_keystore_user" "androiddebugkey"
        Set-GodotEditorSetting $settingsPath "export/android/debug_keystore_pass" "android"
    }

    Write-Step "Desactivation temporaire des extensions PC"
    $temporaryDirectory = Join-Path $env:TEMP ("among_funk_android_extensions_" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $temporaryDirectory | Out-Null
    $extensionPaths = @(
        "addons\AudioVorbisExtender\AudioStreamExt.gdextension",
        "addons\ffmpeg\ffmpeg.gdextension"
    )
    foreach ($relativePath in $extensionPaths) {
        $originalPath = Join-Path $projectDirectory $relativePath
        if (Test-Path -LiteralPath $originalPath) {
            $backupPath = Join-Path $temporaryDirectory ([IO.Path]::GetFileName($originalPath))
            Move-Item -LiteralPath $originalPath -Destination $backupPath -Force
            $disabledExtensions.Add([PSCustomObject]@{ Original = $originalPath; Backup = $backupPath })
            Write-Host "Desactive pour Android : $relativePath"
        }
    }
    $extensionList = Join-Path $projectDirectory ".godot\extension_list.cfg"
    if (Test-Path -LiteralPath $extensionList) {
        $extensionListBackup = Join-Path $temporaryDirectory "extension_list.cfg"
        Move-Item -LiteralPath $extensionList -Destination $extensionListBackup -Force
    }

    Write-Step "Compilation Debug Android"
    $outputDirectory = Join-Path $projectDirectory "export"
    $outputApk = Join-Path $outputDirectory "Among-Funk-v0.1.0-Android-Debug.apk"
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    if (Test-Path -LiteralPath $outputApk) {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        Move-Item -LiteralPath $outputApk -Destination (Join-Path $outputDirectory "Among-Funk-v0.1.0-Android-Debug.previous-$timestamp.apk")
    }

    $argumentString = '--headless --path "' + $projectDirectory + '" --export-debug "Android" "' + $outputApk + '"'
    $process = Start-Process -FilePath $godotExe -ArgumentList $argumentString -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Godot a retourne le code $($process.ExitCode)." }
    if (-not (Test-Path -LiteralPath $outputApk)) { throw "Godot n'a pas cree l'APK." }
    if ((Get-Item -LiteralPath $outputApk).Length -lt 1048576) { throw "L'APK cree est anormalement petit." }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($outputApk)
    try {
        $entryNames = $archive.Entries | ForEach-Object { $_.FullName }
        foreach ($required in @("AndroidManifest.xml", "classes.dex", "lib/arm64-v8a/libgodot_android.so")) {
            if ($entryNames -notcontains $required) { throw "APK incomplet : $required est absent." }
        }
    } finally {
        $archive.Dispose()
    }

    Write-Host ""
    Write-Host "APK CREE ET VERIFIE :" -ForegroundColor Green
    Write-Host $outputApk -ForegroundColor Green
    Start-Process explorer.exe -ArgumentList ('/select,"' + $outputApk + '"')
} catch {
    Write-Host ""
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
} finally {
    foreach ($item in $disabledExtensions) {
        if (Test-Path -LiteralPath $item.Backup) {
            Move-Item -LiteralPath $item.Backup -Destination $item.Original -Force
        }
    }
    if ($extensionListBackup -and (Test-Path -LiteralPath $extensionListBackup)) {
        $extensionList = Join-Path $projectDirectory ".godot\extension_list.cfg"
        Move-Item -LiteralPath $extensionListBackup -Destination $extensionList -Force
    }
    if ($temporaryDirectory -and (Test-Path -LiteralPath $temporaryDirectory)) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}

exit $exitCode
