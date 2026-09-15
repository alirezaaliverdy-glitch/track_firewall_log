[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$failures = New-Object System.Collections.Generic.List[string]
$requiredFiles = @(
    "AGENTS.md",
    "CODEX_HANDOFF.md",
    "docs/PROJECT_MEMORY_INDEX.md",
    "docs/CURRENT_STATUS.md",
    "docs/TASK_HISTORY.md",
    "docs/ARCHITECTURE_MAP.md",
    "docs/CODEBASE_OVERVIEW.md",
    "docs/PERSIAN_COMMAND_CATALOG_PRODUCT.md"
)
$requiredHeadingHashes = @(
    "d7f025c4a5070b0ef0ae74d2ce764e51905b8836cbee03621a474dc52b4a6de1",
    "c37ef370a62402ff5014f67d663989a9e915d9834822ff8afa9e73b130b95f81",
    "4cf8a2a56368200b1513cc22c33191821dd6563a8cb437e6de10c4212c743340",
    "b9b0776cd5b327ddb945ef90af90e9b10dfc08d486f6b95c3132e34915f1cc9a",
    "37cf09962aea140f038e5a20ef3972dd1b7a6106a504e455dd0b8ee8555c102e",
    "da0777395693a295b607853a169fe88fd937566322624ce279d0c2b145cb5963",
    "46619b9c1ce789e9a29a2b1af8abd9e1d08d3dfb91ef2e993d01d8a130b50232"
)

Push-Location $root
try {
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $root $file) -PathType Leaf)) { $failures.Add("Missing required file: $file") }
    }

    $handoffPath = Join-Path $root "CODEX_HANDOFF.md"
    if (Test-Path -LiteralPath $handoffPath) {
        $actualHeadings = @([System.IO.File]::ReadAllLines($handoffPath, [System.Text.Encoding]::UTF8) | Where-Object { $_ -match '^#{1,2}\s' })
        if ($actualHeadings.Count -ne $requiredHeadingHashes.Count) {
            $failures.Add("CODEX_HANDOFF.md must contain exactly the required heading structure.")
        } else {
            $sha256 = [System.Security.Cryptography.SHA256]::Create()
            for ($index = 0; $index -lt $requiredHeadingHashes.Count; $index++) {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($actualHeadings[$index])
                $actualHash = ([System.BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
                if ($actualHash -cne $requiredHeadingHashes[$index]) { $failures.Add("Handoff heading $($index + 1) is missing, renamed, or out of order.") }
            }
            $sha256.Dispose()
        }
    }

    $sensitiveEnvPattern = '(^|/)(\.env|[^/]+\.env)$|(^|/)\.env\.(local|production|development)$'
    $stagedEnv = @(git diff --cached --name-only --diff-filter=ACMR | Where-Object { $_ -match $sensitiveEnvPattern })
    if ($stagedEnv.Count -gt 0) { $failures.Add("Staged .env file(s): " + ($stagedEnv -join ", ")) }

    if ($failures.Count -gt 0) {
        $failures | ForEach-Object { Write-Error $_ }
        exit 1
    }
    Write-Output "Project memory check passed: required files/headings exist and no .env file is staged."
} finally {
    Pop-Location
}
