$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$projectNode = Join-Path $PSScriptRoot '.tools\node-v24.11.1-win-x64\node.exe'
if (!(Test-Path -LiteralPath $projectNode)) { $projectNode = (Get-Command node -ErrorAction Stop).Source }
& $projectNode --import tsx (Join-Path $PSScriptRoot 'scripts\launch-browser.ts')
if ($LASTEXITCODE -ne 0) { throw 'FreelanceGrowth Browser did not start. Open the dashboard and check the local browser log.' }
