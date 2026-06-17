@echo off
REM ===== AIPM 演示模式 · 关闭 =====
REM 双击此文件即可关闭演示模式
REM 关闭后后端立即恢复真实流程，无需重启服务器

setlocal
set FLAG_FILE=%~dp0.demo-mode

if exist "%FLAG_FILE%" (
  del /f "%FLAG_FILE%"
  echo [DEMO] 演示模式已关闭。
  echo.
  echo 现在创建项目走真实 Claude API + RAG 流程。
) else (
  echo [DEMO] 演示模式当前已经是关闭状态。
)

echo.
pause
