[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Push-Location $repositoryRoot
try {
    Write-Output "Firewall Log Analyzer / AI Security Orchestrator"
    Write-Output "Snapshot: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
    Write-Output "Root: $repositoryRoot"
    Write-Output ""

    Write-Output "== Git =="
    $branch = git branch --show-current
    Write-Output "Branch: $branch"
    $status = @(git status --short)
    if ($status.Count -eq 0) {
        Write-Output "Working tree: clean"
    } else {
        Write-Output "Working tree changes: $($status.Count)"
        $status | ForEach-Object { Write-Output $_ }
    }
    Write-Output ""

    Write-Output "== Project Memory =="
    @(
        "AGENTS.md",
        "docs/CURRENT_STATUS.md",
        "docs/TASK_HISTORY.md",
        "docs/ARCHITECTURE_MAP.md"
    ) | ForEach-Object {
        Write-Output "$(if (Test-Path -LiteralPath $_) { '[ok]' } else { '[missing]' }) $_"
    }
    Write-Output ""

    Write-Output "== Protected Lab Settings =="
    $protectedNames = @("ACTION_EXECUTION_MODE", "ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT")
    $envFile = Join-Path $repositoryRoot "backend/.env"
    foreach ($name in $protectedNames) {
        $match = if (Test-Path -LiteralPath $envFile) {
            Select-String -LiteralPath $envFile -Pattern "^$name=" | Select-Object -First 1
        }
        Write-Output "${name}=$(if ($match) { $match.Line.Split('=', 2)[1] } else { '<not set in backend/.env>' })"
    }
    Write-Output ""

    Write-Output "== Repository Shape =="
    $trackedFiles = @(git ls-files)
    Write-Output "Tracked files: $($trackedFiles.Count)"
    foreach ($area in @("backend/src", "backend/test", "src", "docs")) {
        $count = @($trackedFiles | Where-Object { $_ -like "$area/*" }).Count
        Write-Output "${area}: $count files"
    }
    Write-Output ""

    Write-Output "== Validation Commands =="
    Write-Output "Backend: cd backend; npm run build; npm test"
    Write-Output "Frontend: pnpm build"
} finally {
    Pop-Location
}
