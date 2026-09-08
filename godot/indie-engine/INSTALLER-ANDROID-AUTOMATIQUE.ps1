$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$GodotVersion = "4.7.2"
$GodotTemplateStatus = "4.7.2.stable"
$TemplateUrl = "https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz"
$TemplateSha256 = "f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011"
$AndroidToolsUrl = "https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip"
$AndroidToolsSha256 = "90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a"

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Clean-PathInput([string]$Value) {
    if ($null -eq $Value) { return "" }
    return $Value.Trim().Trim('"').TrimEnd('\')
}

function Find-Jdk17 {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:JAVA_HOME) { $candidates.Add((Clean-PathInput $env:JAVA_HOME)) }

    foreach ($base in @("$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java", "${env:ProgramFiles(x86)}\Eclipse Adoptium")) {
        if ($base -and (Test-Path -LiteralPath $base)) {
            Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "jdk-17*" -or $_.Name -like "temurin-17*" } |
                Sort-Object Name -Descending |
                ForEach-Object { $candidates.Add($_.FullName) }
        }
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate "bin\javac.exe"))) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

function Find-GodotExecutable([string]$StartDirectory) {
    foreach ($name in @("godot.exe", "godot4.exe", "Godot_v4.7.2-stable_win64.exe")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
        $local = Join-Path $StartDirectory $name
        if (Test-Path -LiteralPath $local) { return $local }
    }

    while ($true) {
        $entered = Clean-PathInput (Read-Host "Glisse Godot_v4.7.2-stable_win64.exe ici puis appuie sur ENTREE")
        if (Test-Path -LiteralPath $entered -PathType Leaf) { return (Resolve-Path -LiteralPath $entered).Path }
        Write-Host "Executable Godot introuvable. Reessaie." -ForegroundColor Yellow
    }
}

function Find-ProjectDirectory([string]$StartDirectory) {
    if (Test-Path -LiteralPath (Join-Path $StartDirectory "project.godot")) {
        return (Resolve-Path -LiteralPath $StartDirectory).Path
    }

    while ($true) {
        $entered = Clean-PathInput (Read-Host "Glisse le dossier Among Funk contenant project.godot ici")
        if (Test-Path -LiteralPath (Join-Path $entered "project.godot")) {
            return (Resolve-Path -LiteralPath $entered).Path
        }
        Write-Host "project.godot est introuvable dans ce dossier." -ForegroundColor Yellow
    }
}

function Set-GodotEditorPath([string]$SettingsPath, [string]$Key, [string]$Value) {
    $normalized = $Value.Replace('\', '/')
    $line = $Key + ' = "' + $normalized + '"'
    $content = Get-Content -LiteralPath $SettingsPath -Raw
    $lines = $content -split "`r?`n"
    $pattern = '^' + [Regex]::Escape($Key) + '\s*='
    $found = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match $pattern) {
            $lines[$index] = $line
            $found = $true
        }
    }
    if (-not $found) {
        $lines += $line
    }
    $content = [String]::Join("`r`n", $lines).TrimEnd() + "`r`n"
    [IO.File]::WriteAllText($SettingsPath, $content, (New-Object Text.UTF8Encoding($false)))
}

try {
    $ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
    $ProjectDirectory = Find-ProjectDirectory $ScriptDirectory
    $GodotExe = Find-GodotExecutable $ScriptDirectory

    Write-Step "Verification de Godot"
    $versionOutput = (& $GodotExe --version 2>$null | Select-Object -First 1)
    if (-not $versionOutput) { throw "Impossible de lire la version de Godot." }
    Write-Host "Godot detecte : $versionOutput"
    if (-not $versionOutput.StartsWith($GodotVersion)) {
        throw "Ce projet demande Godot $GodotVersion, mais $versionOutput a ete detecte."
    }

    Write-Step "Verification des modeles d'exportation Android"
    $TemplateDirectory = Join-Path $env:APPDATA "Godot\export_templates\$GodotTemplateStatus"
    $DebugTemplate = Join-Path $TemplateDirectory "android_debug.apk"
    $ReleaseTemplate = Join-Path $TemplateDirectory "android_release.apk"

    if (-not ((Test-Path -LiteralPath $DebugTemplate) -and (Test-Path -LiteralPath $ReleaseTemplate))) {
        $portableTemplates = Join-Path (Split-Path -Parent $GodotExe) "editor_data\export_templates\$GodotTemplateStatus"
        if ((Test-Path -LiteralPath (Join-Path $portableTemplates "android_debug.apk")) -and
            (Test-Path -LiteralPath (Join-Path $portableTemplates "android_release.apk"))) {
            New-Item -ItemType Directory -Force -Path $TemplateDirectory | Out-Null
            Copy-Item -Path (Join-Path $portableTemplates "*") -Destination $TemplateDirectory -Recurse -Force
        }
    }

    if (-not ((Test-Path -LiteralPath $DebugTemplate) -and (Test-Path -LiteralPath $ReleaseTemplate))) {
        Write-Host "Godot les annonce installes, mais les deux APK modeles sont absents du dossier utilise par cette copie." -ForegroundColor Yellow
        Write-Host "Telechargement des modeles officiels Godot $GodotVersion (fichier volumineux)..."
        $templateWork = Join-Path $env:TEMP ("among_funk_templates_" + [Guid]::NewGuid().ToString("N"))
        $templateZip = Join-Path $templateWork "templates.zip"
        $templateExtract = Join-Path $templateWork "unpacked"
        New-Item -ItemType Directory -Force -Path $templateWork, $templateExtract | Out-Null
        Invoke-WebRequest -UseBasicParsing -Uri $TemplateUrl -OutFile $templateZip
        $actualTemplateHash = (Get-FileHash -LiteralPath $templateZip -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualTemplateHash -ne $TemplateSha256) { throw "Le controle SHA-256 des modeles Godot a echoue." }
        Expand-Archive -LiteralPath $templateZip -DestinationPath $templateExtract -Force
        $foundDebug = Get-ChildItem -LiteralPath $templateExtract -Filter "android_debug.apk" -File -Recurse | Select-Object -First 1
        if (-not $foundDebug) { throw "Le paquet officiel ne contient pas android_debug.apk." }
        $sourceTemplateDirectory = $foundDebug.Directory.FullName
        New-Item -ItemType Directory -Force -Path $TemplateDirectory | Out-Null
        Copy-Item -Path (Join-Path $sourceTemplateDirectory "*") -Destination $TemplateDirectory -Recurse -Force
        Remove-Item -LiteralPath $templateWork -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (-not ((Test-Path -LiteralPath $DebugTemplate) -and (Test-Path -LiteralPath $ReleaseTemplate))) {
        throw "Les modeles Android n'ont pas pu etre installes dans $TemplateDirectory"
    }
    Write-Host "Modeles Android OK : $TemplateDirectory" -ForegroundColor Green

    Write-Step "Verification de Java JDK 17"
    $JdkPath = Find-Jdk17
    if (-not $JdkPath) {
        $winget = Get-Command "winget.exe" -ErrorAction SilentlyContinue
        if (-not $winget) {
            throw "Java 17 est absent et Winget n'est pas disponible. Installe Eclipse Temurin JDK 17 puis relance ce script."
        }
        Write-Host "Installation d'Eclipse Temurin JDK 17 avec Winget..."
        & $winget.Source install --exact --id EclipseAdoptium.Temurin.17.JDK --silent --accept-package-agreements --accept-source-agreements
        $JdkPath = Find-Jdk17
    }
    if (-not $JdkPath) { throw "JDK 17 introuvable apres l'installation." }
    $env:JAVA_HOME = $JdkPath
    & setx.exe JAVA_HOME $JdkPath | Out-Null
    Write-Host "Java 17 OK : $JdkPath" -ForegroundColor Green

    Write-Step "Verification du SDK Android"
    $SdkPath = $null
    foreach ($candidate in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA "Android\Sdk"))) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            $SdkPath = (Resolve-Path -LiteralPath $candidate).Path
            break
        }
    }
    if (-not $SdkPath) {
        $SdkPath = Join-Path $env:LOCALAPPDATA "Android\Sdk"
        New-Item -ItemType Directory -Force -Path $SdkPath | Out-Null
    }

    $SdkManager = Join-Path $SdkPath "cmdline-tools\latest\bin\sdkmanager.bat"
    $AndroidLicenseAccepted = $false
    if (-not (Test-Path -LiteralPath $SdkManager)) {
        Write-Host "Les outils Android en ligne de commande sont absents." -ForegroundColor Yellow
        Write-Host "Ils seront telecharges depuis dl.google.com et leur licence Android devra etre acceptee."
        $accept = (Read-Host "Tape OUI pour accepter et continuer").Trim().ToUpperInvariant()
        if ($accept -ne "OUI") { throw "Licence Android non acceptee : installation annulee." }
        $AndroidLicenseAccepted = $true

        $androidWork = Join-Path $env:TEMP ("among_funk_android_" + [Guid]::NewGuid().ToString("N"))
        $androidZip = Join-Path $androidWork "commandline-tools.zip"
        $androidExtract = Join-Path $androidWork "unpacked"
        New-Item -ItemType Directory -Force -Path $androidWork, $androidExtract | Out-Null
        Invoke-WebRequest -UseBasicParsing -Uri $AndroidToolsUrl -OutFile $androidZip
        $actualHash = (Get-FileHash -LiteralPath $androidZip -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $AndroidToolsSha256) { throw "Le controle SHA-256 des outils Android a echoue." }
        Expand-Archive -LiteralPath $androidZip -DestinationPath $androidExtract -Force
        $sourceTools = Join-Path $androidExtract "cmdline-tools"
        $latestTools = Join-Path $SdkPath "cmdline-tools\latest"
        New-Item -ItemType Directory -Force -Path $latestTools | Out-Null
        Copy-Item -Path (Join-Path $sourceTools "*") -Destination $latestTools -Recurse -Force
        Remove-Item -LiteralPath $androidWork -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (-not (Test-Path -LiteralPath $SdkManager)) { throw "sdkmanager.bat est introuvable." }
    $env:ANDROID_HOME = $SdkPath
    $env:ANDROID_SDK_ROOT = $SdkPath
    & setx.exe ANDROID_HOME $SdkPath | Out-Null
    & setx.exe ANDROID_SDK_ROOT $SdkPath | Out-Null

    if (-not $AndroidLicenseAccepted) {
        Write-Host "La mise a jour du SDK necessite l'acceptation des licences Android."
        $accept = (Read-Host "Tape OUI pour accepter et continuer").Trim().ToUpperInvariant()
        if ($accept -ne "OUI") { throw "Licence Android non acceptee : installation annulee." }
    }
    Write-Host "Acceptation des licences Android confirmees par l'utilisateur..."
    $yesFile = Join-Path $env:TEMP ("android_yes_" + [Guid]::NewGuid().ToString("N") + ".txt")
    (1..200 | ForEach-Object { "y" }) | Set-Content -LiteralPath $yesFile -Encoding Ascii
    $licenseCommand = '"' + $SdkManager + '" --sdk_root="' + $SdkPath + '" --licenses < "' + $yesFile + '"'
    & cmd.exe /d /c $licenseCommand
    Remove-Item -LiteralPath $yesFile -Force -ErrorAction SilentlyContinue

    Write-Host "Installation/mise a jour des composants requis..."
    & $SdkManager "--sdk_root=$SdkPath" "platform-tools" "build-tools;35.0.1" "platforms;android-35" "cmdline-tools;latest" "cmake;3.10.2.4988404" "ndk;28.1.13356709"
    if ($LASTEXITCODE -ne 0) { throw "sdkmanager a retourne le code $LASTEXITCODE." }
    if (-not (Test-Path -LiteralPath (Join-Path $SdkPath "platform-tools\adb.exe"))) {
        throw "Android platform-tools/adb.exe est absent apres l'installation."
    }
    Write-Host "SDK Android OK : $SdkPath" -ForegroundColor Green

    Write-Step "Configuration automatique de Godot"
    $GodotSettingsDirectory = Join-Path $env:APPDATA "Godot"
    $GodotSettings = Join-Path $GodotSettingsDirectory "editor_settings-4.7.tres"
    New-Item -ItemType Directory -Force -Path $GodotSettingsDirectory | Out-Null
    if (-not (Test-Path -LiteralPath $GodotSettings)) {
        & $GodotExe --headless --editor --path $ProjectDirectory --quit
    }
    if (Test-Path -LiteralPath $GodotSettings) {
        Copy-Item -LiteralPath $GodotSettings -Destination ($GodotSettings + ".among-funk-backup") -Force
        Set-GodotEditorPath $GodotSettings "export/android/java_sdk_path" $JdkPath
        Set-GodotEditorPath $GodotSettings "export/android/android_sdk_path" $SdkPath
        Write-Host "Parametres Godot mis a jour (sauvegarde .among-funk-backup creee)." -ForegroundColor Green
    } else {
        Write-Host "Godot utilisera JAVA_HOME et ANDROID_HOME pour cette compilation." -ForegroundColor Yellow
    }

    Write-Step "Verification finale"
    Write-Host "Projet          : $ProjectDirectory"
    Write-Host "Godot           : $GodotExe"
    Write-Host "Modeles Android : $TemplateDirectory"
    Write-Host "Java 17         : $JdkPath"
    Write-Host "SDK Android     : $SdkPath"

    $buildNow = (Read-Host "Compiler Among Funk maintenant ? [O/n]").Trim().ToUpperInvariant()
    if ($buildNow -eq "" -or $buildNow -eq "O" -or $buildNow -eq "OUI") {
        $runningGodot = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "Godot*" }
        if ($runningGodot) {
            Write-Host "Ferme toutes les autres fenetres Godot, puis appuie sur ENTREE." -ForegroundColor Yellow
            Read-Host | Out-Null
        }
        $OutputDirectory = Join-Path $ProjectDirectory "export"
        $OutputApk = Join-Path $OutputDirectory "Among-Funk-v0.1.0-Android.apk"
        New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
        Write-Step "Compilation de l'APK"
        & $GodotExe --headless --path $ProjectDirectory --export-release "Android" $OutputApk
        if ($LASTEXITCODE -ne 0) { throw "Godot a echoue avec le code $LASTEXITCODE." }
        if (-not (Test-Path -LiteralPath $OutputApk)) { throw "Godot n'a pas cree l'APK attendu." }
        Write-Host "APK cree : $OutputApk" -ForegroundColor Green
        Start-Process explorer.exe -ArgumentList ('/select,"' + $OutputApk + '"')
    }

    exit 0
} catch {
    Write-Host ""
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Aucun dossier de projet n'a ete supprime." -ForegroundColor DarkGray
    exit 1
}
