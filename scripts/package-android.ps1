param(
    [switch]$Install,
    [string]$DeviceId
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'support/Get-ArtifactSha256.ps1')
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$appRoot = Join-Path $repositoryRoot 'apps/authenticator'
$buildOutput = Join-Path $appRoot 'build/app/outputs/flutter-apk/app-debug.apk'
$packageDirectory = Join-Path $repositoryRoot 'dist/android'
$packagePath = Join-Path $packageDirectory 'zero-vault-p1-debug.apk'
$adb = Get-Command adb -ErrorAction SilentlyContinue
if (!$adb) {
    $sdkRoot = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { $env:ANDROID_HOME }
    if (!$sdkRoot -and $env:LOCALAPPDATA) { $sdkRoot = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
    if (!$sdkRoot) {
        $localProperties = Join-Path $appRoot 'android/local.properties'
        if (Test-Path -LiteralPath $localProperties -PathType Leaf) {
            $sdkProperty = Select-String -LiteralPath $localProperties -Pattern '^sdk\.dir=(.+)$' | Select-Object -First 1
            if ($sdkProperty) { $sdkRoot = $sdkProperty.Matches[0].Groups[1].Value -replace '\\\\', '\' }
        }
    }
    $adbPath = if ($sdkRoot) { Join-Path $sdkRoot 'platform-tools/adb.exe' }
    if ($adbPath -and (Test-Path -LiteralPath $adbPath -PathType Leaf)) { $adb = @{ Source = $adbPath } }
}

Push-Location $appRoot
try {
    & flutter build apk --debug
    if ($LASTEXITCODE -ne 0) { throw "Flutter APK build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
if (!(Test-Path -LiteralPath $buildOutput -PathType Leaf)) { throw "APK build output is missing: $buildOutput" }

New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null
Copy-Item -LiteralPath $buildOutput -Destination $packagePath -Force
$hash = Get-ArtifactSha256 -Path $packagePath
Write-Output "Android debug APK: $packagePath"
Write-Output "SHA-256: $hash"
Write-Output 'This build uses the Android debug signing key and is for local validation only; it is not a production release.'

if ($Install) {
    if (!$adb) { throw 'ADB was not found. The APK is packaged; install Android platform-tools and set ANDROID_SDK_ROOT to use -Install.' }
    if (!$DeviceId) {
        $onlineDevices = @(& $adb.Source devices | Select-Object -Skip 1 | Where-Object { $_ -match '^\S+\s+device$' })
        if ($onlineDevices.Count -ne 1) { throw 'Connect exactly one ADB device or pass -DeviceId. The APK is packaged.' }
        $DeviceId = ($onlineDevices[0] -split '\s+')[0]
    }
    & $adb.Source -s $DeviceId install -r $packagePath
    if ($LASTEXITCODE -ne 0) { throw "ADB install failed for device '$DeviceId' with exit code $LASTEXITCODE" }
    & $adb.Source -s $DeviceId shell monkey -p dev.zerovault.zero_vault_probe 1
    if ($LASTEXITCODE -ne 0) { throw "The app installed but could not be launched on device '$DeviceId'." }
    Write-Output "Installed and launched on ADB device: $DeviceId"
}
