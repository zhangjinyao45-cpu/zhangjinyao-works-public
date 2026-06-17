@echo off
REM ===== AIPM 演示模式 · 开启 =====
REM 双击此文件即可启用演示模式
REM 后端会立即生效，无需重启服务器

setlocal
set FLAG_FILE=%~dp0.demo-mode

if exist "%FLAG_FILE%" (
  echo [DEMO] 演示模式已经是开启状态。
) else (
  echo [DEMO ON] %DATE% %TIME% > "%FLAG_FILE%"
  echo [DEMO] 演示模式已开启。
  echo.
  echo 现在用户从 http://localhost:3000/app/start.html 创建任意项目
  echo 都会跳转到度小满项目的预设剧本。
)

echo.
pause
