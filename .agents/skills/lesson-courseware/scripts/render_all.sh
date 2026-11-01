#!/usr/bin/env bash
# 课件一键校验+渲染交付 (fail-fast,仿 k12 render_all.sh)
# 用法: bash render_all.sh <courseware.json> [outdir]
set -euo pipefail

json="$1"
outdir="${2:-output}"
here="$(cd "$(dirname "$0")" && pwd)"

command -v python >/dev/null 2>&1 || { echo "[render_all] 未找到 python"; exit 1; }
python -c "import pptx" 2>/dev/null || {
  echo "[render_all] python-pptx 未安装,正在安装..."
  python -m pip install --quiet "python-pptx>=1.0.0"
}

echo "[render_all] 1/2 校验课件 JSON..."
python "$here/validate_courseware.py" --input "$json" --quiet

echo "[render_all] 2/2 渲染 .pptx..."
python "$here/render_deck.py" --input "$json" --outdir "$outdir"

echo "[render_all] 完成: 源 JSON 已随 pptx 一并复制到输出目录(便于追溯与重渲染)。"
