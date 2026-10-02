@echo off
rem Windows：双击运行
cd /d "%~dp0"
where node >nul 2>nul || (echo 请先安装 Node.js 18+：https://nodejs.org & pause & exit /b 1)
start "" http://localhost:8686
node server.mjs
pause
