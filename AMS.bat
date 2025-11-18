@echo off
title Smart Apartment Launcher
color 0A

echo ====================================================
echo         SMART APARTMENT SYSTEM LAUNCHER
echo ====================================================

REM --- Start backend ---
echo Starting backend server...
cd backend
start "" /b node server.js
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo table ^| find /i "node.exe"') do set BACK_PID=%%a
cd ..

echo Waiting for backend to start...
timeout /t 5 >nul

REM --- Start frontend ---
echo Starting frontend...
cd frontend
start "" /b npm start --no-open
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo table ^| find /i "node.exe"') do set FRONT_PID=%%a
cd ..

echo Waiting for frontend to start...
timeout /t 10 >nul

echo.
echo ====================================================
echo SMART APARTMENT SYSTEM IS NOW RUNNING
echo Close this window to stop everything.
echo ====================================================
echo.

REM --- Keep alive until closed ---
:wait
timeout /t 2 >nul
if exist "%~f0" goto wait

REM --- Cleanup on close ---
echo Stopping servers...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im npm.exe >nul 2>&1
echo All servers stopped.
exit
