@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est requis : https://nodejs.org & pause & exit /b 1)
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process node -ArgumentList 'server.mjs','--open' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
