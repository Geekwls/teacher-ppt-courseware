// -*- coding: utf-8 -*-
/** 算理左图右文页渲染器: 数轴/动画模型 + 算理卡片 + 结论横幅。 */

import { CANVAS_W, CONTENT_TOP } from "../../domain/canvas.js";
import { renderNumberLine, renderFigure } from "../../figures.js";
import { fitTextLayout } from "../../text_fit.js";

export function render(slide, s, ctx) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const figElem = s.elements.find(e => e.type === "figure_number_line");
  const animElem = s.elements.find(e => e.type === "figure_animation");
  const reasoningElem = s.elements.find(e => e.id === "card_reasoning");
  const conclusionElem = s.elements.find(e => e.type === "conclusion_banner");

  const leftW = 6.2;
  const rightX = 7.3;
  const rightW = CANVAS_W - rightX - 0.8;
  const mainH = 3.4;

  // 左侧模型容器: 声明式动画走动态媒体子引擎, 数轴走矢量图元
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: CONTENT_TOP + 0.1, w: leftW, h: mainH,
    fill: { color: t.panel },
    line: { color: t.border, width: 1.2 },
    shadow: { ...CARD_SHADOW }
  });
  if (animElem) {
    renderFigure(slide, pptx, { kind: "animation", ...animElem.properties }, [0.9, CONTENT_TOP + 0.4, leftW - 0.2, mainH - 0.8], t);
  } else if (figElem) {
    renderNumberLine(slide, pptx, { ...figElem.properties, id: figElem.id }, [0.9, CONTENT_TOP + 0.4, leftW - 0.2, mainH - 0.8], t);
  }

  // 右侧算理卡片组
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: rightX, y: CONTENT_TOP + 0.1, w: rightW, h: mainH,
    fill: { color: t.panel },
    line: { color: t.border, width: 1.2 },
    shadow: { ...CARD_SHADOW }
  });
  const steps = reasoningElem?.properties?.items || [];
  steps.forEach((st, sIdx) => {
    const sy = CONTENT_TOP + 0.35 + sIdx * 0.95;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: rightX + 0.3, y: sy, w: rightW - 0.6, h: 0.75,
      fill: { color: t.chip || "F8FAFC" },
      line: { color: t.border, width: 1 }
    });
    const fittedStep = fitTextLayout(st, rightW - 1.0, 0.6, t.fontSize.body);
    slide.addText(fittedStep.text, {
      x: rightX + 0.5, y: sy + 0.08, w: rightW - 1.0, h: 0.6,
      fontSize: fittedStep.size,
      bold: true,
      color: t.ink,
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  });

  // 底部结论横幅
  if (conclusionElem) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: CONTENT_TOP + 3.75, w: CANVAS_W - 1.6, h: 1.0,
      fill: { color: "FEF3C7" },
      line: { color: "F59E0B", width: 1.5 },
      shadow: { ...CARD_SHADOW }
    });
    slide.addText(conclusionElem.properties?.text || "", {
      x: 1.1, y: CONTENT_TOP + 3.85, w: CANVAS_W - 2.2, h: 0.8,
      fontSize: t.fontSize.body_large,
      bold: true,
      color: "92400E",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }
}
