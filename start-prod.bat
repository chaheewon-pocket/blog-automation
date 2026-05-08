@echo off
chcp 65001 > nul
title PocketBlog Insight (Production)

cd /d "%~dp0"

echo.
echo  🐾  PocketBlog Insight - 프로덕션 모드
echo ────────────────────────────────────────
echo.
echo  ▶ 빌드 후 실행합니다 (1~2분 소요)
echo.

call npm run build
if errorlevel 1 (
  echo.
  echo  ❌ 빌드 실패. 위 에러를 확인하세요.
  pause
  exit /b 1
)

echo.
echo  ✅ 빌드 성공. 서버 시작합니다.
echo.

start "PocketBlog - Web Server" cmd /k "npm run start"

timeout /t 3 /nobreak > nul

start "PocketBlog - Scheduler" cmd /k "npm run scheduler"

echo  ✅ 프로덕션 모드 시작 완료
echo     - Web: http://localhost:3000
echo     - Scheduler: 별도 창에서 cron 대기
echo.
echo  💡 코드 수정하면 다시 이 스크립트 실행해 빌드해야 반영됨.
echo.
pause
