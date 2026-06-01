@echo off
title Memorial Site Local Server
cd /d "%~dp0"
set PORT=8000
echo Starting site at http://localhost:%PORT%/index.html
echo Keep this window open.
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/index.html"
  py -3 -m http.server %PORT%
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/index.html"
  python -m http.server %PORT%
  goto :eof
)
echo Python not found. You can also use VS Code Live Server.
pause
