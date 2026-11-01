#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""端到端验收运行器: 三科金样课件 校验→渲染→结构断言→报告。

用法: python scripts/run_acceptance.py
产出: output/acceptance/*.pptx 与 output/reports/acceptance-report.md
退出码: 0=全部通过; 1=存在失败(严禁以自动化通过代替内容验收,报告如实呈现)。
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL = os.path.join(ROOT, "plugin", "skills", "lesson-courseware")
sys.path.insert(0, SKILL)
sys.path.insert(0, ROOT)

import yaml  # noqa: E402
from lib.deck_schema import validate  # noqa: E402
from scripts.render_deck import build_deck, load_json  # noqa: E402
from scripts.validate_courseware import load_unit_facts  # noqa: E402

OUT_ACCEPT = os.path.join(ROOT, "output", "acceptance")
OUT_REPORT = os.path.join(ROOT, "output", "reports")


def run_case(case):
    deck_path = os.path.join(ROOT, case["deck_json"])
    data = load_json(deck_path)
    unit_meta, kp_ids, lesson_ids, locate_error = load_unit_facts(data.get("metadata") or {})
    errors, warnings = validate(data, unit_meta=unit_meta, knowledge_point_ids=kp_ids,
                                lesson_ids=lesson_ids)
    result = {"case_id": case["case_id"], "subject": case["subject"], "title": case["title"],
              "validate_status": "pass" if not errors else "fail", "errors": errors,
              "warnings": warnings, "checks": []}
    if errors:
        result["status"] = "fail"
        return result

    prs, rendered = build_deck(data)
    os.makedirs(OUT_ACCEPT, exist_ok=True)
    safe_title = "".join(c for c in data["metadata"]["title"] if c not in '\\/:*?"<>|')[:80]
    pptx_path = os.path.join(OUT_ACCEPT, f"{safe_title}.pptx")
    prs.save(pptx_path)
    result["output"] = pptx_path

    expect = case.get("expect", {})
    ok_slides = expect.get("min_slides", 1) <= rendered <= expect.get("max_slides", 60)
    result["checks"].append({"check": f"页数 {rendered} ∈ [{expect.get('min_slides')}, {expect.get('max_slides')}]",
                             "pass": ok_slides})

    from pptx import Presentation
    back = Presentation(pptx_path)
    all_text = " ".join(sh.text_frame.text for s in back.slides for sh in s.shapes
                        if sh.has_text_frame)
    for token in expect.get("must_contain_text", []):
        result["checks"].append({"check": f"包含关键内容『{token}』",
                                 "pass": token in all_text})

    notes_count = sum(1 for s in back.slides
                      if s.has_notes_slide and s.notes_slide.notes_text_frame.text.strip())
    result["checks"].append({"check": f"讲稿备注覆盖 {notes_count}/{len(back.slides)} 页",
                             "pass": notes_count >= len(back.slides) - 3})

    W, H = 12192000, 6858000
    overflow = 0
    for s in back.slides:
        for sh in s.shapes:
            try:
                if sh.left is None:
                    continue
                if sh.left < -10000 or sh.top < -10000 or \
                   sh.left + sh.width > W + 10000 or sh.top + sh.height > H + 10000:
                    overflow += 1
            except Exception:  # noqa: BLE001
                pass
    result["checks"].append({"check": f"画布越界形状 {overflow} 个",
                             "pass": overflow == 0})
    result["status"] = "pass" if all(c["pass"] for c in result["checks"]) else "fail"
    return result


def write_report(results, all_pass):
    os.makedirs(OUT_REPORT, exist_ok=True)
    lines = ["# 课件生成端到端验收报告", "",
             f"- 结果: **{'全部通过' if all_pass else '存在失败'}**({sum(1 for r in results if r['status'] == 'pass')}/{len(results)})",
             f"- 运行目录: `{os.path.relpath(OUT_ACCEPT, ROOT)}`", ""]
    for r in results:
        lines.append(f"## {r['case_id']} — {r['title']}")
        lines.append(f"- 校验: {r['validate_status']}"
                     + ("" if not r["errors"] else f" errors={json.dumps(r['errors'], ensure_ascii=False)}"))
        lines.append(f"- 渲染: {r.get('output', '未执行')}")
        for c in r["checks"]:
            lines.append(f"- [{'PASS' if c['pass'] else 'FAIL'}] {c['check']}")
        lines.append("")
    lines.append("> 自动化引擎只判定可结构化项目;课件内容的教学正确性须经教师人工审核。")
    path = os.path.join(OUT_REPORT, "acceptance-report.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path


def main():
    with open(os.path.join(ROOT, "acceptance", "cases.yaml"), encoding="utf-8") as f:
        cases = yaml.safe_load(f)["cases"]
    results = [run_case(c) for c in cases]
    all_pass = all(r["status"] == "pass" for r in results)
    report = write_report(results, all_pass)
    print(json.dumps({"status": "pass" if all_pass else "fail",
                      "cases": [{"case_id": r["case_id"], "status": r["status"],
                                 "output": r.get("output")} for r in results],
                      "report": report}, ensure_ascii=False, indent=1))
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
