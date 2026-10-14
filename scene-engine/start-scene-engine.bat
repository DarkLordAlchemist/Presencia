@echo off
rem Starts Presencia scene-engine (Security scene analysis) on port 8001,
rem using RelateAnything's own virtualenv. Set RELATEANYTHING_DIR if it
rem is not installed at C:\Users\User\RelateAnything.
if "%RELATEANYTHING_DIR%"=="" set RELATEANYTHING_DIR=C:\Users\User\RelateAnything
cd /d "%~dp0"
"%RELATEANYTHING_DIR%\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8001
