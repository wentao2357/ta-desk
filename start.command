#!/bin/bash
# macOS：双击运行
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "请先安装 Node.js 18+：https://nodejs.org"; read -r; exit 1; }
(sleep 1.5; open "http://localhost:${PORT:-8686}") &
node server.mjs
