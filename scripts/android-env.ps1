# Dot-source this file: . ./scripts/android-env.ps1
$androidSdkPath = $env:ANDROID_HOME
if (-not $androidSdkPath) {
  $sdkCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Android/Sdk'),
    (Join-Path $env:LOCALAPPDATA 'Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/Android/Sdk')
  )
  $androidSdkPath = $sdkCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'cmdline-tools/latest/bin/sdkmanager.bat') } | Select-Object -First 1
}
$jdkSearchRoot = 'C:/Program Files/Microsoft'
$jdk17Path = Get-ChildItem -LiteralPath $jdkSearchRoot -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
if (-not $jdk17Path) { throw 'Microsoft JDK 17 is not installed yet. Complete its installer first.' }
if (-not $androidSdkPath -or -not (Test-Path -LiteralPath $androidSdkPath)) { throw 'Android SDK not found. Set ANDROID_HOME to your installed SDK directory.' }
$env:JAVA_HOME = $jdk17Path.FullName
$env:ANDROID_HOME = $androidSdkPath
$env:ANDROID_SDK_ROOT = $androidSdkPath
$androidToolPaths = @(
  (Join-Path $env:JAVA_HOME 'bin'),
  (Join-Path $androidSdkPath 'platform-tools'),
  (Join-Path $androidSdkPath 'cmdline-tools/latest/bin')
)
$env:PATH = ($androidToolPaths + ($env:PATH -split ';') | Select-Object -Unique) -join ';'
Write-Host 'Android environment activated for this PowerShell session.'
