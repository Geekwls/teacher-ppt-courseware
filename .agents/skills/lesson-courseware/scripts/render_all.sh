#!/usr/bin/env bash
# 课件一键校验+渲染交付 (纯 Node.js / PptxGenJS 引擎)
# 用法: bash render_all.sh <courseware.json> [outdir]
set -euo pipefail

json="$1"
outdir="${2:-output}"
here="$(cd "$(dirname "$0")" && pwd)"

command -v node >/dev/null 2>&1 || { echo "[render_all] 错误: 未找到 node 命令, 请先安装 Node.js"; exit 1; }

echo "[render_all] 1/2 校验课件 JSON (Node.js)..."
node "$here/validate_courseware.js" --input "$json" --quiet

echo "[render_all] 2/2 渲染 .pptx + 几何审计 (PptxGenJS)..."
node "$here/render_deck.js" --input "$json" --outdir "$outdir" --strict

echo "[render_all] 完成: pptx / 源 JSON / .audit.json 几何回执 已一并写入输出目录。"
