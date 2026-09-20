param(
  [string]$ComposeFile = "docker-compose.firewall.yml",
  [string]$ProjectName = "track_firewall_log"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $root
try {
  $compose = @("--project-name", $ProjectName, "-f", $ComposeFile)
  $version = (& git rev-parse --short HEAD).Trim()
  if (-not $version) { $version = "local-dev" }

  Write-Host "Building local images at revision $version..."
  & docker compose @compose build firewall-web firewall-api
  if ($LASTEXITCODE -ne 0) { throw "Docker image build failed." }

  & docker compose @compose up -d --force-recreate firewall-db firewall-api firewall-web main-nginx
  if ($LASTEXITCODE -ne 0) { throw "Docker compose startup failed." }

  $deadline = (Get-Date).AddMinutes(3)
  do {
    $healthStates = @(docker compose @compose ps --format '{{.Health}}' | Where-Object { $_.Trim() })
    $healthy = $healthStates.Count -ge 4 -and @($healthStates | Where-Object { $_.Trim() -eq "healthy" }).Count -ge 4
    if ($healthy) { break }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)

  if (-not $healthy) { throw "Containers did not become healthy before the timeout." }
  $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1/firewall/" -TimeoutSec 20
  if ([int]$response.StatusCode -ne 200) { throw "Local web endpoint returned HTTP $($response.StatusCode)." }
  Write-Host "Local deployment is healthy: http://127.0.0.1/firewall/"
} finally {
  Pop-Location
}
