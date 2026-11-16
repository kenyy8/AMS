@echo off
setlocal
title AMS Local Development
cd /d "%~dp0"
echo Starting AMS. Press Ctrl+C to stop its frontend and backend.
call npm run dev
set "AMS_EXIT=%ERRORLEVEL%"
if not "%AMS_EXIT%"=="0" (
  echo AMS exited with code %AMS_EXIT%. Review the output above.
  pause
)
exit /b %AMS_EXIT%
