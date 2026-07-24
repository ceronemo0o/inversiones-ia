@echo off
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" proxy.js >> proxy.log 2>&1
