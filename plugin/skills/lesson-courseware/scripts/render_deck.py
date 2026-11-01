#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""课件确定性渲染器入口 (render_deck): courseware.json → .pptx。

- 结构错误一律拒绝渲染(exit 1),绝不输出残次课件;
- practice 页默认自动追加"参考答案"页(不占用模型输出页数);
- 教师讲稿写入每页备注栏;
- knowledge 库核验状态为 partial 时,页脚自动附提示语。

用法: python render_deck.py --input courseware.json --outdir output/
"""

import argparse
import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_SKILL = os.path.dirname(_HERE)
sys.path.insert(0, _SKILL)

from lib import layouts  # noqa: E402
from lib.deck_schema import check_structure  # noqa: E402
from lib.theme import THEMES, footer_of  # noqa: E402
from lib.theme import draw_page_frame  # noqa: E402

from pptx import Presentation  # noqa: E402
from pptx.util import Inches  # noqa: E402


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.loads(f.read().encode("utf-8").decode("utf-8-sig"))


def sanitize_filename(name, fallback):
    name = re.sub(r'[\\/:*?"<>|\r\n]+', "", str(name or "")).strip()
    return (name or fallback)[:80]


def build_deck(data):
    meta = data["metadata"]
    theme_name = meta["subject"]
    evidence = data.get("curriculum_evidence") or {}
    status = evidence.get("curriculum_status", "missing")

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    footer = footer_of(meta)
    if status != "verified":
        footer += "  |  内容依据人教版教材整理,使用前请核对"

    page_no = 0
    rendered = 0
    for s in data.get("slides", []):
        stype = s.get("type")
        fn = layouts.LAYOUTS.get(stype)
        if fn is None:
            continue

        if stype == "practice":
            # 练习页走确定性自动升页:题量超一页时拆分,且每页配套参考答案页
            chunks = layouts.plan_practice_chunks(s)
            show_answers = bool(s.get("show_answers"))
            base_title = s.get("title", "课堂练习")
            for ci, chunk in enumerate(chunks):
                page_no += 1
                slide = prs.slides.add_slide(blank)
                part = dict(s, items=chunk)
                part["title"] = base_title if (ci == 0 or len(chunks) == 1) else f"{base_title}(续{ci})"
                ctx = {"t": THEMES[theme_name], "meta": meta, "page_no": page_no,
                       "footer": footer, "theme": theme_name}
                layouts.render_practice(slide, part, ctx)
                draw_page_frame(slide, theme_name, title_text=part["title"],
                                footer_text=footer, page_no=page_no)
                if s.get("notes"):
                    slide.notes_slide.notes_text_frame.text = s["notes"].strip()
                rendered += 1
                if not show_answers:
                    page_no += 1
                    ans_slide = prs.slides.add_slide(blank)
                    layouts.render_answer_page(ans_slide, part, dict(ctx, page_no=page_no))
                    draw_page_frame(ans_slide, theme_name,
                                    title_text=f"{part['title']} · 参考答案",
                                    footer_text=footer, page_no=page_no)
                    ans_slide.notes_slide.notes_text_frame.text = "本页为参考答案,投影时按需切换。"
                    rendered += 1
            continue

        page_no += 1
        slide = prs.slides.add_slide(blank)
        ctx = {"t": THEMES[theme_name], "meta": meta, "page_no": page_no,
               "footer": footer, "theme": theme_name}
        fn(slide, s, ctx)
        if stype not in ("cover", "end"):
            draw_page_frame(slide, theme_name, title_text=s.get("title"),
                            footer_text=footer, page_no=page_no)
        notes = (s.get("notes") or "").strip()
        if notes:
            slide.notes_slide.notes_text_frame.text = notes
        rendered += 1
    return prs, rendered


def main():
    ap = argparse.ArgumentParser(description="课件渲染器: courseware.json → pptx")
    ap.add_argument("--input", required=True)
    ap.add_argument("--outdir", default="output")
    args = ap.parse_args()

    data = load_json(args.input)
    errors = [i for i in check_structure(data) if i["severity"] == "error"]
    if errors:
        print(json.dumps({"status": "fail", "stage": "render_precheck", "errors": errors},
                         ensure_ascii=False, indent=1))
        sys.exit(1)

    prs, rendered = build_deck(data)
    os.makedirs(args.outdir, exist_ok=True)
    title = data.get("metadata", {}).get("title") or data.get("deck_id", "courseware")
    out_path = os.path.join(args.outdir, sanitize_filename(title, data.get("deck_id", "courseware")) + ".pptx")
    prs.save(out_path)

    src_copy = os.path.join(args.outdir, os.path.basename(args.input))
    if os.path.abspath(src_copy) != os.path.abspath(args.input):
        with open(args.input, "rb") as fi, open(src_copy, "wb") as fo:
            fo.write(fi.read())

    warnings = layouts.RENDER_WARNINGS[:] if hasattr(layouts, "RENDER_WARNINGS") else []
    print(json.dumps({"status": "ok", "output": os.path.abspath(out_path),
                      "slide_count": rendered,
                      "deck_id": data.get("deck_id"),
                      "curriculum_status": data.get("curriculum_evidence", {}).get("curriculum_status"),
                      "warnings": warnings},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
