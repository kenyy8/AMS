# PowerShell script to download required external assets for offline use
# Places files in docs/assets/ and frontend/public/assets/fontawesome/

$ErrorActionPreference = 'Stop'

$basePath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path "$basePath\.."

# Ensure target dirs exist
$mermaidDir = Join-Path $repoRoot "docs\assets"
$faDir = Join-Path $repoRoot "frontend\public\assets\fontawesome"
New-Item -ItemType Directory -Force -Path $mermaidDir | Out-Null
New-Item -ItemType Directory -Force -Path $faDir | Out-Null

Write-Host "Downloading mermaid..."
$mermaidUrl = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'
$mermaidDest = Join-Path $mermaidDir 'mermaid.min.js'
Invoke-WebRequest -Uri $mermaidUrl -OutFile $mermaidDest
Write-Host "Saved mermaid to $mermaidDest"

Write-Host "Downloading Font Awesome (free) CSS and webfonts..."
# Use Font Awesome 6.5.1 (same as previously referenced)
$faVersion = '6.5.1'
$faZipUrl = "https://use.fontawesome.com/releases/v$faVersion/fontawesome-free-$faVersion-web.zip"
$faZip = Join-Path $faDir "fontawesome-$faVersion.zip"
Invoke-WebRequest -Uri $faZipUrl -OutFile $faZip
Write-Host "Downloaded zip to $faZip"

# Extract zip (requires Expand-Archive available on Windows)
Expand-Archive -LiteralPath $faZip -DestinationPath $faDir -Force
Remove-Item $faZip
Write-Host "Extracted Font Awesome to $faDir"

Write-Host "Vendor assets downloaded. Update references in the project if needed."

# End of script
