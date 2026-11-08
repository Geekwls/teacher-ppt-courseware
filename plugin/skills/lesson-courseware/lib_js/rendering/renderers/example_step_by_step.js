// -*- coding: utf-8 -*-
/** 例题分步页渲染器: 题目 + 分步卡 + 答语。 */

import { CANVAS_W, CONTENT_TOP } from "../../domain/canvas.js";
import { fitTextLayout, fitFontSize } from "../../text_fit.js";

export function render(slide, s, ctx) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const probCard = s.elements.find(e => e.id === "card_ex_problem");
  const stepsCard = s.elements.find(e => e.id === "card_ex_steps");
  const ansCard = s.elements.find(e => e.type === "answer_feedback");
  const cardW = CANVAS_W - 1.6;

  // 顶部题目
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: CONTENT_TOP + 0.1, w: cardW, h: 1.05,
    fill: { color: t.panel },
    line: { color: t.border, width: 1.2 },
    shadow: { ...CARD_SHADOW }
  });
  slide.addText(probCard?.properties?.body || "", {
    x: 1.1, y: CONTENT_TOP + 0.18, w: cardW - 0.6, h: 0.9,
    fontSize: fitFontSize(probCard?.properties?.body || "", cardW - 0.6, 0.9, t.fontSize.body_large),
    bold: true,
    color: t.primaryDark,
    valign: "middle",
    fontFace: FONT_FAMILY
  });

  // 中间分步: 步骤多时压缩间距与卡高, 保证不与答语框/页脚重叠 (n<=3 与历史坐标一致)
  const exSteps = stepsCard?.properties?.items || [];
  const stepsTop = CONTENT_TOP + 1.35;
  const availH = CONTENT_TOP + 4.35 - stepsTop - 0.15;
  const stepPitch = Math.min(0.95, availH / Math.max(exSteps.length, 1));
  const stepCardH = Math.min(0.78, stepPitch - 0.12);
  exSteps.forEach((st, sIdx) => {
    const sy = stepsTop + sIdx * stepPitch;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: sy, w: cardW, h: stepCardH,
      fill: { color: t.chip || "F8FAFC" },
      line: { color: t.border, width: 1 }
    });
    const fittedStep = fitTextLayout(st, cardW - 0.6, stepCardH - 0.16, t.fontSize.body);
    slide.addText(fittedStep.text, {
      x: 1.1, y: sy + 0.05, w: cardW - 0.6, h: stepCardH - 0.16,
      fontSize: fittedStep.size,
      bold: true,
      color: t.ink,
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  });

  if (ansCard) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: CONTENT_TOP + 4.35, w: cardW, h: 0.75,
      fill: { color: "ECFDF5" },
      line: { color: "10B981", width: 1.2 },
      shadow: { ...CARD_SHADOW }
    });
    slide.addText(ansCard.properties?.text || "", {
      x: 1.1, y: CONTENT_TOP + 4.4, w: cardW - 0.6, h: 0.65,
      fontSize: fitFontSize(ansCard.properties?.text || "", cardW - 0.6, 0.65, t.fontSize.body),
      bold: true,
      color: "065F46",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }
}
