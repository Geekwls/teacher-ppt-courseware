#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Skill 安装同步器 (install_skill)。

把 plugin/skills/lesson-courseware 同步到目标项目的 Agent 发现目录(.agents/skills/),
供 Codex / Antigravity 等平台使用(Claude Code / ZCode 走 marketplace 安装,无需本脚本)。

用法:
  python scripts/install_skill.py                 # 同步到本项目 .agents/skills/(零差异同构)
  python scripts/install_skill.py --target <dir>  # 安装到其他项目根(知识库建议用环境变量指向本项目)
  python scripts/install_skill.py --check         # 仅校验同构性,不写入
"""

import argparse
import hashlib
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "plugin", "skills", "lesson-courseware")


def digest_dir(path):
    out = {}
    for base, _dirs, files in os.walk(path):
        for name in sorted(files):
            p = os.path.join(base, name)
            rel = os.path.relpath(p, path).replace("\\", "/")
            with open(p, "rb") as f:
                out[rel] = hashlib.sha256(f.read()).hexdigest()
    return out


def main():
    ap = argparse.ArgumentParser(description="同步 skill 到 .agents/skills/")
    ap.add_argument("--target", default=ROOT, help="目标项目根目录")
    ap.add_argument("--check", action="store_true", help="仅校验零差异同构,不写入")
    args = ap.parse_args()

    if not os.path.isdir(SRC):
        print(json.dumps({"status": "error", "message": f"源目录不存在: {SRC}"}, ensure_ascii=False))
        sys.exit(1)
    dst = os.path.join(args.target, ".agents", "skills", "lesson-courseware")

    src_digest = digest_dir(SRC)
    if args.check:
        if not os.path.isdir(dst):
            print(json.dumps({"status": "drift", "message": "目标未安装"}, ensure_ascii=False))
            sys.exit(1)
        dst_digest = digest_dir(dst)
        diff = {k for k in set(src_digest) | set(dst_digest)
                if src_digest.get(k) != dst_digest.get(k)}
        print(json.dumps({"status": "ok" if not diff else "drift",
                          "different_files": sorted(diff)[:20]}, ensure_ascii=False, indent=1))
        sys.exit(0 if not diff else 1)

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(SRC, dst)
    dst_digest = digest_dir(dst)
    drift = {k for k in set(src_digest) | set(dst_digest)
             if src_digest.get(k) != dst_digest.get(k)}
    print(json.dumps({"status": "ok" if not drift else "drift",
                      "installed_to": dst, "files": len(dst_digest),
                      "knowledge_hint": ("其他项目安装时,请设置环境变量 COURSEWARE_KNOWLEDGE_DIR 指向本项目的 plugin/knowledge,"
                                         "或把整个 teacher-ppt-courseware 仓库克隆到目标环境。") if args.target != ROOT else None},
                     ensure_ascii=False, indent=1))
    sys.exit(0 if not drift else 1)


if __name__ == "__main__":
    main()
