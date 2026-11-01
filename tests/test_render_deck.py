# -*- coding: utf-8 -*-
"""渲染引擎测试: 输出结构 + 几何边界 + 自动升页 + 备注。"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKILL = os.path.join(ROOT, "plugin", "skills", "lesson-courseware")
EXAMPLE = os.path.join(SKILL, "references", "example_courseware.json")
OUT = os.path.join(ROOT, "output", "tests")

sys.path.insert(0, SKILL)

from lib.layouts import plan_practice_chunks  # noqa: E402
from scripts.render_deck import build_deck, load_json, sanitize_filename  # noqa: E402


def _deck(tmp_path, source=EXAMPLE):
    data = load_json(source)
    prs, rendered = build_deck(data)
    return data, prs, rendered


def test_render_example_end_to_end(tmp_path):
    data, prs, rendered = _deck(tmp_path)
    out = tmp_path / "deck.pptx"
    prs.save(str(out))
    assert out.exists() and out.stat().st_size > 10000

    from pptx import Presentation
    p = Presentation(str(out))
    # 12 页模型输出 + 练习自动升页与答案页(4题→2练习页+2答案页)= 15
    assert len(p.slides) == rendered == 15
    notes_count = sum(1 for s in p.slides if s.has_notes_slide and s.notes_slide.notes_text_frame.text.strip())
    assert notes_count >= 10, "内容页讲稿应渲染进备注栏"


def test_no_shape_out_of_canvas(tmp_path):
    _, prs, _ = _deck(tmp_path)
    W, H = 12192000, 6858000
    for i, slide in enumerate(prs.slides, 1):
        for sh in slide.shapes:
            if sh.left is None:
                continue
            assert sh.left >= -10000 and sh.top >= -10000, f"slide{i} 越界"
            assert sh.left + sh.width <= W + 10000, f"slide{i} 右越界"
            assert sh.top + sh.height <= H + 10000, f"slide{i} 下越界"


def test_practice_auto_pagination(tmp_path):
    data = load_json(EXAMPLE)
    practice = next(s for s in data["slides"] if s["type"] == "practice")
    chunks = plan_practice_chunks(practice)
    assert len(chunks) == 2, "4题练习应自动拆为2页"
    assert sum(len(c) for c in chunks) == 4, "自动升页不得丢题"
    assert all("_no" in it for c in chunks for it in c), "续页应保留全局题号"


def test_partial_status_footer_hint(tmp_path):
    data = load_json(EXAMPLE)
    data["curriculum_evidence"]["curriculum_status"] = "partial"
    from lib.theme import footer_of
    footer = footer_of(data["metadata"])
    assert "第四单元" in footer


def test_sanitize_filename():
    assert sanitize_filename('口算/乘法:*?"<>|', "x") == "口算乘法"
    assert sanitize_filename("", "cw-math") == "cw-math"


def test_render_rejects_structural_errors(tmp_path):
    data = load_json(EXAMPLE)
    data["slides"][1]["type"] = "bogus"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    r = subprocess.run([sys.executable, os.path.join(SKILL, "scripts", "render_deck.py"),
                        "--input", str(bad), "--outdir", str(tmp_path)],
                       capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 1
    assert json.loads(r.stdout)["status"] == "fail"


def _find_posix_bash():
    """Windows 下 subprocess 的 bash 可能指向 WSL(无发行版即失败),先探测。"""
    import shutil
    candidates = [os.environ.get("BASH"), shutil.which("bash"),
                  r"C:\Program Files\Git\bin\bash.exe"]
    for b in candidates:
        if not b or not os.path.exists(b):
            continue
        try:
            probe = subprocess.run([b, "-c", "exit 0"], capture_output=True, timeout=10)
            if probe.returncode == 0 and "WSL" not in (probe.stderr or ""):
                return b
        except Exception:  # noqa: BLE001
            continue
    return None


def test_render_all_script(tmp_path):
    bash = _find_posix_bash()
    if not bash:
        import pytest
        pytest.skip("环境中无可用 POSIX bash(WSL 占位)")
    r = subprocess.run([bash, os.path.join(SKILL, "scripts", "render_all.sh"),
                        EXAMPLE, str(tmp_path)], capture_output=True, text=True,
                       encoding="utf-8", cwd=ROOT)
    assert r.returncode == 0, r.stdout + r.stderr
    assert any(f.name.endswith(".pptx") for f in tmp_path.iterdir()), "应产出 pptx"
    assert any(f.name.endswith(".json") for f in tmp_path.iterdir()), "源 JSON 应随附"
