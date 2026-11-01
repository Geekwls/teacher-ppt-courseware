#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""课件 JSON 三层确定性校验门禁 (面向 AI Agent 的自愈机制)。

  Tier 1  结构: 信封 Schema + 逐页必填字段 + 图元参数 + 讲稿备注
  Tier 2  归属: 知识点白名单(仅可引用本单元 point_id) + 课时归属
  Tier 3  溯源: 数域上界拦截(数学) + 教材页码范围核验

用法:
  python validate_courseware.py --input output/courseware.json
  python validate_courseware.py --input output/courseware.json --quiet   # 仅输出错误摘要
退出码: 0=通过; 1=存在 error。
"""

import argparse
import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_SKILL = os.path.dirname(_HERE)
sys.path.insert(0, _SKILL)

from lib.deck_schema import validate  # noqa: E402
from lib.kb_locate import find_kb_root  # noqa: E402

KB_ROOT = find_kb_root()

_SUBJECTS = {"math": "primary-math", "chinese": "primary-chinese", "english": "primary-english"}


def _load_yaml(path):
    import yaml
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_unit_facts(meta):
    """按 deck metadata 定位单元,返回 (unit_meta, kp白名单, lesson_id集, 定位信息)。"""
    if KB_ROOT is None:
        return None, None, None, "未找到教材知识库目录(设置 COURSEWARE_KNOWLEDGE_DIR 或安装到含 plugin/knowledge 的项目)"
    subject = meta.get("subject")
    grade = meta.get("grade")
    term = meta.get("term")
    unit_id = meta.get("unit_id")
    if not all([subject, grade, term, unit_id]):
        return None, None, None, "metadata 缺少 subject/grade/term/unit_id,无法进行知识库核对"
    base = os.path.join(KB_ROOT, "curriculum", _SUBJECTS[subject], f"grade-{grade}-{term}")
    m = re.search(r"(\d+)$", str(unit_id))
    unit_dir = os.path.join(base, f"unit-{int(m.group(1)):02d}")
    if not os.path.isdir(unit_dir):
        return None, None, None, f"知识库中不存在该单元目录: {unit_dir}"
    unit_meta = _load_yaml(os.path.join(unit_dir, "metadata.yaml"))
    kps_doc = _load_yaml(os.path.join(unit_dir, "knowledge_points.yaml")) if os.path.exists(
        os.path.join(unit_dir, "knowledge_points.yaml")) else {}
    lessons_doc = _load_yaml(os.path.join(unit_dir, "lessons.yaml")) if os.path.exists(
        os.path.join(unit_dir, "lessons.yaml")) else {}
    kp_ids = {p.get("point_id") for p in kps_doc.get("points", []) if p.get("point_id")}
    lesson_ids = {str(l.get("lesson_id")) for l in lessons_doc.get("lessons", [])
                  if l.get("lesson_id")}
    return unit_meta, kp_ids, lesson_ids, None


def main():
    ap = argparse.ArgumentParser(description="课件 JSON 三层校验门禁")
    ap.add_argument("--input", required=True, help="课件 JSON 路径")
    ap.add_argument("--quiet", action="store_true", help="仅输出错误,不输出警告与提示")
    args = ap.parse_args()

    try:
        with open(args.input, encoding="utf-8") as f:
            data = json.loads(f.read().encode("utf-8").decode("utf-8-sig"))  # 兼容 BOM
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"status": "invalid_input", "message": f"无法读取课件 JSON: {exc}"}, ensure_ascii=False))
        sys.exit(1)

    unit_meta, kp_ids, lesson_ids, locate_error = load_unit_facts(data.get("metadata") or {})
    kb_warnings = []
    if locate_error:
        kb_warnings.append({"code": "KB_LOCATE_FAILED", "severity": "warning", "message": locate_error,
                            "hint": "已跳过 Tier2/3 知识库核对;请先运行 query_curriculum.py 核对 metadata。"})
        errors, warnings = validate(data)
    else:
        errors, warnings = validate(data, unit_meta=unit_meta, knowledge_point_ids=kp_ids,
                                    lesson_ids=lesson_ids)
    warnings = kb_warnings + warnings

    status = "pass" if not errors else "fail"
    out = {"status": status, "input": args.input,
           "errors": errors, "warnings": [] if args.quiet else warnings,
           "summary": {"error_count": len(errors), "warning_count": len(warnings)}}
    if errors and not args.quiet:
        out["repair_hint"] = ("逐条修复 errors 后重新运行本命令;修改时只改内容字段,"
                              "slide_id/type/结构字段保持稳定。")
    print(json.dumps(out, ensure_ascii=False, indent=1))
    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()
