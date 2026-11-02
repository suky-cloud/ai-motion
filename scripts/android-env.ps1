# Dot-source this file: . ./scripts/android-env.ps1
$androidSdkPath = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$jdkSearchRoot = 'C:/Program Files/Microsoft'
$jdk17Path = Get-ChildItem -LiteralPath $jdkSearchRoot -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
if (-not $jdk17Path) { throw 'Microsoft JDK 17 is not installed yet. Complete its installer first.' }
if (-not (Test-Path -LiteralPath $androidSdkPath)) { throw "Android SDK directory not found: $androidSdkPath" }
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
