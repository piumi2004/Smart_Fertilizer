# Copies Hayleys bag photos into public/fertilizer-products/ for the Vite app.
# Run from project root:  powershell -ExecutionPolicy Bypass -File scripts/copy-fertilizer-images.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dest = Join-Path $root 'public\fertilizer-products'
$cursorAssets = Join-Path $env:USERPROFILE '.cursor\projects\c-Users-user-Desktop-SMART-FERTILIZER-19-SMART-FERTILIZER-12-SMART-FERTILIZER-5-SMART-FERTILIZER\assets'

New-Item -ItemType Directory -Force -Path $dest | Out-Null

function Copy-IfMatch($pattern, $outName) {
  $hit = Get-ChildItem -LiteralPath $cursorAssets -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match $pattern } |
    Select-Object -First 1
  if (-not $hit) {
    Write-Warning "No file matching $pattern under $cursorAssets"
    return
  }
  $target = Join-Path $dest $outName
  $srcLong = if ($hit.FullName -match '^\\\\\?\\') { $hit.FullName } else { "\\?\$($hit.FullName)" }
  $dstLong = if ($target -match '^\\\\\?\\') { $target } else { "\\?\$($target)" }
  [System.IO.File]::Copy($srcLong, $dstLong, $true)
  Write-Host "OK $outName <= $($hit.Name)"
}

Copy-IfMatch 'image-49d3be94' 'urea.png'
Copy-IfMatch 'image-e1833c8c' 'tsp.png'
Copy-IfMatch 'image-13270755' 'mop.png'
Write-Host "Done. Files in: $dest"
