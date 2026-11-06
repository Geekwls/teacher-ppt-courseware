// -*- coding: utf-8 -*-
/** 写字练习页渲染器: 田字格范字 + 书写要领 + 提示横幅。 */

import { CANVAS_W, CONTENT_TOP } from "../../domain/canvas.js";
import { renderFigure } from "../../figures.js";
import { fitTextLayout } from "../../text_fit.js";

export function render(slide, s, ctx) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const figElem = s.elements.find(e => e.type === "figure_tianzige");
  const rulesElem = s.elements.find(e => e.id === "card_rules");
  const tipElem = s.elements.find(e => e.id === "card_tip");

  // 田字格独占整行: 写字课的核心视觉是范字, 挤在左半栏只能做到 0.86in,
  // 教室后排看不清间架结构。改为全宽后单格可放大到 ~1.8in。
  const cardW = CANVAS_W - 1.6;
  const gridH = 3.05;

  // 上部：田字格范字
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: CONTENT_TOP + 0.1, w: cardW, h: gridH,
    fill: { color: t.panel },
    line: { color: t.border, width: 1.2 },
    shadow: { ...CARD_SHADOW }
  });
  if (figElem) {
    renderFigure(slide, pptx, { kind: "tianzige", ...figElem.properties }, [1.0, CONTENT_TOP + 0.3, cardW - 0.4, gridH - 0.6], t);
  }

  // 中部：书写要领 (不超过 3 列, 超过则换行)
  const rRules = rulesElem?.properties?.items || [];
  const ruleCols = Math.min(Math.max(rRules.length, 1), 3);
  const ruleRows = Math.ceil(rRules.length / ruleCols) || 1;
  const ruleGapX = 0.22;
  const ruleGapY = 0.14;
  const ruleW = (cardW - (ruleCols - 1) * ruleGapX) / ruleCols;
  const ruleH = 1.0;
  const rulesY = CONTENT_TOP + 0.1 + gridH + 0.16;

  rRules.forEach((ruleText, rIdx) => {
    const col = rIdx % ruleCols;
    const row = Math.floor(rIdx / ruleCols);
    const rx = 0.8 + col * (ruleW + ruleGapX);
    const ry = rulesY + row * (ruleH + ruleGapY);
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: rx, y: ry, w: ruleW, h: ruleH,
      fill: { color: t.chip || "F8FAFC" },
      line: { color: t.border, width: 1 }
    });
    const fittedRule = fitTextLayout(ruleText, ruleW - 0.5, ruleH - 0.1, 16);
    slide.addText(fittedRule.text, {
      x: rx + 0.25, y: ry + 0.05, w: ruleW - 0.5, h: ruleH - 0.1,
      fontSize: fittedRule.size,
      bold: true,
      color: t.ink,
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  });

  // 底部：书写提示横幅
  if (tipElem) {
    const ruleAreaH = ruleRows * ruleH + (ruleRows - 1) * ruleGapY;
    const tipY = rulesY + ruleAreaH + 0.15;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: tipY, w: cardW, h: 0.68,
      fill: { color: "FEF3C7" },
      line: { color: "F59E0B", width: 1.5 },
      shadow: { ...CARD_SHADOW }
    });
    slide.addText(tipElem.properties?.text || "", {
      x: 1.1, y: tipY + 0.04, w: cardW - 0.6, h: 0.6,
      fontSize: t.fontSize.body,
      bold: true,
      color: "92400E",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }
}
