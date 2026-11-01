#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""课时课件素材包查询工具 (面向 AI Agent 的课件创作前置工具)。

从五层教材知识库中提取"一课时"的课件创作素材包:
  教材例题(lessons.yaml) + 知识点/教学目标/边界(knowledge_points.yaml)
  + 教参重难点/典型错因/变式策略(teaching_reference.yaml) + 练习蓝图摘要(question_blueprints.yaml)

用法:
  python query_curriculum.py --subject math --grade 3 --term term-1 --unit unit-4 --lesson 1
  python query_curriculum.py --prompt "三年级上册数学第四单元第1课时"
  python query_curriculum.py --list-units --subject math --grade 3 --term term-1
  python query_curriculum.py --search "口算乘法"

输出: 单一 JSON(status=ok / need_clarification / not_found)。
直读 YAML 事实源,不依赖数据库;所有字段均可在输出中溯源到知识库文件。
"""

import argparse
import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_SKILL = os.path.dirname(_HERE)
if _SKILL not in sys.path:
    sys.path.insert(0, _SKILL)

from lib.kb_locate import find_kb_root  # noqa: E402

KB_ROOT = find_kb_root()

SUBJECTS = {"math": "primary-math", "chinese": "primary-chinese", "english": "primary-english"}
SUBJECT_ALIAS = {"数学": "math", "math": "math", "语文": "chinese", "chinese": "chinese",
                 "英语": "english", "english": "english"}
CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def _load_yaml(path):
    import yaml
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _unit_dir(subject, grade, term):
    return os.path.join(KB_ROOT, "curriculum", SUBJECTS[subject], f"grade-{grade}-{term}")


def _lesson_num(lesson_id):
    """lesson_id 兼容两种形态: 'lesson-01' 与 'chi-g3-t1-u02-l02' → 取尾号数字。"""
    m = re.search(r"(\d+)$", str(lesson_id or ""))
    return int(m.group(1)) if m else None


def parse_prompt(prompt):
    """轻量中文自然语言解析: 提取学科/年级/册次/单元/课时。缺字段时返回 missing_fields。"""
    out = {"subject": None, "grade": None, "term": None, "unit": None, "lesson": None}
    p = prompt.lower()
    for alias, sub in SUBJECT_ALIAS.items():
        if alias in p or alias in prompt:
            out["subject"] = sub
            break
    m = re.search(r"([1-6一二三四五六])\s*年级", prompt)
    if m:
        out["grade"] = CN_NUM.get(m.group(1)) or int(m.group(1))
    if re.search(r"上册|上学期|秋季|秋学期", prompt):
        out["term"] = "term-1"
    elif re.search(r"下册|下学期|春季|春学期", prompt):
        out["term"] = "term-2"
    m = re.search(r"第\s*([1-9一二三四五六七八九十]+)\s*单元", prompt)
    if m:
        raw = m.group(1)
        num = CN_NUM.get(raw)
        if num is None and re.fullmatch(r"[1-9]+", raw):
            num = int(raw)
        if num:
            out["unit"] = f"unit-{num}"
    m = re.search(r"第\s*([1-9一二三四五六七八九十]+)\s*课时", prompt)
    if m:
        raw = m.group(1)
        num = CN_NUM.get(raw) or (int(raw) if re.fullmatch(r"[1-9]+", raw) else None)
        if num:
            out["lesson"] = num
    else:  # 语文/英语习惯: "第5课"(排除"第5课文"歧义留给名称匹配)
        m = re.search(r"第\s*([1-9一二三四五六七八九十]+)\s*课(?!文)", prompt)
        if m:
            raw = m.group(1)
            num = CN_NUM.get(raw) or (int(raw) if re.fullmatch(r"[1-9]+", raw) else None)
            if num:
                out["lesson"] = num
    out["missing_fields"] = [k for k in ("subject", "grade", "term", "unit") if not out[k]]
    return out


def resolve_unit(subject, grade, term, unit):
    """在 manifest 中定位单元,返回 (unit_entry, status)。unit 支持 unit-4 / 4 / 第四单元 / 名称关键词。"""
    manifest = json.load(open(os.path.join(KB_ROOT, "manifest.json"), encoding="utf-8"))
    subject_entry = manifest.get("subjects", {}).get(subject)
    if not subject_entry:
        return None, "not_found", manifest
    grade_entry = (subject_entry.get("grades") or {}).get(f"grade-{grade}")
    if not grade_entry:
        return None, "not_found", manifest
    term_entry = grade_entry.get(term) or (grade_entry.get("terms") or {}).get(term)
    if not term_entry:
        return None, "not_found", manifest
    units = term_entry.get("units", [])
    if unit is None:
        return {"_units": units}, "ambiguous", manifest
    raw = str(unit).strip()
    m = re.fullmatch(r"unit[-_]?(\d+)", raw, re.I) or re.fullmatch(r"(\d+)", raw)
    if m:
        want = int(m.group(1))
        for u in units:
            if re.search(r"(\d+)$", u.get("unit_id", "")) and int(re.search(r"(\d+)$", u["unit_id"]).group(1)) == want:
                return u, "ok", manifest
    m = re.search(r"第\s*([1-9一二三四五六七八九十]+)\s*单元", raw)
    if m:
        num = CN_NUM.get(m.group(1)) or (int(m.group(1)) if m.group(1).isdigit() else None)
        if num:
            for u in units:
                if re.search(rf"第\s*{num}\s*单元", u.get("unit_name", "")):
                    return u, "ok", manifest
    for u in units:  # 名称关键词回退
        if raw and raw in u.get("unit_name", ""):
            return u, "ok", manifest
    return None, "not_found", manifest


def load_unit_pack(subject, grade, term, unit_entry):
    d = unit_entry.get("dir", "")
    rel = os.path.relpath(d, "knowledge") if d.startswith("knowledge") else os.path.join(
        "curriculum", SUBJECTS[subject], f"grade-{grade}-{term}", os.path.basename(d))
    base = os.path.join(KB_ROOT, rel)
    pack = {"dir": base}
    for name in ("metadata", "lessons", "knowledge_points", "teaching_reference", "question_blueprints"):
        p = os.path.join(base, f"{name}.yaml")
        pack[name] = _load_yaml(p) if os.path.exists(p) else None
    return pack


def build_material_pack(subject, grade, term, unit, lesson=None):
    unit_entry, status, manifest = resolve_unit(subject, grade, term, unit)
    if status == "not_found":
        return {"status": "not_found",
                "message": f"知识库中未找到该单元: subject={subject} grade={grade} term={term} unit={unit}",
                "hint": "可用 --list-units 查看该册全部单元,或改用 --search 按关键词检索。"}
    if status == "ambiguous":
        units = unit_entry["_units"]
        return {"status": "need_clarification",
                "missing_fields": ["unit"],
                "candidates": [{"unit_id": u["unit_id"], "unit_name": u.get("unit_name"), "status": u.get("status")}
                               for u in units]}
    pack = load_unit_pack(subject, grade, term, unit_entry)
    meta = pack["metadata"] or {}
    lessons_doc = pack["lessons"] or {}
    kps_doc = pack["knowledge_points"] or {}
    tr_doc = pack["teaching_reference"] or {}
    bp_doc = pack["question_blueprints"] or {}

    lessons = lessons_doc.get("lessons", []) if lessons_doc else []
    kps = kps_doc.get("points", []) if kps_doc else []
    trs = tr_doc.get("teaching_references", []) if tr_doc else []

    result = {
        "status": "ok",
        "resolution": {"subject": subject, "grade": grade, "term": term,
                       "unit_id": meta.get("unit_id"), "unit_name": meta.get("unit_name"),
                       "dir": os.path.relpath(pack["dir"], KB_ROOT)},
        "unit": {
            "verification_status": meta.get("verification_status") or unit_entry.get("status"),
            "edition": meta.get("edition"),
            "page_range": meta.get("page_range"),
            "unit_overview": meta.get("unit_overview"),
            "curriculum_standard_ref": meta.get("curriculum_standard_ref"),
            "numeric_upper_bound": meta.get("numeric_upper_bound"),
            "evidence_note": meta.get("page_evidence_note"),
        },
        "lessons_index": [{"lesson_id": l.get("lesson_id"), "lesson_number": l.get("lesson_number"),
                           "lesson_name": l.get("lesson_name"), "page_range": l.get("page_range")}
                          for l in lessons],
        "material_source": {
            "lessons": "lessons.yaml(教材例题原文)",
            "knowledge_points": "knowledge_points.yaml(教学目标/边界/溯源)",
            "teaching_reference": "teaching_reference.yaml(教参重难点/典型错因/变式策略)",
            "question_blueprints": "question_blueprints.yaml(练习蓝图摘要)",
        },
    }

    if lesson is not None:
        target = None
        if isinstance(lesson, int):
            target = next((l for l in lessons if int(l.get("lesson_number") or 0) == lesson), None)
            if target is None:  # 语文/英语按"第N课"课文序号即 lesson_number,已试;再试名称
                target = next((l for l in lessons if f"第{lesson}课" in str(l.get("lesson_name", ""))), None)
        if target is None and isinstance(lesson, str):
            target = next((l for l in lessons if lesson in str(l.get("lesson_name", ""))), None)
        if target is None:
            return {"status": "need_clarification",
                    "message": f"该单元下未定位到课时: {lesson}",
                    "numbering_note": ("语文/英语的 lesson_number 是教材课文序号(如'第5课'),"
                                       "数学是课时序号;请从 lessons_index 中选择,或用课时名称关键词。"),
                    "lessons_index": result["lessons_index"]}
        lnum = target.get("lesson_number")
        related = [kp for kp in kps if _lesson_num(kp.get("lesson_id")) == _lesson_num(target.get("lesson_id"))
                   or _lesson_num(kp.get("lesson_id")) == lnum]
        kp_ids = {kp.get("point_id") for kp in related}
        related_tr = [tr for tr in trs if tr.get("point_id") in kp_ids]
        result["lesson"] = target
        result["knowledge_points"] = related
        result["teaching_reference"] = related_tr
        result["caveat"] = ("该课时无直接对应知识点时,请基于单元知识点与教材例题创作,并在 evidence 中如实标注。"
                            if not related else None)
    else:
        result["knowledge_points"] = kps
        result["teaching_reference"] = trs

    if bp_doc:
        result["question_blueprint_summary"] = [
            {"blueprint_id": b.get("blueprint_id"), "title": b.get("title"),
             "difficulty_ratio": b.get("difficulty_ratio"),
             "slots": [{"section": s.get("section"), "question_type": s.get("question_type"),
                        "difficulty": s.get("difficulty"), "item_count": s.get("item_count"),
                        "target_points": s.get("target_points"), "guidelines": s.get("guidelines")}
                       for s in (b.get("question_slots") or [])]}
            for b in (bp_doc.get("blueprints") or [])[:1]]

    result["caveat"] = result.get("caveat") or (
        "本单元核验状态为 partial: 素材可供课件创作,但须在课件页脚注明'内容依据人教版教材整理',并提示教师课前核对。"
        if result["unit"]["verification_status"] == "partial" else None)
    return {k: v for k, v in result.items() if v is not None}


def list_units(subject, grade, term):
    unit_entry, status, _ = resolve_unit(subject, grade, term, None)
    if status == "not_found":
        return {"status": "not_found", "message": f"无该册记录: {subject} {grade} {term}"}
    return {"status": "ok", "subject": subject, "grade": grade, "term": term,
            "units": [{"unit_id": u.get("unit_id"), "unit_name": u.get("unit_name"),
                       "status": u.get("status")} for u in unit_entry["_units"]]}


def search(keyword):
    """跨全库检索课时名/知识点名,用于口语化请求的路由。"""
    hits = []
    for sub_dir in SUBJECTS.values():
        root = os.path.join(KB_ROOT, "curriculum", sub_dir)
        if not os.path.isdir(root):
            continue
        for grade_term in sorted(os.listdir(root)):
            gt_dir = os.path.join(root, grade_term)
            if not os.path.isdir(gt_dir):
                continue
            for unit_dir in sorted(os.listdir(gt_dir)):
                lessons_path = os.path.join(gt_dir, unit_dir, "lessons.yaml")
                meta_path = os.path.join(gt_dir, unit_dir, "metadata.yaml")
                if not os.path.exists(lessons_path):
                    continue
                meta = _load_yaml(meta_path) if os.path.exists(meta_path) else {}
                lessons = (_load_yaml(lessons_path) or {}).get("lessons", [])
                grade = meta.get("grade")
                term = meta.get("term")
                for l in lessons:
                    text = f"{l.get('lesson_name', '')} " + " ".join(
                        str(x) for x in (l.get("official_examples") or [])[:2])
                    if keyword in text:
                        hits.append({"subject": {"primary-math": "math", "primary-chinese": "chinese",
                                                 "primary-english": "english"}[sub_dir],
                                     "grade": grade, "term": term, "unit_id": meta.get("unit_id"),
                                     "unit_name": meta.get("unit_name"),
                                     "lesson_number": l.get("lesson_number"),
                                     "lesson_name": l.get("lesson_name")})
                        if len(hits) >= 20:
                            return {"status": "ok", "keyword": keyword, "hits": hits,
                                    "note": "命中较多,仅显示前20条;请细化关键词。"}
    return {"status": "ok" if hits else "not_found", "keyword": keyword, "hits": hits}


def main():
    ap = argparse.ArgumentParser(description="课时课件素材包查询工具")
    ap.add_argument("--prompt", default=None, help="自然语言,如 '三年级上册数学第四单元第1课时'")
    ap.add_argument("--subject", choices=["math", "chinese", "english"])
    ap.add_argument("--grade", type=int, choices=[1, 2, 3, 4, 5, 6])
    ap.add_argument("--term", choices=["term-1", "term-2"])
    ap.add_argument("--unit", default=None, help="unit-4 / 4 / 第四单元 / 名称关键词")
    ap.add_argument("--lesson", default=None, help="课时序号(1)或名称关键词;不传则返回整单元")
    ap.add_argument("--list-units", action="store_true", help="列出某册全部单元")
    ap.add_argument("--search", default=None, help="按关键词跨库检索课时")
    if KB_ROOT is None:
        print(json.dumps({"status": "kb_not_found",
                          "message": "未找到教材知识库目录(需含 manifest.json 与 curriculum/)",
                          "hint": "设置 COURSEWARE_KNOWLEDGE_DIR 或将插件安装到含 plugin/knowledge 的项目。"},
                         ensure_ascii=False))
        sys.exit(1)
    args = ap.parse_args()

    if args.search:
        print(json.dumps(search(args.search), ensure_ascii=False, indent=1))
        return
    subject, grade, term, unit, lesson = args.subject, args.grade, args.term, args.unit, args.lesson
    if args.prompt:
        parsed = parse_prompt(args.prompt)
        subject = subject or parsed["subject"]
        grade = grade or parsed["grade"]
        term = term or parsed["term"]
        unit = unit or parsed["unit"]
        lesson = lesson if args.lesson is not None else parsed["lesson"]
    if args.list_units:
        missing = [k for k, v in (("subject", subject), ("grade", grade), ("term", term)) if not v]
        if missing:
            print(json.dumps({"status": "need_clarification", "missing_fields": missing}, ensure_ascii=False))
            return
        print(json.dumps(list_units(subject, grade, term), ensure_ascii=False, indent=1))
        return
    missing = [k for k, v in (("subject", subject), ("grade", grade), ("term", term)) if not v]
    if missing:
        print(json.dumps({"status": "need_clarification", "missing_fields": missing,
                          "hint": "请补齐: 学科(math/chinese/english) 年级(1-6) 册次(term-1/term-2) 单元(unit-N)"},
                         ensure_ascii=False, indent=1))
        return
    if lesson is not None and not isinstance(lesson, int):
        try:
            lesson = int(lesson)
        except ValueError:
            pass  # 名称关键词
    print(json.dumps(build_material_pack(subject, grade, term, unit, lesson), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
