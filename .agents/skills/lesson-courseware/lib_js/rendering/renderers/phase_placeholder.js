// -*- coding: utf-8 -*-
/** 骨架缺口占位页渲染器: 虚线框 + 待补文案。 */

import { CANVAS_W, CONTENT_TOP } from "../../domain/canvas.js";
import { fitTextLayout } from "../../text_fit.js";

export function render(slide, s, ctx) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  // 骨架必备环节缺失的提示页: 虚线框 + 待补文案, 一眼看出这不是教学内容
  const hintCard = s.elements.find(e => e.type === "card_list");
  const items = hintCard?.properties?.items || [];
  const cardW = CANVAS_W - 2.0;
  const cardX = 1.0;
  const cardY = CONTENT_TOP + 0.3;
  const cardH = 4.0;

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: cardX, y: cardY, w: cardW, h: cardH,
    fill: { color: t.bgTint || "FFFFFF" },
    line: { color: t.accent, width: 1.5, dashType: "dash" },
    shadow: { ...CARD_SHADOW }
  });

  const bodyText = items.map((it, i) => (i === 0 ? it : `· ${it}`)).join("\n\n");
  const fittedBody = fitTextLayout(bodyText, cardW - 1.0, cardH - 0.8, t.fontSize.body);
  slide.addText(fittedBody.text, {
    x: cardX + 0.5, y: cardY + 0.4, w: cardW - 1.0, h: cardH - 0.8,
    fontSize: fittedBody.size,
    color: t.ink,
    valign: "middle",
    fontFace: FONT_FAMILY
  });
}
