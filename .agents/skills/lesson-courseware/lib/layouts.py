# -*- coding: utf-8 -*-
"""版式组件库 (layouts): 11 种幻灯片类型 + 自动答案页。

每种版式一个 render_* 函数,签名 (slide, s, ctx)。
ctx: {"t": theme tokens, "meta": deck metadata, "page_no": int, "footer": str, "theme": name}
"""

import math

from .figures import render_figure
from .theme import (CANVAS_H, CANVAS_W, FONT_SIZES, SUBJECT_LABEL, TERM_LABEL,
                    add_rect, add_textbox, fill_text, para)
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

CONTENT_TOP = 1.3
CONTENT_BOTTOM = 7.0

# 渲染期警告(如内容溢出被截断),由 render_deck 汇总输出,绝不静默
RENDER_WARNINGS = []


def _estimate_lines(text, width_in, size=22):
    chars_per_line = max(8, int(width_in * (52.0 / size)))
    return max(1, math.ceil(len(str(text)) / chars_per_line))


def _numbered_list(slide, items, x, y, w, t, number_color=None, size=None, max_bottom=CONTENT_BOTTOM):
    """带彩色序号圆片的条目列表,行高按内容自适应。"""
    size = size or FONT_SIZES["body"]
    cy = y
    for i, item in enumerate([str(x_) for x_ in items], start=1):
        lines = _estimate_lines(item, w - 0.75, size)
        row_h = lines * (size / 72.0 * 1.35) + 0.22
        if cy + row_h > max_bottom + 0.4:
            break
        chip = add_rect(slide, x, cy + 0.06, 0.42, 0.42, fill=number_color or t["primary"],
                        shape=MSO_SHAPE.OVAL)
        fill_text(chip, str(i), size=17, bold=True, color="FFFFFF", align=PP_ALIGN.CENTER)
        _, tf = add_textbox(slide, x + 0.6, cy, w - 0.65, row_h)
        para(tf, item, size=size, color=t["ink"], first=True, space_after=0, line_spacing=1.2)
        cy += row_h + 0.12
    return cy


def _source_note(slide, s, t):
    src = s.get("source") or {}
    bits = []
    if src.get("point_id"):
        bits.append(f"依据知识点 {src['point_id']}")
    if src.get("textbook_page"):
        bits.append(f"教材 P{src['textbook_page']}")
    if not bits:
        return
    _, tf = add_textbox(slide, CANVAS_W - 4.6, CANVAS_H - 0.72, 4.2, 0.3)
    para(tf, "· ".join(bits), size=11, color=t["muted"], align=PP_ALIGN.RIGHT,
         first=True, space_after=0)


# ---------------------------------------------------------------- 封面/结束
def render_cover(slide, s, ctx):
    t, meta = ctx["t"], ctx["meta"]
    add_rect(slide, 0, 0, CANVAS_W, CANVAS_H, fill=t["bg_tint"])
    add_rect(slide, 0, 0, CANVAS_W, 0.18, fill=t["primary"])
    add_rect(slide, 0, CANVAS_H - 0.18, CANVAS_W, 0.18, fill=t["primary"])
    _, tf = add_textbox(slide, 1.0, 2.3, CANVAS_W - 2.0, 1.3, anchor=MSO_ANCHOR.MIDDLE)
    para(tf, s.get("title", meta.get("title", "")), size=FONT_SIZES["cover_title"], bold=True,
         color=t["primary_dark"], align=PP_ALIGN.CENTER, first=True, space_after=0)
    if s.get("subtitle") or meta.get("subtitle"):
        _, tf = add_textbox(slide, 1.0, 3.7, CANVAS_W - 2.0, 0.7)
        para(tf, s.get("subtitle") or meta.get("subtitle", ""), size=FONT_SIZES["cover_subtitle"],
             color=t["ink"], align=PP_ALIGN.CENTER, first=True, space_after=0)
    subject = SUBJECT_LABEL.get(meta.get("subject", ""), "")
    meta_bits = [f"人教版·{subject}·{meta.get('grade', '')}年级{TERM_LABEL.get(meta.get('term', ''), '')}",
                 meta.get("unit_name", "")]
    if meta.get("lesson_name"):
        meta_bits.append(meta["lesson_name"])
    if meta.get("class_period_label"):
        meta_bits.append(meta["class_period_label"])
    _, tf = add_textbox(slide, 1.0, 5.6, CANVAS_W - 2.0, 0.5)
    para(tf, " · ".join(b for b in meta_bits if b), size=FONT_SIZES["meta"], color=t["muted"],
         align=PP_ALIGN.CENTER, first=True, space_after=0)
    who = "  ".join(x for x in [meta.get("school", ""), meta.get("teacher_name", "")
                                and f"授课教师:{meta['teacher_name']}"] if x)
    if who:
        _, tf = add_textbox(slide, 1.0, 6.2, CANVAS_W - 2.0, 0.4)
        para(tf, who, size=FONT_SIZES["meta"], color=t["muted"], align=PP_ALIGN.CENTER,
             first=True, space_after=0)


def render_end(slide, s, ctx):
    t = ctx["t"]
    add_rect(slide, 0, 0, CANVAS_W, CANVAS_H, fill=t["bg_tint"])
    _, tf = add_textbox(slide, 1.0, 3.0, CANVAS_W - 2.0, 1.2, anchor=MSO_ANCHOR.MIDDLE)
    para(tf, s.get("message", "下课啦,同学们再见!"), size=36, bold=True, color=t["primary_dark"],
         align=PP_ALIGN.CENTER, first=True, space_after=0)


# ---------------------------------------------------------------- 列表型页面
def render_objectives(slide, s, ctx):
    t = ctx["t"]
    _numbered_list(slide, s.get("items") or [], 1.0, CONTENT_TOP + 0.25, CANVAS_W - 2.0, t,
                   size=FONT_SIZES["body_large"])
    _source_note(slide, s, t)


def render_warmup(slide, s, ctx):
    t = ctx["t"]
    _numbered_list(slide, s.get("items") or [], 1.0, CONTENT_TOP + 0.25, CANVAS_W - 2.0, t,
                   number_color=t["accent"])
    _source_note(slide, s, t)


def render_summary(slide, s, ctx):
    t = ctx["t"]
    items = []
    for it in s.get("items") or []:
        items.append(f"✔ {it}" if isinstance(it, str) else str(it))
    cy = CONTENT_TOP + 0.25
    for it in items:
        lines = _estimate_lines(it, CANVAS_W - 2.2)
        row_h = lines * 0.42 + 0.2
        box = add_rect(slide, 1.0, cy, CANVAS_W - 2.0, row_h, fill=t["bg_tint"],
                       shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        fill_text(box, it, size=FONT_SIZES["body_large"], color=t["ink"])
        cy += row_h + 0.15
    _source_note(slide, s, t)


def render_homework(slide, s, ctx):
    t = ctx["t"]
    _numbered_list(slide, s.get("items") or [], 1.0, CONTENT_TOP + 0.25, CANVAS_W - 2.0, t)


# ---------------------------------------------------------------- 新知/例题/易错
def render_concept(slide, s, ctx):
    t = ctx["t"]
    steps = [str(x_) for x_ in (s.get("steps") or [])]
    callout = s.get("callout")
    body_h = CONTENT_BOTTOM - CONTENT_TOP - (0.9 if callout else 0.15)
    has_fig = bool(s.get("figure"))
    if has_fig:
        half_w = (CANVAS_W - 2.0) * 0.42
        fig_box = (0.6, CONTENT_TOP + 0.2, half_w, body_h - 0.3)
        render_figure(slide, s["figure"], fig_box, t)
        x, w = 0.6 + half_w + 0.35, (CANVAS_W - 2.0) - half_w - 0.35
    else:
        x, w = 1.0, CANVAS_W - 2.0
    _numbered_list(slide, steps, x, CONTENT_TOP + 0.2, w, t, max_bottom=CONTENT_TOP + body_h)
    if callout:
        box = add_rect(slide, 1.0, CONTENT_BOTTOM - 0.85, CANVAS_W - 2.0, 0.75,
                       fill=t["chip"], line_color=t["primary"], line_w=1.4,
                       shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        fill_text(box, f"★ {callout}", size=FONT_SIZES["callout"], bold=True,
                  color=t["primary_dark"], align=PP_ALIGN.CENTER)
    _source_note(slide, s, t)


def render_example(slide, s, ctx):
    t = ctx["t"]
    title = s.get("title", "例题")
    problem_box = add_rect(slide, 0.7, CONTENT_TOP + 0.05, CANVAS_W - 1.4, 0.95,
                           fill=t["panel"], line_color=t["primary"], line_w=1.2,
                           shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    fill_text(problem_box, [(title, {"size": 18, "bold": True, "color": t["primary_dark"]}),
                            (s.get("problem", ""), {"size": FONT_SIZES["body_large"],
                                                    "bold": True, "color": t["ink"]})],
              anchor=MSO_ANCHOR.MIDDLE)
    body_top = CONTENT_TOP + 1.2
    answer = s.get("answer", "")
    steps_h = CONTENT_BOTTOM - body_top - (0.6 if answer else 0.15)
    has_fig = bool(s.get("figure"))
    if has_fig:
        fig_w = (CANVAS_W - 1.6) * 0.4
        render_figure(slide, s["figure"], (0.7, body_top, fig_w, steps_h), t)
        sx, sw = 0.7 + fig_w + 0.3, (CANVAS_W - 1.6) - fig_w - 0.3
    else:
        sx, sw = 1.0, CANVAS_W - 2.0
    cy = body_top
    for i, step in enumerate([str(x_) for x_ in (s.get("solution_steps") or [])], start=1):
        lines = _estimate_lines(step, sw - 0.75)
        row_h = lines * 0.38 + 0.16
        chip = add_rect(slide, sx, cy + 0.04, 0.38, 0.38, fill=t["accent"], shape=MSO_SHAPE.OVAL)
        fill_text(chip, str(i), size=15, bold=True, color="FFFFFF", align=PP_ALIGN.CENTER)
        _, tf = add_textbox(slide, sx + 0.55, cy, sw - 0.6, row_h)
        para(tf, step, size=FONT_SIZES["body"], color=t["ink"], first=True, space_after=0)
        cy += row_h + 0.1
    if answer:
        box = add_rect(slide, sx, CONTENT_BOTTOM - 0.72, sw, 0.62, fill="DCFCE7",
                       line_color=t["good"], line_w=1.2, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        fill_text(box, f"答:{answer}", size=FONT_SIZES["body"], bold=True, color="14532D")
    _source_note(slide, s, t)


def render_misconception(slide, s, ctx):
    t = ctx["t"]
    rows = [
        ("✗ 错例", s.get("wrong", ""), "FEE2E2", t["bad"], MSO_SHAPE.ROUNDED_RECTANGLE),
        ("✗ 错因", s.get("reason", ""), t["panel"], t["ink"], MSO_SHAPE.ROUNDED_RECTANGLE),
        ("✓ 正解", s.get("correct", ""), "DCFCE7", "14532D", MSO_SHAPE.ROUNDED_RECTANGLE),
    ]
    y = CONTENT_TOP + 0.3
    for label, text, fill_c, text_c, shp in rows:
        lines = max(1, _estimate_lines(text, CANVAS_W - 3.4))
        box_h = lines * 0.42 + 0.5
        tag = add_rect(slide, 0.9, y, 1.3, 0.5, fill=fill_c, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        fill_text(tag, label, size=17, bold=True, color=text_c, align=PP_ALIGN.CENTER)
        box = add_rect(slide, 2.35, y, CANVAS_W - 3.35, box_h, fill=fill_c,
                       line_color=t["muted"], line_w=0.5, shape=shp)
        fill_text(box, text, size=FONT_SIZES["body_large"], bold=(label == "✓ 正解"),
                  color=text_c)
        y += box_h + 0.28
    _source_note(slide, s, t)


# ---------------------------------------------------------------- 练习(自动升页 + 配套答案页)
def _practice_stem(item):
    stem = str(item.get("stem", ""))
    opts = item.get("options")
    if opts:
        stem = stem + "    " + "      ".join(str(o) for o in opts)
    return stem


def _practice_item_height(item, show_answer, w):
    """单个条目的版面占用: (row_h, need)。need 含答案框。"""
    stem = _practice_stem(item)
    lines = _estimate_lines(stem, w - 0.8)
    row_h = lines * 0.4 + 0.24
    need = row_h + (0.62 if (show_answer and item.get("answer")) else 0.0)
    return row_h, need


def plan_practice_chunks(s, w=None):
    """把练习条目按物理容量切页(确定性装箱):返回 [chunk1, chunk2, ...]。
    条目带 _no(全局题号),续页编号不重排。"""
    w = w or (CANVAS_W - 2.0)
    items = [dict(it, _no=i + 1) for i, it in enumerate(s.get("items") or [])]
    chunks, cur, cy = [], [], CONTENT_TOP + 0.15
    show_answer = True  # 答案页按带答案高度规划,保证答案页也放得下
    for item in items:
        _, need = _practice_item_height(item, show_answer, w)
        if cur and cy + need > CONTENT_BOTTOM + 0.02:
            chunks.append(cur)
            cur, cy = [], CONTENT_TOP + 0.15
        cur.append(item)
        cy += need + 0.1
    if cur:
        chunks.append(cur)
    return chunks or [[]]


def _practice_items(slide, s, ctx, show_answer):
    t = ctx["t"]
    items = s.get("items") or []
    cy = CONTENT_TOP + 0.15
    w = CANVAS_W - 2.0
    for i, item in enumerate(items, start=1):
        stem = _practice_stem(item)
        row_h, _ = _practice_item_height(item, show_answer, w)
        num = add_rect(slide, 0.85, cy + 0.05, 0.4, 0.4, fill=t["primary"], shape=MSO_SHAPE.OVAL)
        fill_text(num, str(item.get("_no", i)), size=16, bold=True, color="FFFFFF", align=PP_ALIGN.CENTER)
        _, tf = add_textbox(slide, 1.45, cy, w - 0.6, row_h)
        para(tf, stem, size=FONT_SIZES["body"], color=t["ink"], first=True, space_after=0,
             line_spacing=1.18)
        cy += row_h + 0.1
        if show_answer and item.get("answer"):
            ans_box = add_rect(slide, 1.45, cy, w - 1.1, 0.52, fill="DCFCE7",
                               shape=MSO_SHAPE.ROUNDED_RECTANGLE)
            fill_text(ans_box, f"答案:{item['answer']}", size=18, bold=True, color="14532D")
            cy += 0.62
        if cy > CONTENT_BOTTOM:
            break


def render_practice(slide, s, ctx):
    t = ctx["t"]
    _practice_items(slide, s, ctx, show_answer=bool(s.get("show_answers")))
    if not s.get("show_answers") and ctx.get("on_answer_page"):
        pass


def render_answer_page(slide, s, ctx):
    """practice 的自动答案页(渲染器生成,不占用模型输出页数)。"""
    t = ctx["t"]
    title = f"{s.get('title', '课堂练习')} · 参考答案"
    ctx2 = dict(ctx, on_answer_page=True)
    _practice_items(slide, dict(s, title=title), ctx2, show_answer=True)


# ---------------------------------------------------------------- 板书
def render_board(slide, s, ctx):
    t = ctx["t"]
    panel = add_rect(slide, 0.7, CONTENT_TOP + 0.1, CANVAS_W - 1.4, CONTENT_BOTTOM - CONTENT_TOP - 0.2,
                     fill="14532D", line_color="78350F", line_w=4)
    tf = panel.text_frame
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = tf.margin_right = Inches(0.35)
    lines = str(s.get("content", "")).split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.space_after = Pt(8)
        p.line_spacing = 1.25
        run = p.add_run()
        run.text = line if line.strip() else " "
        size = 20 if len(line) < 40 else 17
        from .theme import set_run_font
        set_run_font(run, size, bold=line.strip().startswith(("口算", "方法", "易错")),
                     color="FDE68A" if i == 0 else "ECFDF5")


LAYOUTS = {
    "cover": render_cover, "objectives": render_objectives, "warmup": render_warmup,
    "concept": render_concept, "example": render_example, "misconception": render_misconception,
    "practice": render_practice, "summary": render_summary, "board": render_board,
    "homework": render_homework, "end": render_end,
}
