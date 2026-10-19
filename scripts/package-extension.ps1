param(
    [switch]$Install
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'support/Get-ArtifactSha256.ps1')
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$extensionRoot = Join-Path $repositoryRoot 'apps/extension'
$extensionOutput = Join-Path $extensionRoot '.output/chrome-mv3'
$packageDirectory = Join-Path $repositoryRoot 'dist/extension'
$archivePath = Join-Path $packageDirectory 'zero-vault-p1-chrome.zip'

Push-Location $repositoryRoot
try {
    & pnpm --dir $extensionRoot build
    if ($LASTEXITCODE -ne 0) { throw "Extension build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$manifestPath = Join-Path $extensionOutput 'manifest.json'
if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Build output is missing: $manifestPath" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.manifest_version -ne 3 -or !$manifest.name -or !$manifest.version) {
    throw 'The generated extension manifest is invalid.'
}

New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Compress-Archive -Path (Join-Path $extensionOutput '*') -DestinationPath $archivePath -CompressionLevel Optimal
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    if (!($archive.Entries | Where-Object { $_.FullName -eq 'manifest.json' })) {
        throw 'The extension ZIP does not contain a root manifest.json.'
    }
} finally {
    $archive.Dispose()
}

$hash = Get-ArtifactSha256 -Path $archivePath
Write-Output "Extension package: $archivePath"
Write-Output "SHA-256: $hash"
Write-Output 'For Chrome Web Store submission, upload this ZIP. Local installation uses the isolated development profile below.'

if ($Install) {
    $chromeCandidates = @(
        (Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google/Chrome/Application/chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google/Chrome/Application/chrome.exe')
    )
    $chromeCandidates = @($chromeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) })
    if (!$chromeCandidates) { throw 'Chrome was not found. The ZIP package is still available.' }

    $profileName = 'chrome-development-profile-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
    $profilePath = Join-Path $repositoryRoot ('dist/' + $profileName)
    New-Item -ItemType Directory -Path $profilePath -Force | Out-Null
    $previousRepositoryRoot = $env:ZV_REPOSITORY_ROOT
    $previousChromeProfilePath = $env:ZV_CHROME_PROFILE_PATH
    $env:ZV_REPOSITORY_ROOT = $repositoryRoot
    $env:ZV_CHROME_PROFILE_PATH = $profilePath
    Push-Location $repositoryRoot
    try {
        & pnpm exec tsx scripts/install-extension.ts
        if ($LASTEXITCODE -ne 0) { throw "Local Chrome installation failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
        if ($null -eq $previousRepositoryRoot) {
            Remove-Item Env:ZV_REPOSITORY_ROOT -ErrorAction SilentlyContinue
        } else {
            $env:ZV_REPOSITORY_ROOT = $previousRepositoryRoot
        }
        if ($null -eq $previousChromeProfilePath) {
            Remove-Item Env:ZV_CHROME_PROFILE_PATH -ErrorAction SilentlyContinue
        } else {
            $env:ZV_CHROME_PROFILE_PATH = $previousChromeProfilePath
        }
    }
    Write-Output 'Installed in a separate development profile; the regular Chrome profile was not modified.'
}
