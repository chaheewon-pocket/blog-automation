@echo off
chcp 65001 > nul
title PocketBlog Insight Launcher

cd /d "%~dp0"

echo.
echo  🐾  PocketBlog Insight ^| 포비와 함께
echo ────────────────────────────────────
echo.
echo  ▶ 두 개의 창이 열립니다:
echo     1) Dev Server  - http://localhost:3000
echo     2) Scheduler   - 매일/매주 자동 수집 (cron)
echo.

start "PocketBlog - Dev Server" cmd /k "npm run dev"

timeout /t 3 /nobreak > nul

start "PocketBlog - Scheduler" cmd /k "npm run scheduler"

echo  ✅ 시작 완료. 브라우저에서 http://localhost:3000 으로 접속하세요.
echo.
echo  ⚠️  종료할 때는 두 개의 창을 모두 닫으세요.
echo.
pause
