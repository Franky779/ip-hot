@echo off
setlocal
cd /d "%~dp0.."
node scripts\fetch-cdp-local.mjs >> "%TEMP%\ip-hot-cdp-local.log" 2>&1
exit /b %ERRORLEVEL%
