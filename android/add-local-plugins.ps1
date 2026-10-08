# Merge the app's local (source-tree) plugins back into capacitor.plugins.json.
# `cap sync` regenerates that file from npm packages only and drops local plugins;
# the runtime Bridge loads plugin entries from this JSON before any JS injection,
# so listing them here makes the plugins unconditionally available on Android
# (independent of MainActivity.registerPlugin timing, which some Capacitor 7
# builds do not reflect in the injected `window.Capacitor.Plugins` set).
$ErrorActionPreference = 'Stop'
$jsonPath = Join-Path $PSScriptRoot 'app\src\main\assets\capacitor.plugins.json'
$data = Get-Content $jsonPath -Raw | ConvertFrom-Json
$entries = @(
    @{ pkg = 'endfield-media-scanner'; classpath = 'com.endfield.audio.terminal.MediaScannerPlugin' },
    @{ pkg = 'endfield-system-bars'; classpath = 'com.endfield.audio.terminal.SystemBarsPlugin' }
)
foreach ($entry in $entries) {
    $exists = $data | Where-Object { $_.classpath -eq $entry.classpath }
    if (-not $exists) {
        $data += [pscustomobject]$entry
    }
}
$data | ConvertTo-Json -Depth 4 | Set-Content $jsonPath -Encoding utf8
Write-Host "local plugins merged -> $jsonPath"
