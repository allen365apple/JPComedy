#!/bin/zsh
set -eu
cd "${0:A:h}"
export PATH="/opt/homebrew/opt/ffmpeg-full/bin:/usr/local/opt/ffmpeg-full/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ ! -x .venv/bin/python ]]; then
  print "請先依 README 完成一次安裝（uv sync）。"
else
  .venv/bin/python jpcomedy.py || print "翻譯未完成，請查看上方訊息。可用相同網址續跑。"
fi
read "?按 Enter 關閉視窗…"
