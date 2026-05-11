@echo off
chcp 65001 > nul
title PocketBlog Autostart

cd /d "%~dp0"

REM 이미 포트 3000이 떠있으면 dev 서버 스킵
netstat -ano | findstr ":3000" | findstr "LISTENING" > nul
if errorlevel 1 (
  start "PocketBlog - Dev Server" /min cmd /k "npm run dev"
  timeout /t 3 /nobreak > nul
)

REM 스케줄러 중복 실행 방지 — 이미 떠있는지 확인은 단순화 (npm run scheduler 자체가 이중 실행 안전하다고 가정)
start "PocketBlog - Scheduler" /min cmd /k "npm run scheduler"

REM launcher 창은 즉시 종료 (pause 없음)
exit
