# Claude Code statusline installer (Windows / PowerShell)
# Copies statusline.js into ~/.claude/ and patches settings.json to use it.
# Usage:  powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = 'Stop'

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$source       = Join-Path $scriptDir 'statusline.js'
$claudeDir    = Join-Path $env:USERPROFILE '.claude'
$dest         = Join-Path $claudeDir 'statusline.js'
$settingsPath = Join-Path $claudeDir 'settings.json'

if (-not (Test-Path $source)) {
    Write-Error "statusline.js not found next to this installer ($source)."
}

# 1. Ensure ~/.claude exists, copy the script
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir | Out-Null
}
Copy-Item -Path $source -Destination $dest -Force
Write-Host "Copied statusline.js -> $dest" -ForegroundColor Green

# 2. Locate node.exe
$node = $null
$cmd  = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $node = $cmd.Source }
if (-not $node) {
    foreach ($p in @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )) {
        if (Test-Path $p) { $node = $p; break }
    }
}
if (-not $node) {
    Write-Error "Could not find node.exe. Install Node.js (https://nodejs.org) and re-run."
}
Write-Host "Using node: $node" -ForegroundColor Green

# 3. Build the statusLine command (full path to node + full path to script)
$command = '"' + $node + '" "' + $dest + '"'

# 4. Load or create settings.json, set statusLine, preserve everything else
if (Test-Path $settingsPath) {
    $json = Get-Content -Raw -Path $settingsPath
    try   { $settings = $json | ConvertFrom-Json }
    catch { Write-Error "Existing settings.json is not valid JSON. Fix or remove it, then re-run." }
} else {
    $settings = [PSCustomObject]@{}
}

$statusLine = [PSCustomObject]@{ type = 'command'; command = $command }
if ($settings.PSObject.Properties.Name -contains 'statusLine') {
    $settings.statusLine = $statusLine
} else {
    $settings | Add-Member -NotePropertyName 'statusLine' -NotePropertyValue $statusLine
}

# Backup then write
if (Test-Path $settingsPath) {
    Copy-Item $settingsPath "$settingsPath.bak" -Force
    Write-Host "Backed up existing settings -> $settingsPath.bak" -ForegroundColor DarkGray
}
$settings | ConvertTo-Json -Depth 100 | Set-Content -Path $settingsPath -Encoding utf8
Write-Host "Patched statusLine in $settingsPath" -ForegroundColor Green

Write-Host ""
Write-Host "Done. Restart Claude Code (or open a new session) to see the status line." -ForegroundColor Cyan
