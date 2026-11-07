// -*- coding: utf-8 -*-
/** 情境导入页渲染器: 情境卡 + 算式/核心表达; 声明配图位时左文右图。 */

import { CANVAS_W, CONTENT_TOP } from "../../domain/canvas.js";
import { fitFontSize } from "../../text_fit.js";
import { renderFigure } from "../../figures.js";

export function render(slide, s, ctx) {
  const { pptx, t, themeName, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const ctxCard = s.elements.find(e => e.id === "card_context");
  const eqCard = s.elements.find(e => e.id === "eq_warmup");
  const figImage = s.elements.find(e => e.type === "figure_image");

  if (figImage) {
    renderWithImage(slide, s, ctx, { pptx, t, themeName, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY, figImage, ctxCard, eqCard });
    return;
  }
  renderPlain(slide, ctx, { pptx, t, themeName, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY, ctxCard, eqCard });
}

/** 带配图位: 左文右图。文本区收窄到 7.4in, 右侧 4.03in 为图片卡/占位卡。 */
function renderWithImage(slide, s, ctx, { pptx, t, themeName, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY, figImage, ctxCard, eqCard }) {
  const textW = 7.4;

  // 情境卡加高到 2.6in, 标题与正文分盒绘制 (audit 按盒内实际字号估行, 混排盒会高估溢出)
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 1.0, y: CONTENT_TOP + 0.2, w: textW, h: 2.6,
    fill: { color: t.panel },
    line: { color: t.border, width: 1.2 },
    shadow: { ...CARD_SHADOW }
  });
  const ctxBody = ctxCard?.properties?.body || "";
  const ctxBodySize = fitFontSize(ctxBody, textW - 0.8, 1.55, t.fontSize.body);
  slide.addText(`${ctxCard?.properties?.title || "【情境】"}`, {
    x: 1.4, y: CONTENT_TOP + 0.32, w: textW - 0.8, h: 0.5,
    fontSize: t.fontSize.body_large, bold: true, color: t.primaryDark,
    valign: "top", fontFace: FONT_FAMILY
  });
  slide.addText(ctxBody, {
    x: 1.4, y: CONTENT_TOP + 0.88, w: textW - 0.8, h: 1.8,
    fontSize: ctxBodySize, color: t.ink,
    valign: "top", fontFace: FONT_FAMILY
  });

  if (eqCard) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.0, y: CONTENT_TOP + 2.95, w: textW, h: 1.3,
      fill: { color: t.chip || "EFF6FF" },
      line: { color: t.primary, width: Math.min(1.5, (t.card?.borderWidth ?? 1.2) + 0.3) },
      shadow: { ...CARD_SHADOW }
    });
    slide.addText(prefixedExpression(eqCard, themeName), {
      x: 1.4, y: CONTENT_TOP + 3.05, w: textW - 0.8, h: 1.1,
      fontSize: t.fontSize.body_large + 2,
      bold: true,
      color: t.primaryDark,
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }

  const props = figImage.properties || {};
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 8.5, y: CONTENT_TOP + 0.2, w: 4.03, h: 4.15,
    fill: { color: t.panel },
    line: { color: t.border, width: 1.2 },
    shadow: { ...CARD_SHADOW }
  });
  // 无真实图片文件时 renderImage 降级为虚线占位卡, alt 文案上屏提示替换
  renderFigure(slide, pptx, {
    kind: "image",
    path: props.path || "",
    alt: props.alt || "",
    caption: props.alt || ""
  }, [8.65, CONTENT_TOP + 0.35, 3.73, 3.85], t);
}

/** 无配图位: 原版全宽布局 (金样路径, 保持不变) */
function renderPlain(slide, ctx, { pptx, t, themeName, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY, ctxCard, eqCard }) {
  const cardW = CANVAS_W - 2.0;

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 1.0, y: CONTENT_TOP + 0.2, w: cardW, h: 2.2,
    fill: { color: t.panel },
    line: { color: t.border, width: 1.2 },
    shadow: { ...CARD_SHADOW }
  });
  const ctxBody = ctxCard?.properties?.body || "";
  const ctxBodySize = fitFontSize(ctxBody, cardW - 0.8, 1.15, t.fontSize.body);
  slide.addText([
    { text: `${ctxCard?.properties?.title || "【情境】"}\n\n`, options: { fontSize: t.fontSize.body_large, bold: true, color: t.primaryDark } },
    { text: ctxBody, options: { fontSize: ctxBodySize, color: t.ink } }
  ], {
    x: 1.4, y: CONTENT_TOP + 0.35, w: cardW - 0.8, h: 1.9,
    valign: "top", fontFace: FONT_FAMILY
  });

  if (eqCard) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.0, y: CONTENT_TOP + 2.7, w: cardW, h: 1.4,
      fill: { color: t.chip || "EFF6FF" },
      line: { color: t.primary, width: Math.min(1.5, (t.card?.borderWidth ?? 1.2) + 0.3) },
      shadow: { ...CARD_SHADOW }
    });
    slide.addText(prefixedExpression(eqCard, themeName), {
      x: 1.4, y: CONTENT_TOP + 2.8, w: cardW - 0.8, h: 1.2,
      fontSize: t.fontSize.body_large + 2,
      bold: true,
      color: t.primaryDark,
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }
}

/** 算式/核心表达前缀: 数学补「列式：」, 其他学科补「关键词：」; 已带前缀则原样 */
function prefixedExpression(eqCard, themeName) {
  const rawExpr = String(eqCard.properties?.expression || "").trim();
  let prefix = themeName === "math" ? "列式：" : "关键词：";
  if (rawExpr.startsWith("列式：") || rawExpr.startsWith("关键词：") || rawExpr.startsWith("核心聚焦：") || rawExpr.startsWith("认知冲突：")) {
    prefix = "";
  }
  return `${prefix}${rawExpr}`;
}
