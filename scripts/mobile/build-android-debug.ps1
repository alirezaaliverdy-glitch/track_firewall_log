param(
    [string]$ArtifactDirectory = "artifacts"
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$artifactRoot = Join-Path $projectRoot $ArtifactDirectory
$apkName = "Firewall-SOAR-Android-1.0.2-debug.apk"
$apkSource = Join-Path $projectRoot "android\app\build\outputs\apk\debug\app-debug.apk"
$apkTarget = Join-Path $artifactRoot $apkName
$googleMirrorInit = Join-Path $projectRoot "scripts\mobile\google-cdn.init.gradle"

if (-not $env:ANDROID_HOME) {
    $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path -LiteralPath $defaultSdk) {
        $env:ANDROID_HOME = $defaultSdk
    }
}

if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath $env:ANDROID_HOME)) {
    throw "Android SDK was not found. Install Android Studio SDK 36 or set ANDROID_HOME."
}

$env:VITE_APP_ENV = "development"
$env:VITE_BASE_PATH = "/"
$env:VITE_API_BASE_URL = "/firewall-api"
$env:VITE_MOBILE_ALLOW_HTTP = "true"
$env:CAPACITOR_ALLOW_CLEARTEXT = "true"

Push-Location $projectRoot
try {
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
    pnpm exec cap sync android
    if ($LASTEXITCODE -ne 0) { throw "Capacitor sync failed." }

    Push-Location (Join-Path $projectRoot "android")
    try {
        .\gradlew.bat --init-script $googleMirrorInit clean verifyRootSdkVariables test assembleDebug
        if ($LASTEXITCODE -ne 0) { throw "Android build failed." }
    } finally {
        Pop-Location
    }

    New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
    Copy-Item -LiteralPath $apkSource -Destination $apkTarget -Force
    $hash = (Get-FileHash -LiteralPath $apkTarget -Algorithm SHA256).Hash
    Write-Host "APK: $apkTarget"
    Write-Host "SHA256: $hash"
} finally {
    Pop-Location
}
