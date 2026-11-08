@echo off
title ARES-1 Demo
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node tools\serve.js 5173
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\server.ps1 -Port 5173
)
pause
