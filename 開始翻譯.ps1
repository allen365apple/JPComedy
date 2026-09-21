$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Python = Join-Path $Root ".venv\Scripts\python.exe"

if (!(Test-Path $Python)) {
    Write-Host "找不到 Python 環境。請先按照 README 的 Windows 安裝步驟執行 uv sync。" -ForegroundColor Yellow
    Read-Host "按 Enter 關閉"
    exit 1
}

& $Python "jpcomedy.py" @args
$ExitCode = $LASTEXITCODE
if ($ExitCode -ne 0) {
    Write-Host "翻譯沒有完成，請查看上面的錯誤訊息。" -ForegroundColor Red
}
Read-Host "按 Enter 關閉"
exit $ExitCode
