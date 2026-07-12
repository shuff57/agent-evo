# Cross-device sync for agent-evo: pull remote first, then auto-commit + push
# local changes. Scheduled at-logon + hourly. Safe on conflict (aborts rebase,
# leaves working tree intact, skips push). ASCII-only for PowerShell 5.1.
#
# Repo path is derived from this script's location, so it works on any device.

$ErrorActionPreference = "Continue"
$repo = $PSScriptRoot
$log  = Join-Path $env:TEMP "agent-evo-sync.log"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Log($m) { "$stamp  $m" | Out-File -FilePath $log -Append -Encoding utf8 }

Set-Location $repo

# 1. Pull remote changes first (rebase local commits on top; stash dirty files).
git pull --rebase --autostash origin master *>> $log
if ($LASTEXITCODE -ne 0) {
    Log "PULL FAILED (likely conflict) - aborting rebase, skipping push. Resolve manually."
    git rebase --abort *>> $log 2>&1
    exit 1
}

# 2. Commit any local changes.
$dirty = git status --porcelain
if ($dirty) {
    git add -A *>> $log
    git commit -m "auto-sync: $env:COMPUTERNAME $stamp" *>> $log
    Log "committed local changes"
} else {
    Log "nothing local to commit"
}

# 3. Push (no-op if already up to date).
git push origin master *>> $log
if ($LASTEXITCODE -ne 0) { Log "PUSH FAILED - check auth/network" } else { Log "sync ok" }

# Trim log to last 500 lines.
if (Test-Path $log) {
    $tail = Get-Content $log -Tail 500
    Set-Content -Path $log -Value $tail -Encoding utf8
}
