# Install Yatishara Studio .studio filetype icon (Windows).
# Run once from this folder (user scope, no admin required).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dest = Join-Path $env:LOCALAPPDATA "YatisharaStudio\filetype"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Force (Join-Path $Root "yatishara-studio.ico") (Join-Path $Dest "yatishara-studio.ico")
$Ico = Join-Path $Dest "yatishara-studio.ico"
$IcoEscaped = $Ico.Replace("\", "\\")

$reg = @"
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Classes\.studio]
@="YatisharaStudio.Project"
"Content Type"="application/vnd.yatishara.studio"
"PerceivedType"="document"

[HKEY_CURRENT_USER\Software\Classes\YatisharaStudio.Project]
@="Yatishara Studio Project"

[HKEY_CURRENT_USER\Software\Classes\YatisharaStudio.Project\DefaultIcon]
@="$IcoEscaped,0"
"@

$regPath = Join-Path $env:TEMP "yatishara-studio-filetype.reg"
Set-Content -Path $regPath -Value $reg -Encoding ASCII
reg.exe import $regPath | Out-Null
Remove-Item $regPath -Force
Write-Host "Installed .studio icon association. Restart Explorer if icons are stale:"
Write-Host "  taskkill /f /im explorer.exe & start explorer.exe"
