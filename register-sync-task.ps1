# Registers the "Agent-Evo Sync" scheduled task on this Windows device.
# Run once per machine (after `git pull` + `bash install.sh`). Path-relative,
# so it targets whichever copy of the repo this script lives in.

$taskName = "Agent-Evo Sync"
$ps1 = Join-Path $PSScriptRoot "sync-agent-evo.ps1"

try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop } catch {}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ps1`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$rep = (New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(31) `
  -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition
$trigger.Repetition = $rep

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Cross-device sync for agent-evo: pull remote, then auto-commit + push local changes. At-logon + hourly." | Out-Null

Write-Host "Registered '$taskName'. Runs at logon + hourly. Log: `$env:TEMP\agent-evo-sync.log"
