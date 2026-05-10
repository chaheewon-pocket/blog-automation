# PocketBlog Insight 시작 스크립트
# - dev 서버 (localhost:3000)
# - 스케줄러 데몬 (node-cron 잡들)
# - Cloudflare Quick Tunnel (외부 접근 — 설치되어 있으면)
# 백그라운드로 실행, 로그는 data\logs\ 에 저장

param([switch]$Force)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir

$LogDir = Join-Path $ProjectDir "data\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Date = Get-Date -Format "yyyyMMdd-HHmm"

# ── 1) dev 서버 ───────────────────────────────────────────
$port3000 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($port3000) {
  if ($Force) {
    Write-Host "🔁 포트 3000 점유 중 — 종료 후 재시작 (PID $($port3000.OwningProcess))"
    Stop-Process -Id $port3000.OwningProcess -Force
    Start-Sleep -Seconds 2
    $port3000 = $null
  } else {
    Write-Host "✅ dev 서버 이미 실행 중 (PID $($port3000.OwningProcess), localhost:3000)"
  }
}
if (-not $port3000) {
  $devLog = Join-Path $LogDir "dev-$Date.log"
  Write-Host "🚀 dev 서버 시작 중..."
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c npm run dev > `"$devLog`" 2>&1" `
    -WorkingDirectory $ProjectDir `
    -WindowStyle Hidden
  Start-Sleep -Seconds 3
  Write-Host "   → 로그: $devLog"
}

# ── 2) 스케줄러 데몬 ──────────────────────────────────────
$schedulerProcs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue `
  | Where-Object { $_.CommandLine -like "*scheduler*" }
if ($schedulerProcs -and -not $Force) {
  Write-Host "✅ 스케줄러 이미 실행 중 (PID $($schedulerProcs.ProcessId -join ','))"
} else {
  if ($schedulerProcs -and $Force) {
    Write-Host "🔁 기존 스케줄러 종료"
    foreach ($p in $schedulerProcs) { Stop-Process -Id $p.ProcessId -Force }
    Start-Sleep -Seconds 2
  }
  $schedulerLog = Join-Path $LogDir "scheduler-$Date.log"
  Write-Host "🚀 스케줄러 데몬 시작 중..."
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c npm run scheduler > `"$schedulerLog`" 2>&1" `
    -WorkingDirectory $ProjectDir `
    -WindowStyle Hidden
  Write-Host "   → 로그: $schedulerLog"
}

# ── 3) Cloudflare Quick Tunnel (선택, cloudflared 설치 시만) ─────
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  Write-Host ""
  Write-Host "⚪ cloudflared 미설치 — 외부 접근 비활성. 설치하려면:"
  Write-Host "   winget install --id Cloudflare.cloudflared"
} else {
  $existingTunnel = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
  if ($existingTunnel -and -not $Force) {
    Write-Host "✅ Cloudflare Tunnel 이미 실행 중 (PID $($existingTunnel.Id -join ','))"
    $urlFile = Join-Path $ProjectDir "data\tunnel-url.txt"
    if (Test-Path $urlFile) {
      $existingUrl = Get-Content $urlFile -Raw
      Write-Host "   현재 URL: $existingUrl"
    }
  } else {
    if ($existingTunnel -and $Force) {
      Write-Host "🔁 기존 cloudflared 종료"
      $existingTunnel | Stop-Process -Force
      Start-Sleep -Seconds 2
    }
    $tunnelLog = Join-Path $LogDir "tunnel-$Date.log"
    $urlFile = Join-Path $ProjectDir "data\tunnel-url.txt"
    Write-Host "🌐 Cloudflare Tunnel 시작 중... (Quick Tunnel, URL은 매번 변경)"
    Start-Process -FilePath "cloudflared" `
      -ArgumentList "tunnel --url http://localhost:3000 --logfile `"$tunnelLog`"" `
      -WorkingDirectory $ProjectDir `
      -WindowStyle Hidden

    # URL 추출 — 최대 30초 대기
    $url = $null
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 1
      if (Test-Path $tunnelLog) {
        $logContent = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
        if ($logContent -and ($logContent -match "https://[a-z0-9-]+\.trycloudflare\.com")) {
          $url = $matches[0]
          break
        }
      }
    }

    if ($url) {
      $url | Out-File -FilePath $urlFile -Encoding UTF8 -NoNewline
      Write-Host "   ✅ Tunnel URL: $url"
      Write-Host "   📋 클립보드 복사 + 파일 저장: $urlFile"
      try { Set-Clipboard -Value $url } catch {}
    } else {
      Write-Host "   ⚠️ Tunnel URL 못 찾음. 로그 확인: $tunnelLog"
    }
  }
}

Write-Host ""
Write-Host "✅ PocketBlog Insight 시작됨"
Write-Host "   브라우저: http://localhost:3000"
$urlFile = Join-Path $ProjectDir "data\tunnel-url.txt"
if (Test-Path $urlFile) {
  $savedUrl = Get-Content $urlFile -Raw -ErrorAction SilentlyContinue
  if ($savedUrl) { Write-Host "   외부 접근: $savedUrl" }
}
Write-Host "   종료하려면: scripts\stop-pocketblog.ps1"
