param([string]$AssetDirectory = '')
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $AssetDirectory) { $AssetDirectory = Join-Path $repo 'apps/mobile/modules/ball-vision/android/src/main/assets' }
$assetPath = [IO.Path]::GetFullPath($AssetDirectory)
New-Item -ItemType Directory -Force -Path $assetPath | Out-Null
$model = Join-Path $assetPath 'efficientdet_lite0.tflite'
$expected = '0720BF247BD76E6594EA28FA9C6F7C5242BE774818997DBBEFFC4DA460C723BB'
if (-not (Test-Path -LiteralPath $model)) {
  Invoke-WebRequest -Uri 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite' -OutFile $model
}
if ((Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash -ne $expected) { throw 'Ball model hash does not match the pinned release.' }
Copy-Item -LiteralPath (Join-Path $repo 'apps/mobile/modules/ball-vision/APACHE-2.0.txt') -Destination (Join-Path $assetPath 'MODEL-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $repo 'apps/mobile/modules/ball-vision/MODEL_NOTICE.txt') -Destination (Join-Path $assetPath 'MODEL-NOTICE.txt') -Force
Write-Output 'Official EfficientDet-Lite0 model SHA-256 verified.'
