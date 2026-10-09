#!/bin/sh
set -eu
cd "$(dirname "$0")"

# Prefer a regular Node installation; Codex's bundled Node also works.
if ! command -v node >/dev/null 2>&1; then
  task_node_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [ ! -x "$task_node_bin/node" ]; then
    echo "请先安装 Node.js 22.13 或更新版本，然后再次运行 ./start.sh。"
    exit 1
  fi
  PATH="$task_node_bin:$PATH"
  export PATH
fi

if [ ! -f node_modules/vite/bin/vite.js ]; then
  task_pnpm_cli="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile
  elif [ -f "$task_pnpm_cli" ]; then
    node "$task_pnpm_cli" install --frozen-lockfile
  elif command -v npm >/dev/null 2>&1; then
    npm install
  else
    echo "请先安装 pnpm（或 npm）以下载项目依赖。"
    exit 1
  fi
fi

node scripts/copy-pdf-assets.mjs
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
echo "在浏览器打开 http://127.0.0.1:5173/；按 Ctrl+C 停止。"
exec node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173
