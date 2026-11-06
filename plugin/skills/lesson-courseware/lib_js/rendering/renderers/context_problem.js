// -*- coding: utf-8 -*-
/** 情境导入页渲染器: 情境卡 + 算式/核心表达。 */

import { CANVAS_W, CONTENT_TOP } from "../../domain/canvas.js";
import { fitFontSize } from "../../text_fit.js";

export function render(slide, s, ctx) {
  const { pptx, t, themeName, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const ctxCard = s.elements.find(e => e.id === "card_context");
  const eqCard = s.elements.find(e => e.id === "eq_warmup");
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
      // 描边粗细跟随风格包: 极简的近黑主色配 1.5pt 会像黑框, 按包内基础线宽微调
      line: { color: t.primary, width: Math.min(1.5, (t.card?.borderWidth ?? 1.2) + 0.3) },
      shadow: { ...CARD_SHADOW }
    });
    const rawExpr = String(eqCard.properties?.expression || "").trim();
    let prefix = themeName === "math" ? "列式：" : "关键词：";
    if (rawExpr.startsWith("列式：") || rawExpr.startsWith("关键词：") || rawExpr.startsWith("核心聚焦：")) {
      prefix = "";
    }
    slide.addText(`${prefix}${rawExpr}`, {
      x: 1.4, y: CONTENT_TOP + 2.8, w: cardW - 0.8, h: 1.2,
      fontSize: t.fontSize.body_large + 2,
      bold: true,
      color: t.primaryDark,
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }
}
