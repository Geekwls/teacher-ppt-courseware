# -*- coding: utf-8 -*-
"""主题 tokens 与底层绘制原语 (theme)。

防近视大字号纪律:正文≥20pt,标题≥28pt;教室后排可读是硬标准。
所有绘制函数以英寸(Inches)为单位,画布 13.333 x 7.5 (16:9)。
"""

from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt
from pptx.oxml.ns import qn

# ---------------------------------------------------------------- 学科主题
THEMES = {
    "math": {"primary": "2563EB", "primary_dark": "1D4ED8", "accent": "F59E0B",
             "bg_tint": "EFF6FF", "chip": "DBEAFE", "good": "16A34A", "bad": "DC2626",
             "ink": "1F2937", "muted": "6B7280", "panel": "F8FAFC"},
    "chinese": {"primary": "B91C1C", "primary_dark": "7F1D1D", "accent": "D97706",
                "bg_tint": "FEF2F2", "chip": "FEE2E2", "good": "15803D", "bad": "B91C1C",
                "ink": "1F2937", "muted": "6B7280", "panel": "FFFBF5"},
    "english": {"primary": "059669", "primary_dark": "047857", "accent": "F59E0B",
                "bg_tint": "ECFDF5", "chip": "D1FAE5", "good": "15803D", "bad": "DC2626",
                "ink": "1F2937", "muted": "6B7280", "panel": "F8FAFC"},
}

FONT = "微软雅黑"
FONT_SIZES = {
    "cover_title": 44, "cover_subtitle": 24, "title": 30, "body": 22, "body_large": 24,
    "callout": 22, "figure": 20, "meta": 16, "footer": 11,
}
SUBJECT_LABEL = {"math": "数学", "chinese": "语文", "english": "英语"}
TERM_LABEL = {"term-1": "上册", "term-2": "下册"}
CANVAS_W, CANVAS_H = 13.333, 7.5


def rgb(hexstr):
    return RGBColor.from_string(hexstr)


# ---------------------------------------------------------------- 文本原语
def set_run_font(run, size, bold=False, color="1F2937", italic=False, font=FONT):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = rgb(color)
    run.font.name = font
    rPr = run._r.get_or_add_rPr()
    for tag in ("a:latin", "a:ea"):
        e = rPr.find(qn(tag))
        if e is None:
            e = rPr.makeelement(qn(tag), {})
            rPr.append(e)
        e.set("typeface", font)


def add_textbox(slide, x, y, w, h, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.05)
    tf.margin_top = tf.margin_bottom = Inches(0.02)
    return box, tf


def para(tf, text, size=None, bold=False, color=None, align=PP_ALIGN.LEFT,
         space_after=6, line_spacing=1.15, first=False, bullet_prefix=None):
    """追加(或首用)一个段落。first=True 时复用自带空段落。"""
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    p.space_after = Pt(space_after)
    p.line_spacing = line_spacing
    run = p.add_run()
    run.text = text
    set_run_font(run, size if size is not None else FONT_SIZES["body"], bold=bold,
                 color=color or "1F2937")
    return p


# ---------------------------------------------------------------- 形状原语
def add_rect(slide, x, y, w, h, fill=None, line_color=None, line_w=0.75,
             shape=MSO_SHAPE.RECTANGLE, shadow=False, dash=None):
    sp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        sp.fill.background()
    else:
        sp.fill.solid()
        sp.fill.fore_color.rgb = rgb(fill)
    if line_color is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = rgb(line_color)
        sp.line.width = Pt(line_w)
    sp.shadow.inherit = False
    tf = sp.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.08)
    tf.margin_top = tf.margin_bottom = Inches(0.04)
    return sp


def add_line(slide, x1, y1, x2, y2, color="1F2937", width=1.5, dash=None):
    from pptx.enum.shapes import MSO_CONNECTOR
    ln = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1),
                                    Inches(x2), Inches(y2))
    ln.line.color.rgb = rgb(color)
    ln.line.width = Pt(width)
    ln.shadow.inherit = False
    if dash:
        try:
            from pptx.enum.line import MSO_LINE_DASH_STYLE
            ln.line.dash_style = MSO_LINE_DASH_STYLE.DASH
        except ImportError:
            pass
    return ln


def fill_text(sp, lines, size=None, bold=False, color=None, align=PP_ALIGN.LEFT,
              anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.12):
    """向形状文本框写入多行文本。lines: str 或 [str] 或 [(text, dict_overrides)]"""
    tf = sp.text_frame
    tf.vertical_anchor = anchor
    if isinstance(lines, str):
        lines = [lines]
    for i, item in enumerate(lines):
        if isinstance(item, tuple):
            text, override = item
        else:
            text, override = item, {}
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = override.get("align", align)
        p.space_after = Pt(override.get("space_after", 4))
        p.line_spacing = line_spacing
        run = p.add_run()
        run.text = text
        set_run_font(run, override.get("size", size or FONT_SIZES["body"]),
                     bold=override.get("bold", bold), color=override.get("color", color or "1F2937"))
    return sp


# ---------------------------------------------------------------- 版面构件
def draw_page_frame(slide, theme, title_text=None, footer_text=None, page_no=None):
    """内容页统一框架:顶部细色条 + 标题(左竖条强调) + 页脚。"""
    t = THEMES[theme]
    add_rect(slide, 0, 0, CANVAS_W, 0.09, fill=t["primary"])
    y = 0.32
    if title_text:
        add_rect(slide, 0.5, y + 0.05, 0.14, 0.62, fill=t["accent"])
        _, tf = add_textbox(slide, 0.78, y, CANVAS_W - 1.3, 0.8, anchor=MSO_ANCHOR.MIDDLE)
        para(tf, title_text, size=FONT_SIZES["title"], bold=True, color=t["primary_dark"],
             first=True, space_after=0)
    if footer_text:
        _, ftf = add_textbox(slide, 0.5, CANVAS_H - 0.42, CANVAS_W - 1.6, 0.32)
        para(ftf, footer_text, size=FONT_SIZES["footer"], color=t["muted"], first=True, space_after=0)
    if page_no is not None:
        _, ptf = add_textbox(slide, CANVAS_W - 1.1, CANVAS_H - 0.42, 0.7, 0.32)
        para(ptf, str(page_no), size=FONT_SIZES["footer"], color=t["muted"],
             align=PP_ALIGN.RIGHT, first=True, space_after=0)


def footer_of(meta):
    """根据 metadata 组装页脚文字。"""
    parts = [f"人教版·{meta.get('grade', '')}年级{TERM_LABEL.get(meta.get('term', ''), '')}"
             f"·{meta.get('unit_name', '')}"]
    if meta.get("class_period_label"):
        parts.append(meta["class_period_label"])
    return "  |  ".join(p for p in parts if p)
