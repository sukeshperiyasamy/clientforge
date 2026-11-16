param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$taskName = 'FreelanceGrowth Local Dashboard'
if ($Remove) { Unregister-ScheduledTask -TaskName $taskName -Confirm; exit }
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = Join-Path $projectRoot '.tools\node-v24.11.1-win-x64\node.exe'
if (!(Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Command node -ErrorAction Stop).Source }
$taskAction = New-ScheduledTaskAction -Execute $nodePath -Argument '--import tsx server/index.ts --production' -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Description 'Start the private local dashboard and approved-content worker at user logon. No administrator privileges or stored Windows password.' -Force | Select-Object TaskName,State
