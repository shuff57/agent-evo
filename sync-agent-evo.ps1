# Cross-device sync for agent-evo: pull remote, then auto-commit + push local
# changes. Scheduled at-logon + hourly. Safe on conflict. ASCII-only for PS 5.1.
#
# The llmwiki wiki CANNOT be a symlink into this repo: llmwiki rejects writes
# that resolve outside its workspace (path-escape guard). So the wiki lives as a
# REAL dir in the workspace and is mirror-copied in/out of the repo here.

$ErrorActionPreference = "Continue"
$repo  = $PSScriptRoot
$log   = Join-Path $env:TEMP "agent-evo-sync.log"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Live wiki dir in the llmwiki workspace (per-device; skipped if absent).
$wikiSrc  = "C:\Users\shuff57\research\wiki"
$wikiRepo = Join-Path $repo "llmwiki\wiki"

function Log($m) { "$stamp  $m" | Out-File -FilePath $log -Append -Encoding utf8 }

function Mirror($from, $to) {
    if (-not (Test-Path $from)) { return }
    New-Item -ItemType Directory -Force -Path $to | Out-Null
    robocopy $from $to /MIR /NFL /NDL /NJH /NJS /NP *>> $log
    if ($LASTEXITCODE -ge 8) { Log "robocopy '$from' -> '$to' error ($LASTEXITCODE)" }
    $global:LASTEXITCODE = 0   # robocopy 0-7 are success; don't leak to git checks
}

Set-Location $repo

# 1. Capture local wiki changes into the repo working tree.
Mirror $wikiSrc $wikiRepo

# 2. Commit local changes.
if (git status --porcelain) {
    git add -A *>> $log
    git commit -m "auto-sync: $env:COMPUTERNAME $stamp" *>> $log
    Log "committed local changes"
} else {
    Log "nothing local to commit"
}

# 3. Pull remote (rebase local on top; stash anything dirty).
git pull --rebase --autostash origin master *>> $log
if ($LASTEXITCODE -ne 0) {
    Log "PULL FAILED (likely conflict) - aborting rebase, skipping push. Resolve manually."
    git rebase --abort *>> $log 2>&1
    exit 1
}

# 4. Bring the merged wiki back into the workspace (only if llmwiki is set up here).
if (Test-Path (Split-Path $wikiSrc)) { Mirror $wikiRepo $wikiSrc }

# 5. Push.
git push origin master *>> $log
if ($LASTEXITCODE -ne 0) { Log "PUSH FAILED - check auth/network" } else { Log "sync ok" }

if (Test-Path $log) {
    Set-Content -Path $log -Value (Get-Content $log -Tail 500) -Encoding utf8
}
