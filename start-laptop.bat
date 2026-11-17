@echo off
REM CE Smart Evidence - run locally on Windows (http://localhost:8080)
cd /d "%~dp0"
echo Starting CE Smart Evidence on http://localhost:8080  (close this window to stop)
start "" http://localhost:8080
python -m http.server 8080 --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo Python was not found. Install it from https://www.python.org/downloads/ and tick "Add to PATH".
  pause
)
