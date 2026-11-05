param(
  [string]$BuildRoot = 'C:/am-p0',
  [string]$DebugKeystore = '',
  [switch]$SkipNativeLint
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildPath = [IO.Path]::GetFullPath($BuildRoot)
if ($buildPath -match '\s' -or $buildPath.Length -gt 24 -or $buildPath -match '^[A-Za-z]:\\?$') {
  throw 'Use a short non-root build directory without spaces, such as C:/am-p0.'
}
$marker = Join-Path $buildPath '.ai-motion-build-source'
if (Test-Path -LiteralPath $buildPath) {
  if (-not (Test-Path -LiteralPath $marker) -or (Get-Content -Raw -LiteralPath $marker).Trim() -ne $repoRoot) {
    throw 'Build directory exists and is not owned by this checkout; choose a new path.'
  }
} else {
  New-Item -ItemType Directory -Path $buildPath | Out-Null
  Set-Content -LiteralPath $marker -Value $repoRoot -Encoding utf8
}
if ($DebugKeystore -and -not (Test-Path -LiteralPath $DebugKeystore)) { throw 'Requested signing file not found.' }
$mobileBuild = Join-Path $buildPath 'apps/mobile'
New-Item -ItemType Directory -Force $mobileBuild | Out-Null
foreach ($name in @('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','metro.config.js','app.json','index.ts','tsconfig.json')) {
  Copy-Item -LiteralPath (Join-Path $repoRoot "apps/mobile/$name") -Destination $mobileBuild -Force
}
Copy-Item -LiteralPath (Join-Path $repoRoot 'apps/mobile/src') -Destination $mobileBuild -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'apps/mobile/plugins') -Destination $mobileBuild -Recurse -Force
foreach ($name in @('motion-core','game-core','session-core','vision-contract')) {
  $packageBuild = Join-Path $buildPath "packages/$name"
  New-Item -ItemType Directory -Force $packageBuild | Out-Null
  Copy-Item -LiteralPath (Join-Path $repoRoot "packages/$name/src") -Destination $packageBuild -Recurse -Force
}
. (Join-Path $PSScriptRoot 'android-env.ps1')
$env:CI = '1'
Push-Location -LiteralPath $mobileBuild
try {
  pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  pnpm exec expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw 'Android project generation failed.' }
  if ($DebugKeystore) { Copy-Item -LiteralPath $DebugKeystore -Destination 'android/app/debug.keystore' -Force }
  $gradleProperties = Join-Path $mobileBuild 'android/gradle.properties'
  $propertiesText = [IO.File]::ReadAllText($gradleProperties)
  $propertiesText = [regex]::Replace($propertiesText, '(?m)^android\.enableMinifyInReleaseBuilds=.*$', 'android.enableMinifyInReleaseBuilds=false')
  [IO.File]::WriteAllText($gradleProperties, $propertiesText, [Text.UTF8Encoding]::new($false))
  Push-Location -LiteralPath 'android'
  try {
    $gradleArguments = @('app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a', '--max-workers=4', '--console=plain')
    if ($SkipNativeLint) {
      Write-Output 'Native release lint is deferred for this internal test package.'
      $gradleArguments += @('-x', ':app:lintVitalRelease', '-x', ':app:lintVitalReportRelease', '-x', ':app:lintVitalAnalyzeRelease')
    }
    & ./gradlew.bat @gradleArguments
    if ($LASTEXITCODE -ne 0) { throw 'Android test APK build failed.' }
  } finally { Pop-Location }
  $version = (Get-Content -Raw package.json | ConvertFrom-Json).version
  $artifactDirectory = Join-Path $repoRoot '.local/apk'
  New-Item -ItemType Directory -Force $artifactDirectory | Out-Null
  $artifact = Join-Path $artifactDirectory "ai-motion-$version-test.apk"
  Copy-Item -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk' -Destination $artifact -Force
  Write-Output "Test APK: $artifact"
} finally { Pop-Location }
