// -*- coding: utf-8 -*-
/**
 * 现代高质感版式组件库 (layouts.js) - 基于 PptxGenJS
 *
 * 实现了完整的 11 种幻灯片类型 + 自动参考答案页；
 * 采用现代卡片设计 (Card UI)、柔和微投影、呼吸感留白与防近视大字号排版。
 */

import {
  CANVAS_W,
  CANVAS_H,
  FONT_FAMILY,
  FONT_SIZES,
  SUBJECT_LABEL,
  TERM_LABEL,
  CARD_SHADOW,
  SEMANTIC
} from "./theme.js";
import { renderFigure } from "./figures.js";

const CONTENT_TOP = 1.35;
const CONTENT_BOTTOM = 6.7;

const CJK_RE = /[\u1100-\u115F\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFF60]/;

/** 以 em 为单位估算字宽: 中文全角 1em, 拉丁/数字约 0.55em, 标点更窄 */
function charWidthEm(ch) {
  if (ch === " " || ch === "\t") return 0.30;
  if (CJK_RE.test(ch)) return 1.0;
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[A-Za-z]/.test(ch)) return 0.55;
  if (/[.,;:!?'"`()\[\]{}<>|_\-+=~^$%#@&\\/]/.test(ch)) return 0.42;
  return 0.85;
}

function textWidthEm(text) {
  let em = 0;
  for (const ch of String(text || "")) em += charWidthEm(ch);
  return em;
}

/** 按真实字宽切行; 容量乘 0.94 留余量, 避免 PowerPoint 二次折行产生孤字 */
function linesForText(text, widthIn, size) {
  const usableEm = Math.max(4, ((widthIn - 0.14) * 0.88) / (size / 72));
  const lines = [];
  let cur = "";
  let curEm = 0;
  for (const ch of String(text || "")) {
    if (ch === "\n") {
      lines.push(cur);
      cur = "";
      curEm = 0;
      continue;
    }
    const e = charWidthEm(ch);
    if (curEm + e > usableEm && cur) {
      lines.push(cur);
      cur = ch;
      curEm = e;
    } else {
      cur += ch;
      curEm += e;
    }
  }
  lines.push(cur);
  return lines;
}

function estimateLines(text, widthIn, size = 20) {
  return Math.max(1, linesForText(text, widthIn, size).length);
}

/**
 * 在靠近 55% 宽度处、优先标点/空格后切一刀, 把长句均衡分成两行。
 * 不用「借两个字符」的修补法: 那依赖精确字宽, 换字体就会再次出现孤字。
 */
function balancedSplit(text) {
  const chars = Array.from(String(text).replace(/\n/g, ""));
  const target = textWidthEm(chars.join("")) * 0.55;
  let em = 0;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 1; i < chars.length; i++) {
    em += charWidthEm(chars[i - 1]);
    const bonus = /[\s，,、；;：:）)]/.test(chars[i - 1]) ? -1.2 : 0;
    const score = Math.abs(em - target) + bonus;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best <= 0) return [chars.join("")];
  return [chars.slice(0, best).join(""), chars.slice(best).join("")];
}

/**
 * 自适应文本布局: 先按可用高度降字号; 文本一旦接近一行容量,
 * 主动均衡切成两行, 避免 PowerPoint 按真实字体度量二次折行后末行只剩「元」。
 */
function fitTextLayout(text, widthIn, boxH, baseSize, minSize = 14) {
  const raw = String(text || "");
  let size = baseSize;
  let lines = linesForText(raw, widthIn, size);
  const fits = (s, ls) => ls.length * (s / 72) * 1.30 <= Math.max(0.3, boxH - 0.06);
  while (size > minSize && !fits(size, lines)) {
    size -= 1;
    lines = linesForText(raw, widthIn, size);
  }

  const usableEm = Math.max(4, ((widthIn - 0.14) * 0.88) / (size / 72));
  const totalEm = textWidthEm(raw.replace(/\n/g, ""));
  if (!raw.includes("\n") && totalEm > usableEm * 0.90) {
    lines = balancedSplit(raw);
  }
  return { text: lines.join("\n"), size, lines: lines.length };
}

/** 按显示宽度截断 (中英混排下比 .length 公平), 用于答案页题干摘要 */
function truncateByWidth(text, maxEm) {
  let em = 0;
  let out = "";
  for (const ch of String(text || "")) {
    const e = charWidthEm(ch);
    if (em + e > maxEm) return out.trimEnd() + "…";
    out += ch;
    em += e;
  }
  return out;
}

function renderSourceNote(slide, s, theme) {
  // 教学课件卷面保持纯净，不展示内部技术 ID (如 point_id)；溯源信息保留在 JSON 契约与教师备注栏中
}

/**
 * 现代卡片式条目列表 (带圆形/圆角序号与白底阴影卡片，具备自适应高度与防溢出排版)
 */
function renderCardList(slide, pptx, items, x, y, w, theme, options = {}) {
  const n = Math.max(1, (items || []).length);
  const maxBottom = options.maxBottom || CONTENT_BOTTOM;
  const availableH = Math.max(1.0, maxBottom - y);

  // 根据条目数量与可用高度智能自适应字号
  let size = options.size || theme?.fontSize?.body || FONT_SIZES.body;
  if (n >= 4 && availableH < 4.5) {
    size = Math.min(size, 16);
  } else if (n >= 3 && availableH < 4.2) {
    size = Math.min(size, 17);
  }

  const numColor = options.numberColor || theme.primary;
  const mult = theme?.lineHeightMultiplier || 1.25;
  const gap = n >= 4 ? 0.08 : 0.12;
  const slotH = Math.max(0.55, (availableH - gap * (n - 1)) / n);

  let cy = y;

  (items || []).forEach((item, i) => {
    const text = String(item);
    const lines = estimateLines(text, w - 0.8, size);
    const cardH = Math.min(slotH, Math.max(0.52, lines * (size / 72.0 * mult * 1.35) + 0.28));

    // 白底阴影卡片底板
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: x,
      y: cy,
      w: w,
      h: cardH,
      fill: { color: theme.panel },
      line: { color: theme.border, width: 1 },
      shadow: CARD_SHADOW
    });

    // 序号或对勾徽章
    const badgeSize = Math.min(0.42, Math.max(0.32, cardH - 0.14));
    const isCheck = options.icon === "check";
    slide.addText(isCheck ? "✓" : String(i + 1), {
      x: x + 0.16,
      y: cy + (cardH - badgeSize) / 2,
      w: badgeSize,
      h: badgeSize,
      shape: pptx.shapes.OVAL,
      fill: { color: isCheck ? theme.good : numColor },
      fontSize: Math.max(12, Math.floor(badgeSize * 32)),
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });

    // 条目文本: 按字宽自适应字号 + 平衡末行, 消除孤字折行
    const textLeft = x + badgeSize + 0.26;
    const textW = w - (badgeSize + 0.36);
    const fitted = fitTextLayout(text, textW, cardH, size, Math.max(13, size - 6));
    slide.addText(fitted.text, {
      x: textLeft,
      y: cy,
      w: textW,
      h: cardH,
      fontSize: fitted.size,
      color: theme.ink,
      fontFace: FONT_FAMILY,
      valign: "middle",
      margin: 4
    });

    cy += slotH + gap;
  });

  return cy;
}

// ---------------------------------------------------------------- 封面与结束页
export function renderCover(slide, pptx, s, ctx) {
  const { t, meta } = ctx;

  // 1. 全局背景底色
  slide.background = { color: t.bgTint };

  // 2. 顶部与底部边缘主色微光细条 (极简现代，完全在画布内)
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: CANVAS_W, h: 0.08,
    fill: { color: t.primary }, line: { color: t.primary, width: 0 }
  });
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: CANVAS_H - 0.08, w: CANVAS_W, h: 0.08,
    fill: { color: t.primary }, line: { color: t.primary, width: 0 }
  });

  // 3. 居中悬浮纯白大卡片 (Hero Card)
  const cardW = 11.4;
  const cardH = 5.6;
  const cardX = (CANVAS_W - cardW) / 2;
  const cardY = (CANVAS_H - cardH) / 2;

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: cardX,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: t.panel },
    line: { color: t.border, width: 1.2 },
    shadow: CARD_SHADOW
  });

  // 4. 顶部小胶囊徽章 (年级·册次·学科)
  const subject = SUBJECT_LABEL[meta.subject] || "";
  const pillText = `人教版 · ${meta.grade || ""}年级${TERM_LABEL[meta.term] || ""} · ${subject}`;
  slide.addText(pillText, {
    x: (CANVAS_W - 4.4) / 2,
    y: cardY + 0.45,
    w: 4.4,
    h: 0.42,
    fill: { color: t.chip },
    line: { color: t.primary, width: 1 },
    shape: pptx.shapes.ROUNDED_RECTANGLE,
    fontSize: 14,
    bold: true,
    color: t.primaryDark,
    align: "center",
    valign: "middle",
    fontFace: FONT_FAMILY
  });

  // 5. 主标题
  const title = s.title || meta.title || "小学课时课件";
  slide.addText(title, {
    x: cardX + 0.6,
    y: cardY + 1.15,
    w: cardW - 1.2,
    h: 1.2,
    fontSize: t.fontSize?.cover_title || FONT_SIZES.cover_title,
    bold: true,
    color: t.primaryDark,
    align: "center",
    valign: "middle",
    fontFace: FONT_FAMILY
  });

  // 6. 副标题
  const subtitle = s.subtitle || meta.subtitle;
  if (subtitle) {
    slide.addText(subtitle, {
      x: cardX + 0.6,
      y: cardY + 2.45,
      w: cardW - 1.2,
      h: 0.6,
      fontSize: t.fontSize?.cover_subtitle || FONT_SIZES.cover_subtitle,
      color: t.ink,
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }

  // 7. 单元与课时说明 (淡色圆角信息带)
  const unitBits = [meta.unit_name, meta.lesson_name, meta.class_period_label].filter(Boolean);
  if (unitBits.length) {
    const cardText = unitBits.join("   |   ");
    slide.addText(cardText, {
      x: cardX + 0.8,
      y: cardY + 3.4,
      w: cardW - 1.6,
      h: 0.62,
      fill: { color: t.chip },
      shape: pptx.shapes.ROUNDED_RECTANGLE,
      fontSize: 15,
      color: t.ink,
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }

  // 8. 授课教师与学校
  const who = [
    meta.school,
    meta.teacher_name ? `授课教师: ${meta.teacher_name}` : ""
  ].filter(Boolean).join("    ·    ");

  if (who) {
    slide.addText(who, {
      x: cardX + 0.6,
      y: cardY + 4.5,
      w: cardW - 1.2,
      h: 0.45,
      fontSize: 14,
      color: t.muted,
      align: "center",
      fontFace: FONT_FAMILY
    });
  }
}

export function renderEnd(slide, pptx, s, ctx) {
  const { t } = ctx;
  slide.background = { color: t.bgTint };

  // 居中大白底卡片
  const cardX = 2.0;
  const cardY = 1.3;
  const cardW = CANVAS_W - 4.0;
  const cardH = 4.8;

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: cardX,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: t.panel },
    line: { color: t.border, width: 1.5 },
    shadow: CARD_SHADOW
  });

  const fullMsg = String(s.message || "下课啦，同学们再见！").trim();
  const msgLines = fullMsg.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const mainTitle = msgLines[0] || "下课啦，同学们再见！";
  const subMsg = msgLines.slice(1).join("\n");

  // 顶部主标语 (醒目居中大字)
  slide.addText(mainTitle, {
    x: cardX + 0.4,
    y: cardY + 0.45,
    w: cardW - 0.8,
    h: 0.9,
    fontSize: 34,
    bold: true,
    color: t.primaryDark,
    align: "center",
    valign: "middle",
    fontFace: FONT_FAMILY
  });

  // 中部口头小测试/附加提示卡片 (独立卡片排布，绝不重叠)
  if (subMsg) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: cardX + 0.8,
      y: cardY + 1.55,
      w: cardW - 1.6,
      h: 1.8,
      fill: { color: t.chip },
      line: { color: t.primary, width: 1.2 }
    });
    slide.addText(subMsg, {
      x: cardX + 1.0,
      y: cardY + 1.65,
      w: cardW - 2.0,
      h: 1.6,
      fontSize: 18,
      bold: true,
      color: t.ink,
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }

  // 底部副标题 (稳稳固定在卡片底部，绝不重叠撞车)
  slide.addText("认真完成课后作业  ·  保持良好学习习惯", {
    x: cardX + 0.4,
    y: cardY + cardH - 0.65,
    w: cardW - 0.8,
    h: 0.45,
    fontSize: 16,
    color: t.muted,
    align: "center",
    valign: "middle",
    fontFace: FONT_FAMILY
  });
}

// ---------------------------------------------------------------- 目标/导入/小结/作业
export function renderObjectives(slide, pptx, s, ctx) {
  const { t } = ctx;
  renderCardList(slide, pptx, s.items || [], 1.2, CONTENT_TOP + 0.25, CANVAS_W - 2.4, t, {
    size: t.fontSize?.body_large || FONT_SIZES.body_large
  });
  renderSourceNote(slide, s, t);
}

export function renderWarmup(slide, pptx, s, ctx) {
  const { t } = ctx;
  const items = s.items || [];
  const hasFig = Boolean(s.figure);
  const body = t.fontSize?.body || FONT_SIZES.body;

  if (hasFig) {
    const halfW = (CANVAS_W - 2.0) * 0.45;
    const bodyH = CONTENT_BOTTOM - CONTENT_TOP - 0.2;
    const figBox = [0.8, CONTENT_TOP + 0.2, halfW, bodyH];
    renderFigure(slide, pptx, s.figure, figBox, t);
    const sx = 0.8 + halfW + 0.4;
    const sw = (CANVAS_W - 2.0) - halfW - 0.4;
    renderCardList(slide, pptx, items, sx, CONTENT_TOP + 0.2, sw, t, {
      numberColor: t.accent,
      size: body,
      maxBottom: CONTENT_TOP + bodyH
    });
  } else {
    renderCardList(slide, pptx, items, 1.2, CONTENT_TOP + 0.25, CANVAS_W - 2.4, t, {
      numberColor: t.accent,
      size: t.fontSize?.body_large || FONT_SIZES.body_large
    });
  }
  renderSourceNote(slide, s, t);
}

export function renderSummary(slide, pptx, s, ctx) {
  const { t } = ctx;
  renderCardList(slide, pptx, s.items || [], 1.2, CONTENT_TOP + 0.25, CANVAS_W - 2.4, t, {
    icon: "check",
    size: t.fontSize?.body_large || FONT_SIZES.body_large
  });
  renderSourceNote(slide, s, t);
}

export function renderHomework(slide, pptx, s, ctx) {
  const { t } = ctx;
  renderCardList(slide, pptx, s.items || [], 1.2, CONTENT_TOP + 0.25, CANVAS_W - 2.4, t, {
    size: t.fontSize?.body || FONT_SIZES.body
  });
}

// ---------------------------------------------------------------- 新知/例题/易错
export function renderConcept(slide, pptx, s, ctx) {
  const { t } = ctx;
  const steps = (s.steps || []).map(String);
  const callout = s.callout;
  const hasFig = Boolean(s.figure);
  const bodyH = CONTENT_BOTTOM - CONTENT_TOP - (callout ? 0.95 : 0.2);

  let x = 1.0;
  let w = CANVAS_W - 2.0;

  if (hasFig) {
    const halfW = (CANVAS_W - 2.0) * 0.45;
    const figBox = [0.8, CONTENT_TOP + 0.2, halfW, bodyH - 0.2];
    renderFigure(slide, pptx, s.figure, figBox, t);
    x = 0.8 + halfW + 0.4;
    w = (CANVAS_W - 2.0) - halfW - 0.4;
  }

  renderCardList(slide, pptx, steps, x, CONTENT_TOP + 0.2, w, t, {
    size: t.fontSize?.body || FONT_SIZES.body,
    maxBottom: CONTENT_TOP + bodyH
  });

  // 关键总结高亮框 (带金黄强调条与圆角卡片)
  if (callout) {
    const cleanCallout = String(callout).replace(/^(?:★\s*)?(?:关键结论|规律发现|核心算理|技巧总结)?[:：]?\s*/, '');
    slide.addText(`★ 核心规律：${cleanCallout}`, {
      x: 1.0,
      y: CONTENT_BOTTOM - 0.85,
      w: CANVAS_W - 2.0,
      h: 0.75,
      fill: { color: t.chip },
      line: { color: t.primary, width: 1.4 },
      shadow: CARD_SHADOW,
      shape: pptx.shapes.ROUNDED_RECTANGLE,
      fontSize: t.fontSize?.callout || FONT_SIZES.callout,
      bold: true,
      color: t.primaryDark,
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }

  renderSourceNote(slide, s, t);
}

export function renderExample(slide, pptx, s, ctx) {
  const { t } = ctx;
  const title = s.title || "教材例题";
  const problem = s.problem || "";
  const bodyLarge = t.fontSize?.body_large || FONT_SIZES.body_large;
  const body = t.fontSize?.body || FONT_SIZES.body;

  // 顶部例题卡片 (左侧有粗主色点缀条)
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.8,
    y: CONTENT_TOP + 0.05,
    w: CANVAS_W - 1.6,
    h: 0.95,
    fill: { color: t.panel },
    line: { color: t.border, width: 1 },
    shadow: CARD_SHADOW
  });
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0.8,
    y: CONTENT_TOP + 0.05,
    w: 0.12,
    h: 0.95,
    fill: { color: t.primary },
    line: { color: t.primary, width: 0 }
  });

  slide.addText([
    { text: '【例题】 ' , options: { fontSize: t.fontSize?.title ? Math.max(18, t.fontSize.title - 8) : 20, bold: true, color: t.primaryDark } },
    { text: problem, options: { fontSize: bodyLarge, bold: true, color: t.ink } }
  ], {
    x: 1.1,
    y: CONTENT_TOP + 0.05,
    w: CANVAS_W - 2.0,
    h: 0.95,
    valign: "middle",
    fontFace: FONT_FAMILY
  });

  const bodyTop = CONTENT_TOP + 1.2;
  const answer = s.answer || "";
  const stepsH = CONTENT_BOTTOM - bodyTop - (answer ? 0.68 : 0.15);
  const hasFig = Boolean(s.figure);

  let sx = 1.0;
  let sw = CANVAS_W - 2.0;

  if (hasFig) {
    const figW = (CANVAS_W - 1.8) * 0.42;
    renderFigure(slide, pptx, s.figure, [0.8, bodyTop, figW, stepsH], t);
    sx = 0.8 + figW + 0.4;
    sw = (CANVAS_W - 1.8) - figW - 0.4;
  }

  renderCardList(slide, pptx, s.solution_steps || [], sx, bodyTop, sw, t, {
    numberColor: t.accent,
    size: body,
    maxBottom: bodyTop + stepsH
  });

  // 答语卡片 (绿色优雅高亮面板)
  if (answer) {
    const cleanAns = String(answer).replace(/^答[:：]?\s*/, '');
    const ansFontSize = hasFig ? Math.min(body, 18) : body;
    slide.addText(`答：${cleanAns}`, {
      x: sx,
      y: CONTENT_BOTTOM - 0.72,
      w: sw,
      h: 0.62,
      fill: { color: SEMANTIC.goodBg },
      line: { color: t.good, width: 1.2 },
      shadow: CARD_SHADOW,
      shape: pptx.shapes.ROUNDED_RECTANGLE,
      fontSize: ansFontSize,
      bold: true,
      color: SEMANTIC.goodInk,
      valign: "middle",
      margin: 12,
      fontFace: FONT_FAMILY
    });
  }

  renderSourceNote(slide, s, t);
}

export function renderMisconception(slide, pptx, s, ctx) {
  const { t } = ctx;
  const bodyLarge = t.fontSize?.body_large || FONT_SIZES.body_large;
  const rows = [
    { label: "✗ 错例", text: s.wrong || "", fill: SEMANTIC.badBg, textC: t.bad, borderC: SEMANTIC.badBorder },
    { label: "✗ 错因", text: s.reason || "", fill: t.panel, textC: t.ink, borderC: t.border },
    { label: "✓ 正解", text: s.correct || "", fill: SEMANTIC.goodBg, textC: SEMANTIC.goodInk, borderC: SEMANTIC.goodBorder }
  ];

  let y = CONTENT_TOP + 0.25;
  rows.forEach(({ label, text, fill, textC, borderC }) => {
    const lines = Math.max(1, estimateLines(text, CANVAS_W - 3.4, bodyLarge));
    const mult = t.lineHeightMultiplier || 1.25;
    const boxH = Math.max(0.68, lines * (bodyLarge / 72.0 * mult * 1.3) + 0.36);

    // 标签胶囊
    slide.addText(label, {
      x: 0.9,
      y: y + (boxH - 0.48) / 2,
      w: 1.3,
      h: 0.48,
      fill: { color: fill },
      line: { color: borderC, width: 1 },
      shape: pptx.shapes.ROUNDED_RECTANGLE,
      fontSize: 16,
      bold: true,
      color: textC,
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });

    // 内容框
    slide.addText(text, {
      x: 2.35,
      y: y,
      w: CANVAS_W - 3.35,
      h: boxH,
      fill: { color: fill },
      line: { color: borderC, width: 1 },
      shadow: CARD_SHADOW,
      shape: pptx.shapes.ROUNDED_RECTANGLE,
      fontSize: bodyLarge,
      bold: label === "✓ 正解",
      color: textC,
      valign: "middle",
      margin: 12,
      fontFace: FONT_FAMILY
    });

    y += boxH + 0.22;
  });

  renderSourceNote(slide, s, t);
}

// ---------------------------------------------------------------- 练习 (卷面页) 与 参考答案页
function practiceStem(item) {
  let stem = String(item.stem || "");
  const opts = item.options;
  if (opts && Array.isArray(opts)) {
    stem += "    " + opts.join("      ");
  }
  return stem;
}

export function renderPractice(slide, pptx, s, ctx) {
  const { t } = ctx;
  const items = s.items || [];
  const body = t.fontSize?.body || FONT_SIZES.body;
  const mult = t.lineHeightMultiplier || 1.25;

  // 1. 单题即时随堂互动模式 (interaction_mode === 'instant' 或仅有1题)
  if (s.interaction_mode === "instant" || items.length === 1) {
    const item = items[0] || {};
    const cy = CONTENT_TOP + 0.2;
    const cardH = 4.8;
    const leftW = 6.0;
    const rightW = 4.9;

    // 左栏: 题目与选项展示区
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.0,
      y: cy,
      w: leftW,
      h: cardH,
      fill: { color: "FFFFFF" },
      line: { color: t.primary, width: 1.5 },
      shadow: CARD_SHADOW
    });

    // 互动标签徽章
    slide.addText("随堂即时互动 · 单题精练", {
      x: 1.3,
      y: cy + 0.25,
      w: 2.8,
      h: 0.36,
      fill: { color: t.chip },
      fontSize: 13,
      bold: true,
      color: t.primaryDark,
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });

    // 题干 (大字号、醒目)
    const stemText = String(item.stem || "");
    slide.addText(stemText, {
      x: 1.3,
      y: cy + 0.75,
      w: leftW - 0.6,
      h: 1.4,
      fontSize: body + 2,
      bold: true,
      color: t.ink,
      fontFace: FONT_FAMILY,
      valign: "top"
    });

    // 选项列表 (若为选择题)
    if (Array.isArray(item.options) && item.options.length > 0) {
      const optY0 = cy + 2.2;
      const optH = 0.52;
      const optGap = 0.12;
      item.options.slice(0, 4).forEach((opt, idx) => {
        const curOptY = optY0 + idx * (optH + optGap);
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 1.3,
          y: curOptY,
          w: leftW - 0.6,
          h: optH,
          fill: { color: t.panel },
          line: { color: t.border, width: 1 }
        });
        slide.addText(String(opt), {
          x: 1.5,
          y: curOptY,
          w: leftW - 1.0,
          h: optH,
          fontSize: body,
          color: t.ink,
          valign: "middle",
          fontFace: FONT_FAMILY
        });
      });
    }

    // 右栏: ★ 即时解析与参考答案卡片 (初始隐藏，放映时单击淡入揭晓)
    const rightX = 7.3;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: rightX,
      y: cy,
      w: rightW,
      h: cardH,
      fill: { color: t.chip },
      line: { color: t.primary, width: 1.8 },
      shadow: CARD_SHADOW
    });

    const ansBadgeText = `★ 即时解析与答案：${item.answer || "略"}`;
    slide.addText(ansBadgeText, {
      x: rightX + 0.3,
      y: cy + 0.4,
      w: rightW - 0.6,
      h: 0.6,
      fill: { color: t.primary },
      fontSize: 18,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });

    const explanation = item.explanation || item.analysis || item.notes || "【思路点拨】紧扣本课核心算理与知识法则，认真审题即可迅速得出正确答案。";
    slide.addText([
      { text: "【解析与思路点拨】\n", options: { fontSize: 16, bold: true, color: t.primaryDark, breakLine: true } },
      { text: String(explanation), options: { fontSize: 15, color: t.ink } }
    ], {
      x: rightX + 0.4,
      y: cy + 1.2,
      w: rightW - 0.8,
      h: 3.2,
      fontFace: FONT_FAMILY,
      valign: "top"
    });

    return;
  }

  // 2. 多题随堂测试模式 (自适应舒适纵向排版)
  const n = Math.max(1, items.length);
  const gap = n >= 4 ? 0.10 : 0.16;
  const availH = CONTENT_BOTTOM - CONTENT_TOP - 0.25;
  const maxSlotH = (availH - gap * (n - 1)) / n;
  let cy = CONTENT_TOP + 0.12;
  const w = CANVAS_W - 2.0;

  items.forEach((item, i) => {
    const stem = practiceStem(item);
    const lines = estimateLines(stem, w - 1.2, body);
    const itemH = Math.min(maxSlotH, Math.max(0.60, lines * (body / 72.0 * mult * 1.2) + 0.24));

    // 题目卡片
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.0,
      y: cy,
      w: w,
      h: itemH,
      fill: { color: t.panel },
      line: { color: t.border, width: 1 },
      shadow: CARD_SHADOW
    });

    // 题号徽章
    const badgeSize = Math.min(0.38, itemH - 0.16);
    slide.addText(String(item._no || (i + 1)), {
      x: 1.2,
      y: cy + (itemH - badgeSize) / 2,
      w: badgeSize,
      h: badgeSize,
      shape: pptx.shapes.OVAL,
      fill: { color: t.primary },
      fontSize: Math.max(12, Math.floor(badgeSize * 34)),
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });

    // 题干
    slide.addText(stem, {
      x: 1.75,
      y: cy,
      w: w - 0.95,
      h: itemH,
      fontSize: n >= 4 ? Math.min(body, 17) : body,
      color: t.ink,
      fontFace: FONT_FAMILY,
      valign: "middle",
      margin: 6
    });

    cy += itemH + gap;
  });
}

export function renderAnswerPage(slide, pptx, s, ctx) {
  const { t } = ctx;
  const items = s.items || [];
  const n = Math.max(1, items.length);
  const gap = n >= 4 ? 0.08 : 0.12;
  const availH = CONTENT_BOTTOM - CONTENT_TOP - 0.2;
  const slotH = Math.max(0.68, (availH - gap * (n - 1)) / n);

  const ansSize = n >= 4 ? 14 : (t.fontSize?.body ? Math.min(16, t.fontSize.body) : 15);
  const metaSize = n >= 4 ? 13 : (t.fontSize?.meta ? Math.max(13, t.fontSize.meta) : 14);
  let cy = CONTENT_TOP + 0.12;
  const w = CANVAS_W - 2.0;

  items.forEach((item, i) => {
    const stem = String(item.stem || "");
    const stemEm = Math.max(18, (w - 0.8) / (metaSize / 72) - 8);
    const shortStem = truncateByWidth(stem, stemEm);
    const ansText = String(item.answer || "略");
    const cardH = slotH;
    const ansH = Math.max(0.38, cardH - 0.44);

    // 白底阴影卡片底板
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.0,
      y: cy,
      w: w,
      h: cardH,
      fill: { color: t.panel },
      line: { color: t.border, width: 1 },
      shadow: CARD_SHADOW
    });

    // 绿色题号徽章
    const bSize = Math.min(0.34, cardH - 0.12);
    slide.addText(String(item._no || (i + 1)), {
      x: 1.2,
      y: cy + 0.08,
      w: bSize,
      h: bSize,
      shape: pptx.shapes.OVAL,
      fill: { color: t.good },
      fontSize: 13,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });

    // 题目摘要行
    slide.addText("第 " + (i + 1) + " 题：" + shortStem, {
      x: 1.65,
      y: cy + 0.06,
      w: w - 0.8,
      h: 0.34,
      fontSize: metaSize,
      bold: true,
      color: t.ink,
      fontFace: FONT_FAMILY,
      valign: "middle"
    });

    // 答案高亮卡片 (淡绿底 + 翠绿字 + 内部自适应)
    slide.addText("★ 参考答案：" + ansText, {
      x: 1.65,
      y: cy + 0.38,
      w: w - 0.9,
      h: ansH,
      fill: { color: SEMANTIC.goodBg },
      line: { color: SEMANTIC.goodBorder, width: 1 },
      shape: pptx.shapes.ROUNDED_RECTANGLE,
      fontSize: ansSize,
      bold: true,
      color: SEMANTIC.goodInk,
      fontFace: FONT_FAMILY,
      valign: "middle",
      margin: 6
    });

    cy += cardH + gap;
  });
}

// ---------------------------------------------------------------- 黑板/板书设计
export function renderBoard(slide, pptx, s, ctx) {
  const content = String(s.content || "");
  const lines = content.split(/\r?\n/);
  const titleLine = lines[0] || "口算乘法 · 整十整百数乘一位数";
  const bodyLines = lines.slice(1);

  const boardX = 1.0;
  const boardY = CONTENT_TOP + 0.12;
  const boardW = CANVAS_W - 2.0;
  const boardH = CONTENT_BOTTOM - CONTENT_TOP - 0.12;

  // 黑板面板 (沉稳墨黑绿 + 木质立体边框)
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: boardX,
    y: boardY,
    w: boardW,
    h: boardH,
    fill: { color: SEMANTIC.boardBg },
    line: { color: SEMANTIC.boardEdge, width: 5 },
    shadow: CARD_SHADOW
  });

  // 黑板顶部金色粉笔标题 (居中加粗，绝不削头)
  slide.addText(titleLine.trim(), {
    x: boardX + 0.4,
    y: boardY + 0.22,
    w: boardW - 0.8,
    h: 0.52,
    fontSize: 22,
    bold: true,
    color: SEMANTIC.boardChalk,
    align: "center",
    valign: "middle",
    fontFace: FONT_FAMILY
  });

  // 黑板正文内容 (字号 16pt，紧凑舒展，绝不骑下框)
  const textRuns = bodyLines.map(line => {
    const isSpecial = line.trim().startsWith("【") || line.trim().startsWith("想");
    return {
      text: (line.trim() ? line : " ") + "\n",
      options: {
        fontSize: isSpecial ? 18 : 17,
        bold: isSpecial,
        color: isSpecial ? SEMANTIC.boardChalk : SEMANTIC.boardBody,
        fontFace: FONT_FAMILY
      }
    };
  });

  // 正文在标题下方的剩余空间垂直居中, 避免顶部拥挤、底部大片空白
  slide.addText(textRuns, {
    x: boardX + 0.8,
    y: boardY + 0.82,
    w: boardW - 1.6,
    h: boardH - 1.0,
    valign: "middle",
    margin: 4
  });
}

export const LAYOUTS = {
  cover: renderCover,
  objectives: renderObjectives,
  warmup: renderWarmup,
  concept: renderConcept,
  example: renderExample,
  misconception: renderMisconception,
  practice: renderPractice,
  summary: renderSummary,
  board: renderBoard,
  homework: renderHomework,
  end: renderEnd
};
