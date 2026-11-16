$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$portableNode = Join-Path $PSScriptRoot '.tools\node-v24.11.1-win-x64'
if (Test-Path -LiteralPath (Join-Path $portableNode 'node.exe')) { $env:PATH = "$portableNode;$env:PATH" }
if (!(Test-Path -LiteralPath 'node_modules')) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' } }
if (!(Test-Path -LiteralPath 'dist\index.html')) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Build failed.' } }
& npm.cmd start
