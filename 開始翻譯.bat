@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo 找不到 Python 環境。請先按照 README 的 Windows 安裝步驟執行 uv sync。
  pause
  exit /b 1
)
".venv\Scripts\python.exe" "jpcomedy.py" %*
if errorlevel 1 echo 翻譯沒有完成，請查看上面的錯誤訊息。
pause
