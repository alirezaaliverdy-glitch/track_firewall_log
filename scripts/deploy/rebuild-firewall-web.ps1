[CmdletBinding()]
param(
    [string]$ComposeFile = "docker-compose.firewall.yml",
    [string]$Service = "firewall-web",
    [string]$ContainerName = "firewall-web",
    [int]$HealthTimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE. The previous image was preserved."
    }
}

function Read-ContainerImage([string]$Name) {
    $value = & docker inspect --format "{{.Image}}" $Name 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return ($value | Select-Object -First 1).Trim()
}

function Read-Health([string]$Name) {
    $value = & docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $Name 2>$null
    if ($LASTEXITCODE -ne 0) { return "missing" }
    return ($value | Select-Object -First 1).Trim()
}

if (-not (Test-Path -LiteralPath $ComposeFile -PathType Leaf)) {
    throw "Compose file not found: $ComposeFile"
}

$previousImage = Read-ContainerImage $ContainerName
if ($previousImage) { Write-Host "Previous $Service image: $previousImage" }

& docker compose -f $ComposeFile build $Service
Assert-LastExitCode "Docker image build"

& docker compose -f $ComposeFile up -d --no-deps --force-recreate $Service
Assert-LastExitCode "Docker container recreate"

$deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
$health = Read-Health $ContainerName
while ($health -in @("created", "restarting", "starting") -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $health = Read-Health $ContainerName
}

if ($health -notin @("healthy", "running")) {
    throw "$ContainerName did not become healthy (state: $health). The previous image was preserved for recovery."
}

$currentImage = Read-ContainerImage $ContainerName
if (-not $currentImage) { throw "Could not resolve the running image for $ContainerName." }
Write-Host "Current $Service image: $currentImage ($health)"

if ($previousImage -and $previousImage -ne $currentImage) {
    $consumers = @(& docker ps -aq --filter "ancestor=$previousImage") | Where-Object { $_ -and $_.Trim() }
    Assert-LastExitCode "Docker image consumer check"
    if ($consumers.Count -eq 0) {
        $knownImages = @(& docker image ls --no-trunc --quiet) | Where-Object { $_ -and $_.Trim() }
        Assert-LastExitCode "Docker image inventory"
        if ($knownImages -contains $previousImage) {
            & docker image rm $previousImage
            Assert-LastExitCode "Previous project image cleanup"
            Write-Host "Removed previous $Service image: $previousImage"
        } else {
            Write-Host "Previous $Service image was already reclaimed by Docker: $previousImage"
        }
    } else {
        Write-Warning "Previous image is still used by container(s): $($consumers -join ', '). It was not removed."
    }
} else {
    Write-Host "No superseded $Service image needs removal."
}

Write-Host "Deployment complete. Only the superseded image used by this project was eligible for deletion."
