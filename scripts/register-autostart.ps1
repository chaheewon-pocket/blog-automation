﻿# Windows 작업 스케줄러에 PocketBlog Insight 자동 시작 등록
# - 트리거: 사용자 로그인 시
# - 액션: start-pocketblog.ps1 실행 (Hidden)
#
# 한 번만 실행하면 됨. 해제 명령은 스크립트 마지막 안내 참고.

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $ProjectDir "scripts\start-pocketblog.ps1"
$TaskName = "PocketBlog Insight Auto Start"

if (-not (Test-Path $StartScript)) {
  Write-Error "시작 스크립트 못 찾음: $StartScript"
  exit 1
}

# 기존 태스크 있으면 제거 (재등록 가능)
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "🗑️  기존 태스크 제거"
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# 등록
$Action = New-ScheduledTaskAction `
  -Execute "PowerShell.exe" `
  -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -RestartCount 3

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description "포비 — 사용자 로그인 시 PocketBlog Insight 자동 시작 (dev 서버 + 스케줄러)" `
  -RunLevel Limited | Out-Null

Write-Host ""
Write-Host "✅ 작업 스케줄러에 등록 완료"
Write-Host "   태스크 이름: $TaskName"
Write-Host "   트리거: 사용자 '$env:USERNAME' 로그인 시"
Write-Host ""
Write-Host "📋 확인 방법"
Write-Host "   taskschd.msc 실행 → 작업 스케줄러 라이브러리에서 '$TaskName' 검색"
Write-Host ""
Write-Host "🗑️  해제하려면 (필요 시)"
Write-Host "   Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
