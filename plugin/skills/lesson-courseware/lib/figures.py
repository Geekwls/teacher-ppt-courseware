# -*- coding: utf-8 -*-
"""声明式图元渲染 (figures): courseware.json 的 figure 块 → 原生 PPT 形状。

不依赖任何外部图片;全部用文本框/矩形/连接线确定性绘制,
保证同输入恒同输出,且课件在 PowerPoint/WPS 中可继续编辑。
"""

import math

from .theme import (add_line, add_rect, add_textbox, fill_text, para, rgb,
                    set_run_font, FONT_SIZES)
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt

_OP_SYMBOL = {"+": "+", "-": "−", "×": "×", "x": "×", "*": "×", "÷": "÷", "/": "÷"}


def render_figure(slide, fig, box, theme):
    """按 kind 分发。box = (x, y, w, h) 英寸。未知 kind 静默跳过(校验器已拦截)。"""
    kind = (fig or {}).get("kind")
    fn = _DISPATCH.get(kind)
    if fn:
        fn(slide, fig, box, theme)


# ---------------------------------------------------------------- 数学
def _vertical_calc(slide, fig, box, theme):
    """竖式:数位右对齐。用等宽数字单元格网格确保对位。"""
    x, y, w, h = box
    a, b = str(fig["operand_a"]), str(fig["operand_b"])
    op = _OP_SYMBOL.get(str(fig.get("operator", "×")), "×")
    result = fig.get("result")
    show_result = fig.get("show_result", result is not None)

    cols = max(len(a), len(b) + 1, len(str(result)) if result is not None else 0) + 1
    cell = min(0.62, max(0.4, w / (cols + 0.5)))
    size = int(cell * 46)
    top = y + 0.15

    def put(text, row, right_col):
        # right_col: 该行最右数字所在列(1 起);符号占 1 列
        bx = x + (cols - right_col - 0.4) * cell
        _, tf = add_textbox(slide, bx, top + row * (cell * 1.25), cell * (right_col + 0.4),
                            cell * 1.2, anchor=MSO_ANCHOR.MIDDLE)
        para(tf, text, size=size, bold=True, color=theme["ink"], align=PP_ALIGN.RIGHT,
             first=True, space_after=0)

    put(a, 0, len(a))
    put(op + " " + b, 1, len(b) + 1)
    line_y = top + 2 * cell * 1.25 - 0.04
    add_line(slide, x + (cols - cols) * 0 + cell * 0.35, line_y,
             x + cols * cell, line_y, color=theme["ink"], width=2.2)
    if show_result and result is not None:
        put(str(result), 2, len(str(result)))


def _number_line(slide, fig, box, theme):
    x, y, w, h = box
    start, end, step = int(fig["start"]), int(fig["end"]), int(fig.get("step", 1))
    if end <= start or step <= 0:
        return
    ticks = list(range(start, end + 1, step))
    n = len(ticks)
    if n < 2:
        return
    pad = 0.35
    line_y = y + h * 0.62
    x0, x1 = x + pad, x + w - pad
    add_line(slide, x0 - 0.25, line_y, x1 + 0.25, line_y, color=theme["ink"], width=2.2)
    gap = (x1 - x0) / (n - 1)
    marks = set(fig.get("marks") or [])
    for i, v in enumerate(ticks):
        tx = x0 + i * gap
        hit = v in marks
        add_line(slide, tx, line_y - 0.09, tx, line_y + 0.09,
                 color=theme["accent"] if hit else theme["ink"],
                 width=2.6 if hit else 1.4)
        _, tf = add_textbox(slide, tx - gap / 2, line_y + 0.12, gap, 0.3)
        para(tf, str(v), size=FONT_SIZES["figure"], bold=hit,
             color=theme["accent"] if hit else theme["muted"],
             align=PP_ALIGN.CENTER, first=True, space_after=0)
        if hit:
            add_rect(slide, tx - 0.07, line_y - 0.31, 0.14, 0.14,
                     fill=theme["accent"], shape=MSO_SHAPE.OVAL)
    label = fig.get("label")
    if label:
        _, tf = add_textbox(slide, x, y, w, 0.34)
        para(tf, label, size=FONT_SIZES["figure"], bold=True, color=theme["primary_dark"],
             align=PP_ALIGN.CENTER, first=True, space_after=0)


def _place_value(slide, fig, box, theme):
    x, y, w, h = box
    digits = fig.get("digits") or {}
    order = [("thousands", "千"), ("hundreds", "百"), ("tens", "十"), ("ones", "个")]
    used = [(k, label) for k, label in order if k in digits] or order
    # 从个位对齐右侧
    cols = len(used)
    cell_w = min(0.9, w / cols)
    table_w = cell_w * cols
    tx = x + (w - table_w) / 2
    label = fig.get("label")
    head_y = y + (0.3 if label else 0)
    if label:
        _, tf = add_textbox(slide, x, y, w, 0.3)
        para(tf, label, size=FONT_SIZES["figure"], bold=True, color=theme["primary_dark"],
             align=PP_ALIGN.CENTER, first=True, space_after=0)
    for i, (k, label_cn) in enumerate(used):
        cx = tx + i * cell_w
        hd = add_rect(slide, cx, head_y, cell_w, 0.42, fill=theme["chip"],
                      line_color=theme["primary"])
        fill_text(hd, label_cn, size=FONT_SIZES["figure"], bold=True,
                  color=theme["primary_dark"], align=PP_ALIGN.CENTER)
        val = str(digits.get(k, "") if k in digits else "")
        cell = add_rect(slide, cx, head_y + 0.42, cell_w, 0.52,
                        fill="FFFFFF", line_color=theme["primary"])
        fill_text(cell, val, size=FONT_SIZES["figure"] + 4, bold=True, color=theme["ink"],
                  align=PP_ALIGN.CENTER)


# ---------------------------------------------------------------- 语文
def _tianzige(slide, fig, box, theme):
    """田字格:外框 + 横竖中线(虚线) + 对角线(虚线),字居中,拼音在上。"""
    x, y, w, h = box
    chars = [str(c) for c in (fig.get("chars") or [])][:6]
    pinyin = fig.get("pinyin") or []
    n = max(1, len(chars))
    gap = 0.22
    cell = min(1.25, (w - gap * (n - 1)) / n, h - 0.42)
    total = cell * n + gap * (n - 1)
    x0 = x + (w - total) / 2
    y0 = y + 0.42
    for i, ch in enumerate(chars):
        cx = x0 + i * (cell + gap)
        if i < len(pinyin) and pinyin[i]:
            _, tf = add_textbox(slide, cx - 0.1, y0 - 0.4, cell + 0.2, 0.36)
            para(tf, str(pinyin[i]), size=14, bold=False, color=theme["muted"],
                 align=PP_ALIGN.CENTER, first=True, space_after=0)
        add_rect(slide, cx, y0, cell, cell, fill="FFFFFF", line_color=theme["bad"], line_w=1.6)
        mid = cell / 2
        add_line(slide, cx, y0 + mid, cx + cell, y0 + mid, color="FCA5A5", width=1.0, dash="dash")
        add_line(slide, cx + mid, y0, cx + mid, y0 + cell, color="FCA5A5", width=1.0, dash="dash")
        add_line(slide, cx, y0, cx + cell, y0 + cell, color="FED7D7", width=0.9, dash="dash")
        add_line(slide, cx + cell, y0, cx, y0 + cell, color="FED7D7", width=0.9, dash="dash")
        _, tf = add_textbox(slide, cx, y0, cell, cell, anchor=MSO_ANCHOR.MIDDLE)
        para(tf, ch, size=int(cell * 40), bold=False, color=theme["ink"],
             align=PP_ALIGN.CENTER, first=True, space_after=0)


def _pinyin_line(slide, fig, box, theme):
    """拼音行:上行拼音、下行汉字,逐字对齐。"""
    x, y, w, h = box
    pairs = (fig.get("pairs") or [])[:12]
    n = max(1, len(pairs))
    gap = 0.08
    cell = min(1.1, (w - gap * (n - 1)) / n)
    total = cell * n + gap * (n - 1)
    x0 = x + (w - total) / 2
    y0 = y + max(0, (h - 0.86) / 2)
    for i, pr in enumerate(pairs):
        cx = x0 + i * (cell + gap)
        _, tf = add_textbox(slide, cx - 0.12, y0, cell + 0.24, 0.4)
        para(tf, str(pr.get("pinyin", "")), size=16, color=theme["muted"],
             align=PP_ALIGN.CENTER, first=True, space_after=0)
        _, tf2 = add_textbox(slide, cx - 0.12, y0 + 0.4, cell + 0.24, 0.52)
        para(tf2, str(pr.get("char", "")), size=26, bold=True, color=theme["ink"],
             align=PP_ALIGN.CENTER, first=True, space_after=0)


# ---------------------------------------------------------------- 英语
def _word_card(slide, fig, box, theme):
    x, y, w, h = box
    cards = (fig.get("cards") or [])[:8]
    n = max(1, len(cards))
    cols = 2 if n > 4 else (n if n <= 3 else 4)
    cols = min(cols, n)
    rows = math.ceil(n / cols)
    gap = 0.18
    card_w = min(2.6, (w - gap * (cols - 1)) / cols)
    card_h = min(1.35, (h - gap * (rows - 1)) / rows)
    total_w = card_w * cols + gap * (cols - 1)
    x0 = x + (w - total_w) / 2
    total_h = card_h * rows + gap * (rows - 1)
    y0 = y + max(0, (h - total_h) / 2)
    for i, card in enumerate(cards):
        r, c = divmod(i, cols)
        cx = x0 + c * (card_w + gap)
        cy = y0 + r * (card_h + gap)
        sp = add_rect(slide, cx, cy, card_w, card_h, fill="FFFFFF",
                      line_color=theme["primary"], line_w=1.4, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        lines = [(str(card.get("word", "")), {"size": 24, "bold": True, "color": theme["primary_dark"]})]
        if card.get("phonetic"):
            lines.append((str(card["phonetic"]), {"size": 14, "color": theme["muted"]}))
        if card.get("meaning"):
            lines.append((str(card["meaning"]), {"size": 15, "color": theme["ink"]}))
        fill_text(sp, lines, align=PP_ALIGN.CENTER, line_spacing=1.05)


def _dialog_bubble(slide, fig, box, theme):
    x, y, w, h = box
    lines = (fig.get("lines") or [])[:8]
    bubble_h = min(0.78, (h - 0.12 * max(0, len(lines) - 1)) / max(1, len(lines)))
    bubble_w = w * 0.72
    speakers = {}
    for i, ln in enumerate(lines):
        sp_name = str(ln.get("speaker", "?"))
        if sp_name not in speakers:
            speakers[sp_name] = len(speakers)
        left = speakers[sp_name] % 2 == 0
        by = y + i * (bubble_h + 0.12)
        bx = x + (0.15 if left else w - bubble_w - 0.15)
        shape = MSO_SHAPE.ROUNDED_RECTANGLE
        sp = add_rect(slide, bx, by, bubble_w, bubble_h, fill=theme["chip"] if left else "FFFFFF",
                      line_color=theme["primary"], line_w=1.2, shape=shape)
        tf = sp.text_frame
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.LEFT
        r1 = p.add_run(); r1.text = f"{sp_name}: "
        set_run_font(r1, 18, bold=True, color=theme["primary_dark"])
        r2 = p.add_run(); r2.text = str(ln.get("text", ""))
        set_run_font(r2, 18, color=theme["ink"])


# ---------------------------------------------------------------- 通用
def _table(slide, fig, box, theme):
    x, y, w, h = box
    headers = [str(x_) for x_ in (fig.get("headers") or [])]
    rows = [[str(c) for c in row] for row in (fig.get("rows") or [])][:8]
    if not headers or not rows:
        return
    label = fig.get("label")
    ty = y + (0.32 if label else 0)
    if label:
        _, tf = add_textbox(slide, x, y, w, 0.3)
        para(tf, str(label), size=FONT_SIZES["figure"], bold=True, color=theme["primary_dark"],
             align=PP_ALIGN.CENTER, first=True, space_after=0)
    n_rows, n_cols = len(rows) + 1, len(headers)
    gt = slide.shapes.add_table(n_rows, n_cols, Inches(x), Inches(ty), Inches(w),
                                Inches(min(h - (ty - y), 0.5 * n_rows))).table
    for j, htext in enumerate(headers):
        cell = gt.cell(0, j)
        cell.text = ""
        p = cell.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        r = p.add_run(); r.text = htext
        set_run_font(r, FONT_SIZES["figure"], bold=True, color="FFFFFF")
        cell.fill.solid(); cell.fill.fore_color.rgb = rgb(theme["primary"])
    for i, row in enumerate(rows, start=1):
        for j in range(n_cols):
            cell = gt.cell(i, j)
            cell.text = ""
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER
            r = p.add_run()
            r.text = row[j] if j < len(row) else ""
            set_run_font(r, FONT_SIZES["figure"], color=theme["ink"])
            cell.fill.solid()
            cell.fill.fore_color.rgb = rgb("FFFFFF" if i % 2 else theme["panel"])


_DISPATCH = {
    "vertical_calc": _vertical_calc,
    "number_line": _number_line,
    "place_value": _place_value,
    "tianzige": _tianzige,
    "pinyin_line": _pinyin_line,
    "word_card": _word_card,
    "dialog_bubble": _dialog_bubble,
    "table": _table,
}
