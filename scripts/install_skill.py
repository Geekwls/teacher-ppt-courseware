#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Skill 多目录安装同步器 (install_skill)。

把正本 plugin/skills/lesson-courseware 同步到各 Agent 发现目录,保证零差异同构:
  项目级(--target <项目根>,默认本仓库):
    .agents/skills/lesson-courseware   # 共享约定(Codex / Antigravity / Claude Code 等)
    .claude/skills/lesson-courseware   # Claude Code / ZCode 项目级技能
  用户级(--user):
    ~/.agents/skills/lesson-courseware 与 ~/.claude/skills/lesson-courseware

用法:
  python scripts/install_skill.py                  # 同步到本项目(项目级全部目录)
  python scripts/install_skill.py --user           # 同步到当前用户目录(所有项目可用)
  python scripts/install_skill.py --target <dir>   # 安装到其他项目根
  python scripts/install_skill.py --dirs agents    # 只同步指定目录(agents|claude,逗号分隔)
  python scripts/install_skill.py --check          # 校验全部目标零漂移,不写入
"""

import argparse
import hashlib
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "plugin", "skills", "lesson-courseware")

# dir 键 → 相对目标路径(相对项目根或用户主目录)
DIR_MAP = {
    "agents": (".agents", "skills"),
    "claude": (".claude", "skills"),
}


def digest_dir(path):
    out = {}
    for base, _dirs, files in os.walk(path):
        for name in sorted(files):
            p = os.path.join(base, name)
            rel = os.path.relpath(p, path).replace("\\", "/")
            with open(p, "rb") as f:
                out[rel] = hashlib.sha256(f.read()).hexdigest()
    return out


def resolve_targets(base_root, dir_keys):
    out = []
    for key in dir_keys:
        seg = DIR_MAP[key]
        out.append((key, os.path.join(base_root, *seg, "lesson-courseware")))
    return out


def main():
    ap = argparse.ArgumentParser(description="同步 skill 到各 Agent 发现目录")
    ap.add_argument("--target", default=None, help="目标项目根目录(默认本仓库)")
    ap.add_argument("--user", action="store_true", help="安装到用户级目录(~/.agents, ~/.claude)")
    ap.add_argument("--dirs", default="agents,claude",
                    help="同步哪些目录: agents,claude(默认全部)")
    ap.add_argument("--check", action="store_true", help="仅校验零差异同构,不写入")
    args = ap.parse_args()

    if not os.path.isdir(SRC):
        print(json.dumps({"status": "error", "message": f"源目录不存在: {SRC}"}, ensure_ascii=False))
        sys.exit(1)
    dir_keys = [d.strip() for d in args.dirs.split(",") if d.strip()]
    unknown = [d for d in dir_keys if d not in DIR_MAP]
    if unknown:
        print(json.dumps({"status": "error",
                          "message": f"未知目录键: {unknown},可选: {sorted(DIR_MAP)}"}, ensure_ascii=False))
        sys.exit(1)
    base_root = os.path.expanduser("~") if args.user else (args.target or ROOT)
    targets = resolve_targets(base_root, dir_keys)

    src_digest = digest_dir(SRC)
    report, drift_any, missing_any = [], False, False
    for key, dst in targets:
        entry = {"dir": key, "path": dst}
        if not os.path.isdir(dst):
            missing_any = True
            entry["status"] = "missing"
            drift_any = True
        else:
            dst_digest = digest_dir(dst)
            diff = sorted(k for k in set(src_digest) | set(dst_digest)
                          if src_digest.get(k) != dst_digest.get(k))
            entry["status"] = "ok" if not diff else "drift"
            if diff:
                drift_any = True
                entry["different_files"] = diff[:20]
        report.append(entry)

    if args.check:
        status = "ok" if not (drift_any or missing_any) else "drift"
        print(json.dumps({"status": status, "source_files": len(src_digest),
                          "targets": report}, ensure_ascii=False, indent=1))
        sys.exit(0 if status == "ok" else 1)

    for key, dst in targets:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        shutil.copytree(SRC, dst)
    print(json.dumps({"status": "ok", "source_files": len(src_digest),
                      "scope": "user" if args.user else f"project({base_root})",
                      "targets": report,
                      "knowledge_hint": ("其他项目/用户级安装时,请设置 COURSEWARE_KNOWLEDGE_DIR 指向本项目的 plugin/knowledge,"
                                         "或保持在本仓库内使用(kb_locate 会向上查找)。") if (args.user or args.target) else None},
                     ensure_ascii=False, indent=1))
    sys.exit(0)


if __name__ == "__main__":
    main()
