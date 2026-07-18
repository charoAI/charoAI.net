# NETFALL — creates a desktop icon that opens the game in its own window.
# Run: right-click this file -> "Run with PowerShell"
# (If scripts are blocked:  powershell -ExecutionPolicy Bypass -File NETFALL-windows.ps1)

$Url = "https://charoai.net/netfall/"   # for local play: http://localhost:8137/netfall/

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Icon = Join-Path $Here "..\assets\icon.ico"

$Browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$Browser = $Browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Browser) {
  Write-Host "Couldn't find Chrome or Edge. Install one, or just bookmark $Url"
  exit 1
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$Shell = New-Object -ComObject WScript.Shell
$Lnk = $Shell.CreateShortcut((Join-Path $Desktop "NETFALL.lnk"))
$Lnk.TargetPath = $Browser
$Lnk.Arguments = "--app=$Url"
$Lnk.Description = "NETFALL — learn Python by looting the dead internet"
if (Test-Path $Icon) { $Lnk.IconLocation = (Resolve-Path $Icon).Path }
$Lnk.Save()

Write-Host "Done — there's a NETFALL icon on your desktop now."
