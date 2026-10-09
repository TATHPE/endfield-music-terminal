param(
    [string]$Root = (Split-Path $PSScriptRoot -Parent),
    [string]$WorkDir = (Join-Path $env:TEMP 'endfield-java-tests')
)
# ASCI-only helper: compile and run the pure-Java unit tests (lyrics parsing)
# with plain javac + JUnit 4, without the Android Gradle plugin.
#
# Why this exists: on this machine AGP's :app:testDebugUnitTest cannot load the
# compiled test classes (the project path is non-ASCII, and even the template
# ExampleUnitTest fails the same way). This runner needs no Android SDK and is
# what CI uses as well, so the parsing tests really do run.
$ErrorActionPreference = 'Stop'

$mainSrc = Join-Path $Root 'android\app\src\main\java\com\endfield\audio\terminal\lyrics\LyricsParsing.java'
$testSrc = Join-Path $Root 'android\app\src\test\java\com\endfield\audio\terminal\lyrics\LyricsParsingTest.java'
foreach ($f in @($mainSrc, $testSrc)) { if (-not (Test-Path $f)) { throw "missing source: $f" } }

# JUnit / hamcrest / org.json come from the Gradle cache (already downloaded by
# any earlier android build); CI fetches them from Maven Central instead.
$cache = Join-Path $env:USERPROFILE '.gradle\caches\modules-2\files-2.1'
function Find-Jar($group, $pattern) {
    $dir = Join-Path $cache $group
    if (-not (Test-Path $dir)) { return $null }
    $jar = Get-ChildItem $dir -Recurse -Filter $pattern -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch 'sources|javadoc' } | Select-Object -First 1
    if ($jar) { return $jar.FullName }
    return $null
}
$junit = Find-Jar 'junit\junit' 'junit-4*.jar'
$hamcrest = Find-Jar 'org.hamcrest\hamcrest-core' 'hamcrest-core-*.jar'
$json = Find-Jar 'org.json\json' 'json-*.jar'
foreach ($j in @($junit, $hamcrest, $json)) {
    if (-not $j) { throw "jar not found in the Gradle cache; run an android build once (or see the CI step)" }
}

$classes = Join-Path $WorkDir 'classes'
if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $classes | Out-Null

Write-Output "[java-test] workdir $WorkDir"
& javac -encoding UTF-8 -cp "$json;$junit" -d $classes $mainSrc $testSrc
if ($LASTEXITCODE -ne 0) { throw "javac failed ($LASTEXITCODE)" }
Write-Output '[java-test] compiled'

& java -cp "$classes;$json;$junit;$hamcrest" org.junit.runner.JUnitCore com.endfield.audio.terminal.lyrics.LyricsParsingTest
if ($LASTEXITCODE -ne 0) { throw "unit tests failed ($LASTEXITCODE)" }
Write-Output '[java-test] OK'
