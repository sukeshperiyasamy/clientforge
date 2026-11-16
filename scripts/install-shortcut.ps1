$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'FreelanceGrowth Browser.lnk'
if (Test-Path -LiteralPath $shortcutPath) {
    $existing = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
    if ($existing.Arguments -notlike "*$projectRoot*") { throw 'A different shortcut already uses this name. It was not overwritten.' }
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -File "' + (Join-Path $projectRoot 'launch-browser.ps1') + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'Open the isolated, persistent FreelanceGrowth project browser'
$chromeIcon = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (Test-Path -LiteralPath $chromeIcon) { $shortcut.IconLocation = $chromeIcon + ',0' }
$shortcut.Save()
Write-Output "Created desktop shortcut: $shortcutPath"
