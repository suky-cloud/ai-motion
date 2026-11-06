@echo off
setlocal
if exist "%~dp0.local\desktop\AI Motion-win32-x64\AI-Motion.exe" (
  start "" "%~dp0.local\desktop\AI Motion-win32-x64\AI-Motion.exe"
) else (
  echo Desktop package not found. See docs/DESKTOP_GUIDE.md.
  pause
)
