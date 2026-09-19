param(
  [int]$Port = 8787,
  [string]$BindAddress = "0.0.0.0",
  [string]$AdvertiseHost = "host.docker.internal",
  [switch]$Restart
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot ".runtime"
$envFile = Join-Path $runtimeDir "openrouter-proxy.env"
$stdoutFile = Join-Path $runtimeDir "openrouter-host-proxy.out.log"
$stderrFile = Join-Path $runtimeDir "openrouter-host-proxy.err.log"

function Get-ProxyProcesses {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'scripts[\\/]openrouter-host-proxy\.mjs'
  })
}

if ($Restart) {
  foreach ($proxyProcess in Get-ProxyProcesses) {
    Stop-Process -Id $proxyProcess.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 500
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$existingListeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($existingListeners.Count -gt 0) {
  $proxyProcessIds = @(Get-ProxyProcesses | ForEach-Object { [int]$_.ProcessId })
  $foreignListener = $existingListeners | Where-Object { [int]$_.OwningProcess -notin $proxyProcessIds } | Select-Object -First 1
  if ($foreignListener) {
    throw "Port $Port is already used by a different process."
  }
  if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "The proxy is listening but its ignored runtime configuration is missing. Restart it with -Restart."
  }
  Write-Output "OpenRouter host proxy is already listening."
  exit 0
}

$token = $null
if (Test-Path -LiteralPath $envFile -PathType Leaf) {
  $proxyLine = Get-Content -LiteralPath $envFile -Encoding UTF8 | Where-Object { $_ -like "OPENAI_PROXY_URL=*" } | Select-Object -First 1
  if ($proxyLine) {
    try {
      $existingUri = [Uri]$proxyLine.Substring("OPENAI_PROXY_URL=".Length)
      $encodedPassword = ($existingUri.UserInfo -split ":", 2)[1]
      $candidate = [Uri]::UnescapeDataString($encodedPassword)
      if ($candidate.Length -ge 32) { $token = $candidate }
    } catch {
      $token = $null
    }
  }
}
if (-not $token) {
  $tokenBytes = [byte[]]::new(32)
  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $random.GetBytes($tokenBytes)
  } finally {
    $random.Dispose()
  }
  $token = ([BitConverter]::ToString($tokenBytes) -replace "-", "").ToLowerInvariant()
}

$escapedToken = [Uri]::EscapeDataString($token)
$proxyUrl = "http://firewall:${escapedToken}@${AdvertiseHost}:$Port"
[IO.File]::WriteAllText($envFile, "OPENAI_PROXY_URL=$proxyUrl`n", [Text.UTF8Encoding]::new($false))

$previousHost = $env:OPENROUTER_PROXY_HOST
$previousPort = $env:OPENROUTER_PROXY_PORT
$previousToken = $env:OPENROUTER_PROXY_TOKEN
try {
  $env:OPENROUTER_PROXY_HOST = $BindAddress
  $env:OPENROUTER_PROXY_PORT = [string]$Port
  $env:OPENROUTER_PROXY_TOKEN = $token
  $nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
  $process = Start-Process -FilePath $nodeExecutable -ArgumentList @("scripts/openrouter-host-proxy.mjs") `
    -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile -PassThru
} finally {
  $env:OPENROUTER_PROXY_HOST = $previousHost
  $env:OPENROUTER_PROXY_PORT = $previousPort
  $env:OPENROUTER_PROXY_TOKEN = $previousToken
}

for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 250
  $proxyProcessIds = @(Get-ProxyProcesses | ForEach-Object { [int]$_.ProcessId })
  $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Where-Object { [int]$_.OwningProcess -in $proxyProcessIds } | Select-Object -First 1
  if ($listening) { break }
}
if (-not $listening) {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  throw "OpenRouter host proxy failed to start. See the ignored runtime logs."
}

Write-Output "OpenRouter host proxy started for Docker."
Write-Output "Process ID: $($listening.OwningProcess)"
