// -*- coding: utf-8 -*-
/** 分层作业页渲染器: 必做/选做/挑战三档色块行。 */

import { CANVAS_W, CONTENT_TOP } from "../../domain/canvas.js";
import { fitTextLayout } from "../../text_fit.js";

export function render(slide, s, ctx) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const tierElem = s.elements.find(e => e.type === "tier_list");
  const tiers = tierElem?.properties?.tiers || [];
  const cardW = CANVAS_W - 2.0;
  const rowH = 1.45;
  const rowGap = 0.3;
  const startY = CONTENT_TOP + 0.28;
  const tierColors = [t.primary, t.accent, t.primaryDark];

  tiers.forEach((tier, idx) => {
    const cy = startY + idx * (rowH + rowGap);
    const tone = tierColors[idx] || t.primary;

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.0, y: cy, w: cardW, h: rowH,
      fill: { color: t.panel },
      line: { color: t.border, width: 1.2 },
      shadow: { ...CARD_SHADOW }
    });
    // 左端色块承载层级名 (必做/选做/挑战)
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.0, y: cy, w: 1.5, h: rowH,
      fill: { color: tone },
      line: { color: tone, width: 0 }
    });
    slide.addText(tier.tier || "", {
      x: 1.0, y: cy, w: 1.5, h: rowH,
      fontSize: t.fontSize.body_large,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });

    const fittedDesc = fitTextLayout(tier.desc || "", cardW - 2.3, rowH - 0.45, t.fontSize.body);
    slide.addText(fittedDesc.text, {
      x: 2.8, y: cy + 0.2, w: cardW - 2.1, h: rowH - 0.4,
      fontSize: fittedDesc.size,
      color: t.ink,
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  });
}
