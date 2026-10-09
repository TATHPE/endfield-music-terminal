<#
  Endfield Music Terminal — local APK build helper.

  ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1 files as ANSI,
  so a non-ASCII literal here would be corrupted. All user-facing text is ASCII.

  Usage (from the repository root):
    node --version                             # any modern Node works
    pwsh tools/build-apk.ps1                   # release build, needs public/songs/*.mp3
    pwsh tools/build-apk.ps1 -Type both
    pwsh tools/build-apk.ps1 -NoSongs          # "lite" build (~4 MB, no preset songs)
    pwsh tools/build-apk.ps1 -OutDir D:\out -ToolsRoot D:\tools\Andriod

  The version comes from package.json ("version"); Gradle derives versionCode as
  major*10000 + minor*100 + patch. Both can be overridden:
    ./gradlew assembleRelease -PappVersionName=1.4.3 -PappVersionCode=10403
#>
param(
  [ValidateSet('debug', 'release', 'both')] [string]$Type = 'release',
  [switch]$NoSongs,
  [string]$OutDir = '',
  [string]$ToolsRoot = '',
  [string]$NodeExe = ''
)

$ErrorActionPreference = 'Continue'

$repo = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
if (-not (Test-Path -LiteralPath (Join-Path $repo 'package.json'))) { throw "Repository root not found (looked at $repo)" }

# --- Node -------------------------------------------------------------------
if (-not $NodeExe) {
  $candidates = @('C:\Program Files\nodejs\node.exe', "$env:ProgramFiles\nodejs\node.exe")
  foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { $NodeExe = $c; break } }
  if (-not $NodeExe) { $NodeExe = 'node' }
}

# --- Android toolchain ------------------------------------------------------
if (-not $ToolsRoot) { $ToolsRoot = $env:ENDFIELD_TOOLS }
if (-not $ToolsRoot) {
  $guess = Join-Path (Split-Path -Parent (Split-Path -Parent $repo)) 'Andriod'
  if (Test-Path -LiteralPath $guess) { $ToolsRoot = $guess }
}
if (-not $ToolsRoot -or -not (Test-Path -LiteralPath $ToolsRoot)) {
  throw 'Android toolchain root not found: pass -ToolsRoot <dir> or set ENDFIELD_TOOLS'
}
$jdk = Join-Path $ToolsRoot 'jdk\jdk-21'
$sdk = Join-Path $ToolsRoot 'android-sdk'
$gradle = Join-Path $ToolsRoot 'gradle-8.14.3\bin\gradle.bat'
foreach ($p in @($jdk, $sdk, $gradle)) { if (-not (Test-Path -LiteralPath $p)) { throw "Missing toolchain part: $p" } }

# --- version (single source of truth) ---------------------------------------
# Read as UTF-8 explicitly: Windows PowerShell 5.1 decodes BOM-less files as ANSI
# (package.json carries a non-ASCII description) and ConvertFrom-Json would fail.
$pkgText = [System.IO.File]::ReadAllText((Join-Path $repo 'package.json'), [System.Text.Encoding]::UTF8)
$version = ''
if ($pkgText -match '"version"\s*:\s*"([^"]+)"') { $version = $Matches[1] }
if (-not $version) { throw 'package.json has no "version" field' }
Write-Host "[build] version $version  |  variant $(if ($NoSongs) {'lite (no preset songs)'} else {'with preset songs'})  |  type $Type"

# --- optional: park the preset songs so the web build excludes them ---------
$songsDir = Join-Path $repo 'public\songs'
$assetSongs = Join-Path $repo 'android\app\src\main\assets\public\songs'
$parked = Join-Path $env:TEMP ('endfield-songs-' + [guid]::NewGuid().ToString('N'))
$parkedFlag = $false
if ($NoSongs) {
  if (Test-Path -LiteralPath $songsDir) { Move-Item -LiteralPath $songsDir -Destination $parked -Force; $parkedFlag = $true; Write-Host '[build] public/songs parked away (lite)' }
  if (Test-Path -LiteralPath $assetSongs) { Remove-Item -LiteralPath $assetSongs -Recurse -Force; Write-Host '[build] removed stale songs from the Android assets' }
}

try {
  # --- web assets + capacitor sync ------------------------------------------
  Push-Location $repo
  try {
    Write-Host '[build] vite build (vite.capacitor.config.ts)'
    & $NodeExe (Join-Path $repo 'node_modules\vite\bin\vite.js') build --config vite.capacitor.config.ts
    if ($LASTEXITCODE -ne 0) { throw "vite build failed (exit $LASTEXITCODE)" }

    Write-Host '[build] cap sync android'
    & $NodeExe (Join-Path $repo 'node_modules\@capacitor\cli\bin\capacitor') sync android
    if ($LASTEXITCODE -ne 0) { throw "cap sync failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }

  # --- gradle ---------------------------------------------------------------
  $env:JAVA_HOME = $jdk
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
  $tasks = @()
  if ($Type -in 'debug', 'both') { $tasks += @{ Task = 'assembleDebug'; Dir = 'debug' } }
  if ($Type -in 'release', 'both') { $tasks += @{ Task = 'assembleRelease'; Dir = 'release' } }

  Push-Location (Join-Path $repo 'android')
  try {
    foreach ($t in $tasks) {
      Write-Host ("[build] gradle " + $t.Task)
      & cmd.exe /d /c "`"$gradle`" $($t.Task) --no-daemon 2>&1"
      if ($LASTEXITCODE -ne 0) { throw "gradle $($t.Task) failed (exit $LASTEXITCODE)" }
    }
  } finally { Pop-Location }

  # --- collect artefacts ----------------------------------------------------
  if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $repo) 'apk-out' }
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  foreach ($t in $tasks) {
    $src = Join-Path $repo ("android\app\build\outputs\apk\" + $t.Dir + "\app-" + $t.Dir + ".apk")
    if (-not (Test-Path -LiteralPath $src)) { throw "APK not produced: $src" }
    $suffix = if ($NoSongs) { 'lite' } else { 'full' }
    $dest = Join-Path $OutDir ("EndfieldMusicTerminal-v" + $version + "-" + $t.Dir + "-" + $suffix + ".apk")
    Copy-Item -LiteralPath $src -Destination $dest -Force
    $mb = [math]::Round((Get-Item -LiteralPath $dest).Length / 1MB, 2)
    Write-Host ("[build] OK  $dest  ($mb MB)  sha256=" + (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash)
  }
  Write-Host '[build] done'
} finally {
  if ($parkedFlag -and (Test-Path -LiteralPath $parked)) {
    if (Test-Path -LiteralPath $songsDir) { Remove-Item -LiteralPath $songsDir -Recurse -Force }
    Move-Item -LiteralPath $parked -Destination $songsDir -Force
    Write-Host '[build] public/songs restored'
  }
}
