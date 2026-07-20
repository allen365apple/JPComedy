#!/bin/zsh
set -e

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
cd "$PROJECT_DIR"

if [[ ! -x ".venv/bin/python" ]]; then
  echo "找不到 GrillMaster 的 Python 環境，請先完成專案安裝。"
  read "?按 Enter 關閉視窗…"
  exit 1
fi

exec .venv/bin/python -m glossary_ui.server
