[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 80,
  [string]$AppPath = "/firewall/"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  Write-Host "Administrator approval is required once to allow phone access on the local network."
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`"",
    "-Port", $Port,
    "-AppPath", "`"$AppPath`""
  )
  $process = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  exit $process.ExitCode
}

$ruleName = "Firewall SOAR LAN HTTP"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
  $existingRule | Remove-NetFirewallRule
}

New-NetFirewallRule `
  -DisplayName $ruleName `
  -Group "Firewall SOAR" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -RemoteAddress LocalSubnet `
  -Profile Private,Public | Out-Null

$defaultRoute = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop |
  Where-Object { $_.State -eq "Alive" } |
  Sort-Object RouteMetric, InterfaceMetric |
  Select-Object -First 1

if (-not $defaultRoute) {
  throw "No active IPv4 default route was found. Connect this computer and the phone to the same network first."
}

$address = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $defaultRoute.InterfaceIndex -ErrorAction Stop |
  Where-Object { -not $_.SkipAsSource -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1 -ExpandProperty IPAddress

if (-not $address) {
  throw "No usable IPv4 address was found on the active network adapter."
}

if (-not $AppPath.StartsWith("/")) { $AppPath = "/$AppPath" }
if (-not $AppPath.EndsWith("/")) { $AppPath = "$AppPath/" }
$portSuffix = if ($Port -eq 80) { "" } else { ":$Port" }
$url = "http://${address}${portSuffix}${AppPath}"
$response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
if ($response.StatusCode -ne 200) {
  throw "The application did not return HTTP 200 at $url."
}

Write-Host "Windows Firewall rule is ready: $ruleName" -ForegroundColor Green
Write-Host "Open this address on a phone connected to the same network:" -ForegroundColor Cyan
Write-Host $url -ForegroundColor White
