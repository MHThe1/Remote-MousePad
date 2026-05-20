@echo off
echo ============================================
echo   MouseRemote - Development Setup
echo ============================================
echo.
echo [1/2] Building mobile PWA...
cd mobile
call npm run build
cd ..
echo.
echo [2/2] Starting Tauri desktop app...
echo.
echo TIP: Your phone should open http://YOUR-LAN-IP:9000
echo      The desktop app will show the QR code to scan.
echo.
call npm run tauri dev
