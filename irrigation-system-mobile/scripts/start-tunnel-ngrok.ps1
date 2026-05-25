# Start Expo with your own ngrok tunnel (use when LAN is blocked, e.g. corporate/domain WiFi).
# Prerequisites:
#   1. ngrok installed: winget install ngrok.ngrok
#   2. Authtoken configured: ngrok config add-authtoken YOUR_TOKEN
#
# Usage (from irrigation-system-mobile):
#   .\scripts\start-tunnel-ngrok.ps1

$ErrorActionPreference = "Stop"
$Port = 8081
$ProjectRoot = Split-Path $PSScriptRoot -Parent

if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
  Write-Host "ngrok not found. Install: winget install ngrok.ngrok"
  Write-Host "Then: ngrok config add-authtoken YOUR_TOKEN  (from https://dashboard.ngrok.com/get-started/your-authtoken)"
  exit 1
}

Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Starting ngrok on port $Port..."
$ngrokJob = Start-Process -FilePath "ngrok" -ArgumentList "http", $Port, "--host-header=localhost" -PassThru -WindowStyle Minimized

Start-Sleep -Seconds 3

$tunnelUrl = $null
for ($i = 0; $i - 20; $i++) {
  try {
    $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
    $tunnelUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
    if ($tunnelUrl) { break }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $tunnelUrl) {
  Write-Host "Could not read ngrok URL. Is authtoken configured?"
  Write-Host "Run: ngrok config add-authtoken YOUR_TOKEN"
  Stop-Process -Id $ngrokJob.Id -Force -ErrorAction SilentlyContinue
  exit 1
}

Write-Host ""
Write-Host "Ngrok tunnel: $tunnelUrl"
Write-Host "Starting Expo (LAN + packager proxy)..."
Write-Host "In Expo Go, scan QR or use URL from terminal."
Write-Host "Press Ctrl+C to stop (then close ngrok if needed)."
Write-Host ""

$env:EXPO_PACKAGER_PROXY_URL = $tunnelUrl
Set-Location $ProjectRoot
npx expo start -c --lan

Stop-Process -Id $ngrokJob.Id -Force -ErrorAction SilentlyContinue
