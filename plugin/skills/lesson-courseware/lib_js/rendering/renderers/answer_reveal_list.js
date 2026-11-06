// -*- coding: utf-8 -*-
/** 参考答案页渲染器: 题干常驻, 答案卡按题逐拍淡入。 */

import { CANVAS_W, CONTENT_TOP } from "../../domain/canvas.js";
import { fitFontSize } from "../../text_fit.js";

export function render(slide, s, ctx) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const ansItems = s.elements.filter(e => e.type === "answer_feedback");
  const cardW = CANVAS_W - 1.6;
  const itemCount = Math.max(1, ansItems.length);
  const cardH = Math.min(1.22, (4.9 - (itemCount - 1) * 0.15) / itemCount);

  ansItems.forEach((it, idx) => {
    const cy = CONTENT_TOP + 0.08 + idx * (cardH + 0.15);
    // 外框白底卡片 (常驻)
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: cy, w: cardW, h: cardH,
      fill: { color: t.panel },
      line: { color: t.border, width: 1.2 },
      shadow: { ...CARD_SHADOW }
    });
    // 题干 (常驻)
    slide.addText(`${it.properties?.question_num || ""}  ${it.properties?.stem || ""}`, {
      x: 1.1, y: cy + 0.05, w: cardW - 0.6, h: 0.40,
      fontSize: fitFontSize(`${it.properties?.question_num || ""}  ${it.properties?.stem || ""}`, cardW - 0.6, 0.40, 16, 13),
      bold: true,
      color: t.ink,
      fontFace: FONT_FAMILY
    });
    // 浅绿色参考答案卡片 (按步骤淡入)
    const ansBoxH = cardH - 0.52;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.1, y: cy + 0.44, w: cardW - 0.6, h: ansBoxH,
      fill: { color: "ECFDF5" },
      line: { color: "A7F3D0", width: 1 }
    });
    slide.addText(it.properties?.explanation || "", {
      x: 1.2, y: cy + 0.46, w: cardW - 0.8, h: ansBoxH - 0.04,
      fontSize: fitFontSize(it.properties?.explanation || "", cardW - 0.8, ansBoxH - 0.04, 15, 12),
      bold: true,
      color: "047857",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  });
}
