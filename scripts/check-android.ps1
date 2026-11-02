$androidSdkPath = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$androidChecks = [ordered]@{
  'JDK 17' = [bool](Get-ChildItem 'C:/Program Files/Microsoft' -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue)
  'Android command-line tools' = Test-Path (Join-Path $androidSdkPath 'cmdline-tools/latest/bin/sdkmanager.bat')
  'adb / platform-tools' = Test-Path (Join-Path $androidSdkPath 'platform-tools/adb.exe')
  'Android platform 36' = Test-Path (Join-Path $androidSdkPath 'platforms/android-36/android.jar')
  'Build tools 36.0.0' = Test-Path (Join-Path $androidSdkPath 'build-tools/36.0.0/aapt2.exe')
}
foreach ($entry in $androidChecks.GetEnumerator()) {
  $state = if ($entry.Value) { 'OK' } else { 'MISSING' }
  Write-Output "$state : $($entry.Key)"
}
if ($androidChecks['adb / platform-tools']) {
  & (Join-Path $androidSdkPath 'platform-tools/adb.exe') devices -l
}
if ($androidChecks.Values -contains $false) { exit 1 }
