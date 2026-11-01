# -*- coding: utf-8 -*-
"""query_curriculum 查询工具测试(直连真实知识库)。"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRIPT = os.path.join(ROOT, "plugin", "skills", "lesson-courseware", "scripts", "query_curriculum.py")

sys.path.insert(0, os.path.dirname(SCRIPT))


def run(*args):
    r = subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True,
                       encoding="utf-8", cwd=ROOT)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_parse_prompt_math():
    from query_curriculum import parse_prompt
    p = parse_prompt("三年级上册数学第四单元第1课时")
    assert (p["subject"], p["grade"], p["term"], p["unit"], p["lesson"]) == \
        ("math", 3, "term-1", "unit-4", 1)
    assert p["missing_fields"] == []


def test_parse_prompt_chinese_ke_numbering():
    from query_curriculum import parse_prompt
    p = parse_prompt("三年级上册语文第二单元第5课")
    assert (p["subject"], p["unit"], p["lesson"]) == ("chinese", "unit-2", 5)


def test_parse_prompt_missing_fields():
    from query_curriculum import parse_prompt
    p = parse_prompt("做个课件")
    assert set(p["missing_fields"]) == {"subject", "grade", "term", "unit"}


def test_material_pack_math_lesson():
    out = run("--prompt", "三年级上册数学第四单元第1课时")
    assert out["status"] == "ok"
    assert out["resolution"]["unit_name"].startswith("第四单元")
    assert out["unit"]["verification_status"] == "verified"
    assert out["unit"]["numeric_upper_bound"] == 10000
    assert out["lesson"]["lesson_number"] == 1
    assert out["lesson"]["official_examples"], "应含教材例题"
    assert any("坐过山车" in str(ex.get("title", "")) for ex in out["lesson"]["official_examples"])
    assert out["knowledge_points"], "应按课时过滤出知识点"
    assert out["teaching_reference"], "应含教参重难点"
    assert all(tr["point_id"] in {kp["point_id"] for kp in out["knowledge_points"]}
               for tr in out["teaching_reference"])


def test_material_pack_chinese_lesson():
    out = run("--prompt", "三年级上册语文第二单元第5课")
    assert out["status"] == "ok"
    assert "铺满金色巴掌的水泥道" in out["lesson"]["lesson_name"]
    assert out["knowledge_points"] and out["teaching_reference"]


def test_material_pack_english_whole_unit():
    out = run("--prompt", "四年级上册英语第一单元")
    assert out["status"] == "ok"
    assert out["knowledge_points"], "整单元查询应返回全部知识点"


def test_lesson_not_found_returns_candidates():
    out = run("--prompt", "三年级上册语文第二单元第99课")
    assert out["status"] == "need_clarification"
    assert out["lessons_index"], "报错应附课时索引供选择"


def test_unknown_unit_not_found():
    out = run("--subject", "math", "--grade", "5", "--term", "term-2", "--unit", "unit-3")
    assert out["status"] == "not_found"  # 五年级下册数学未建库,如实返回


def test_list_units():
    out = run("--list-units", "--subject", "math", "--grade", "3", "--term", "term-1")
    assert out["status"] == "ok"
    ids = [u["unit_id"] for u in out["units"]]
    assert "unit-4" in ids


def test_search_hits():
    out = run("--search", "口算乘法")
    assert out["status"] == "ok"
    assert out["hits"], "口算乘法应命中"
    assert all(h["subject"] == "math" for h in out["hits"])
