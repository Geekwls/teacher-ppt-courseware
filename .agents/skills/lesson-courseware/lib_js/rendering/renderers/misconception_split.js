// -*- coding: utf-8 -*-
/** 易错辨析页渲染器: 左错例 / 右病因 / 底部正解。 */

import { CANVAS_W, CONTENT_TOP } from "../../domain/canvas.js";
import { fitFontSize } from "../../text_fit.js";

export function render(slide, s, ctx) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const wrongElem = s.elements.find(e => e.id === "card_wrong");
  const causeElem = s.elements.find(e => e.id === "card_cause");
  const correctElem = s.elements.find(e => e.id === "card_correct");
  const colW = (CANVAS_W - 2.0) / 2;

  // 左侧错例
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: CONTENT_TOP + 0.2, w: colW, h: 3.0,
    fill: { color: "FEF2F2" },
    line: { color: "EF4444", width: 1.5 },
    shadow: { ...CARD_SHADOW }
  });
  slide.addText([
    { text: "【典型错例】\n\n", options: { fontSize: t.fontSize.body_large, bold: true, color: "DC2626" } },
    { text: wrongElem?.properties?.body || "", options: { fontSize: fitFontSize(wrongElem?.properties?.body || "", colW - 0.6, 1.6, t.fontSize.body_large + 2), bold: true, color: "991B1B" } }
  ], {
    x: 1.1, y: CONTENT_TOP + 0.4, w: colW - 0.6, h: 2.5,
    valign: "top", fontFace: FONT_FAMILY
  });

  // 右侧错因诊断
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.8 + colW + 0.4, y: CONTENT_TOP + 0.2, w: colW, h: 3.0,
    fill: { color: t.panel },
    line: { color: t.border, width: 1.2 },
    shadow: { ...CARD_SHADOW }
  });
  slide.addText([
    { text: "【病因诊断】\n\n", options: { fontSize: t.fontSize.body_large, bold: true, color: t.primaryDark } },
    { text: causeElem?.properties?.body || "", options: { fontSize: fitFontSize(causeElem?.properties?.body || "", colW - 0.6, 1.6, t.fontSize.body), color: t.ink } }
  ], {
    x: 0.8 + colW + 0.7, y: CONTENT_TOP + 0.4, w: colW - 0.6, h: 2.5,
    valign: "top", fontFace: FONT_FAMILY
  });

  // 底部正解
  if (correctElem) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: CONTENT_TOP + 3.5, w: CANVAS_W - 1.6, h: 1.3,
      fill: { color: "ECFDF5" },
      line: { color: "10B981", width: 1.5 },
      shadow: { ...CARD_SHADOW }
    });
    slide.addText(correctElem.properties?.text || "", {
      x: 1.1, y: CONTENT_TOP + 3.65, w: CANVAS_W - 2.2, h: 1.0,
      fontSize: fitFontSize(correctElem.properties?.text || "", CANVAS_W - 2.2, 1.0, t.fontSize.body_large),
      bold: true,
      color: "065F46",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }
}
