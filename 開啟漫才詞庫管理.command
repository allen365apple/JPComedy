#!/bin/zsh
set -e

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

if [[ ! -x ".venv/bin/python" ]]; then
  echo "找不到 GrillMaster 的執行環境，請先完成專案安裝。"
  read "?按 Enter 關閉視窗…"
  exit 1
fi

exec .venv/bin/python -m glossary_ui.server
