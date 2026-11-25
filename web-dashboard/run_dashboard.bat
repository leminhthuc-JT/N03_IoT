@echo off
title N03 Web Dashboard Launcher
echo ===================================================
echo     N03 IoT - SMART IRRIGATION DASHBOARD
echo ===================================================
echo.
echo Dang khoi dong Web Dashboard...
echo Ban co the mo truc tiep file index.html hoac chay qua Local Server.
echo.

:: Khoi dong server bang Python o port 5500 de tranh loi CORS khi dung WebSocket
start "" http://localhost:5500
python -m http.server 5500

pause
