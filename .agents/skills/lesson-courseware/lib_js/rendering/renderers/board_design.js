// -*- coding: utf-8 -*-
/** 板书设计页渲染器: 课题条 + 1~3 栏分支卡 + 页脚。 */

import { CANVAS_W, CONTENT_TOP, CONTENT_BOTTOM } from "../../domain/canvas.js";
import { fitTextLayout } from "../../text_fit.js";

export function render(slide, s, ctx) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const topicCard = s.elements.find(e => e.type === "text_card");
  const branches = s.elements.filter(e => e.type === "card_list");
  const footerCard = s.elements.find(e => e.type === "conclusion_banner");

  // 顶部课题条: 主色浅底, 板书标题居中
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 1.0, y: CONTENT_TOP + 0.15, w: CANVAS_W - 2.0, h: 0.95,
    fill: { color: t.chip || "EFF6FF" },
    line: { color: t.primary, width: 1.2 },
    shadow: { ...CARD_SHADOW }
  });
  const topicText = topicCard?.properties?.body || "";
  slide.addText(`课题：${topicText}`, {
    x: 1.3, y: CONTENT_TOP + 0.2, w: CANVAS_W - 2.6, h: 0.85,
    fontSize: t.fontSize.body_large,
    bold: true,
    color: t.primaryDark,
    valign: "middle",
    align: "center",
    fontFace: FONT_FAMILY
  });

  // 分支卡: 1~3 支自适应多栏
  const colCount = Math.max(1, Math.min(3, branches.length));
  const gap = 0.35;
  const colW = (CANVAS_W - 2.0 - gap * (colCount - 1)) / colCount;
  const branchY = CONTENT_TOP + 1.25;
  const branchH = 3.9;

  const branchColors = [t.primary, t.accent, t.primaryDark];

  branches.slice(0, 3).forEach((b, idx) => {
    const bx = 1.0 + idx * (colW + gap);
    const bColor = branchColors[idx] || t.primary;

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: bx, y: branchY, w: colW, h: branchH,
      fill: { color: t.panel },
      line: { color: t.border, width: 1.2 },
      shadow: { ...CARD_SHADOW }
    });

    // 分支顶部彩色胶囊
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: bx + 0.15, y: branchY + 0.15, w: colW - 0.3, h: 0.52,
      fill: { color: t.chip || "EFF6FF" },
      line: { color: bColor, width: 1.2 }
    });

    const head = b.properties?.head || `要点 ${idx + 1}`;
    slide.addText(head, {
      x: bx + 0.2, y: branchY + 0.16, w: colW - 0.4, h: 0.5,
      fontSize: t.fontSize.body,
      bold: true,
      color: bColor,
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });

    // 要点列表
    const items = b.properties?.items || [];
    const itemTop = branchY + 0.8;
    const maxItemCount = Math.min(4, items.length);
    const itemSlotH = (branchH - 0.95) / Math.max(1, maxItemCount);

    items.slice(0, 4).forEach((it, iIdx) => {
      const cleanText = String(it).trim();
      const fitted = fitTextLayout(`•  ${cleanText}`, colW - 0.5, itemSlotH - 0.05, t.fontSize.body - 1);
      slide.addText(fitted.text, {
        x: bx + 0.25, y: itemTop + iIdx * itemSlotH, w: colW - 0.5, h: itemSlotH - 0.05,
        fontSize: fitted.size,
        color: t.ink,
        valign: "middle",
        fontFace: FONT_FAMILY
      });
    });
  });

  if (footerCard && footerCard.properties?.text) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.0, y: CONTENT_BOTTOM - 0.75, w: CANVAS_W - 2.0, h: 0.7,
      fill: { color: t.chip || "EFF6FF" },
      line: { color: t.border, width: 1 },
      shadow: { ...CARD_SHADOW }
    });
    const footerText = footerCard.properties?.text || "";
    slide.addText(footerText, {
      x: 1.3, y: CONTENT_BOTTOM - 0.72, w: CANVAS_W - 2.6, h: 0.64,
      fontSize: t.fontSize.body,
      bold: true,
      color: t.primaryDark,
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }
}
