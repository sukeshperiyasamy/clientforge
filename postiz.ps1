param([ValidateSet('start','stop','status','logs')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$dockerBin = 'C:\Program Files\Docker\Docker\resources\bin'
if (Test-Path -LiteralPath $dockerBin) { $env:PATH = "$dockerBin;$env:PATH" }
$composePath = Join-Path $PSScriptRoot 'data\postiz\docker-compose.yaml'
if (!(Test-Path -LiteralPath $composePath)) { throw 'Run node scripts/prepare-postiz.mjs first.' }
switch ($Action) {
  'start' { & docker compose --project-name clientforge-postiz -f $composePath up -d }
  'stop' { & docker compose --project-name clientforge-postiz -f $composePath stop }
  'status' { & docker compose --project-name clientforge-postiz -f $composePath ps }
  'logs' { & docker compose --project-name clientforge-postiz -f $composePath logs --tail 100 postiz }
}
