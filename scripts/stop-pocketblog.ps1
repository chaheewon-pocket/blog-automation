# PocketBlog Insight 종료 스크립트
# - dev 서버 (포트 3000)
# - 스케줄러 데몬 (node-cron)
# - Cloudflare Tunnel (cloudflared)

$ErrorActionPreference = "Continue"

# 1) 포트 3000 사용 프로세스 종료
$port3000 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($port3000) {
  Write-Host "🛑 dev 서버 종료 (PID $($port3000.OwningProcess))"
  Stop-Process -Id $port3000.OwningProcess -Force
} else {
  Write-Host "⚪ dev 서버 실행 중 아님"
}

# 2) 스케줄러 — npm run scheduler가 띄운 node 프로세스 (CommandLine 기반 검색)
$schedulerProcs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue `
  | Where-Object { $_.CommandLine -like "*scheduler*" }
if ($schedulerProcs) {
  foreach ($proc in $schedulerProcs) {
    Write-Host "🛑 스케줄러 종료 (PID $($proc.ProcessId))"
    Stop-Process -Id $proc.ProcessId -Force
  }
} else {
  Write-Host "⚪ 스케줄러 실행 중 아님"
}

# 3) Cloudflare Tunnel
$tunnelProcs = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if ($tunnelProcs) {
  foreach ($proc in $tunnelProcs) {
    Write-Host "🛑 Cloudflare Tunnel 종료 (PID $($proc.Id))"
    Stop-Process -Id $proc.Id -Force
  }
} else {
  Write-Host "⚪ Cloudflare Tunnel 실행 중 아님"
}

Write-Host ""
Write-Host "✅ 종료 완료"
