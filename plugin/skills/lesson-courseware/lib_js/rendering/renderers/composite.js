// -*- coding: utf-8 -*-
/**
 * 声明式组合版式渲染器 (renderers/composite.js)
 *
 * 依据 assembler 标注的 _zone 结构槽位 (row/col/span/cols/gapX/gapY) 计算像素几何:
 * 安全区取 SAFE_CONTENT_BOUNDS, 行数由槽位最大 row 推导, 单元格宽高按 gap 均分。
 * 每个槽位绘制统一容器卡 + 对应图元/文本, 图元复用 figures.js。
 */

import { SAFE_CONTENT_BOUNDS } from "../grid_slots.js";
import { renderNumberLine, renderFigure } from "../../figures.js";
import { fitTextLayout, fitFontSize } from "../../text_fit.js";

const ZONE_INSET = 0.15;

function computeZoneBox(stamp, rows) {
  const { cols, gapX, gapY, row, col, span } = stamp;
  const cellW = (SAFE_CONTENT_BOUNDS.w - (cols - 1) * gapX) / cols;
  const cellH = (SAFE_CONTENT_BOUNDS.h - (rows - 1) * gapY) / rows;
  return {
    x: SAFE_CONTENT_BOUNDS.x + col * (cellW + gapX),
    y: SAFE_CONTENT_BOUNDS.y + row * (cellH + gapY),
    w: cellW * span + (span - 1) * gapX,
    h: cellH
  };
}

function paintBanner(slide, ctx, text, box) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: box.x, y: box.y, w: box.w, h: box.h,
    fill: { color: "FEF3C7" },
    line: { color: "F59E0B", width: 1.5 },
    shadow: { ...CARD_SHADOW }
  });
  slide.addText(String(text || ""), {
    x: box.x + 0.3, y: box.y + 0.06, w: box.w - 0.6, h: box.h - 0.12,
    fontSize: fitFontSize(String(text || ""), box.w - 0.6, box.h - 0.12, t.fontSize.body_large),
    bold: true,
    color: "92400E",
    align: "center",
    valign: "middle",
    fontFace: FONT_FAMILY
  });
}

function paintTextRuns(slide, ctx, { heading, body, box, bodyBase }) {
  const { t, fontFamily: FONT_FAMILY } = ctx;
  const innerW = box.w - 2 * ZONE_INSET;
  const innerH = box.h - 2 * ZONE_INSET;
  const bodySize = fitFontSize(String(body || ""), innerW, Math.max(0.3, innerH - 0.7), bodyBase);
  const runs = [];
  if (heading) {
    runs.push({ text: `${heading}\n\n`, options: { fontSize: bodySize, bold: true, color: t.primaryDark } });
  }
  runs.push({ text: String(body || ""), options: { fontSize: bodySize, color: t.ink } });
  slide.addText(runs, {
    x: box.x + ZONE_INSET, y: box.y + ZONE_INSET, w: innerW, h: innerH,
    fontSize: bodySize,
    valign: "top",
    fontFace: FONT_FAMILY
  });
}

function paintZone(slide, ctx, elem, box) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const props = elem.properties || {};
  const inner = [box.x + ZONE_INSET, box.y + ZONE_INSET, box.w - 2 * ZONE_INSET, box.h - 2 * ZONE_INSET];

  switch (elem.type) {
    case "conclusion_banner":
      paintBanner(slide, ctx, props.text, box);
      return;

    case "figure_number_line":
    case "figure_tianzige":
    case "figure_animation":
    case "figure_image": {
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: box.x, y: box.y, w: box.w, h: box.h,
        fill: { color: t.panel },
        line: { color: t.border, width: 1.2 },
        shadow: { ...CARD_SHADOW }
      });
      if (elem.type === "figure_number_line") {
        renderNumberLine(slide, pptx, { ...props, id: elem.id }, inner, t);
      } else if (elem.type === "figure_image") {
        renderFigure(slide, pptx, { kind: "image", ...props }, inner, t);
      } else {
        const kind = elem.type === "figure_tianzige" ? "tianzige" : "animation";
        renderFigure(slide, pptx, { kind, ...props }, inner, t);
      }
      return;
    }

    default: {
      // 文本类槽位统一容器卡 + 类型化内容
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: box.x, y: box.y, w: box.w, h: box.h,
        fill: { color: elem.type === "card_list" ? (t.chip || "F8FAFC") : t.panel },
        line: { color: t.border, width: 1.2 },
        shadow: { ...CARD_SHADOW }
      });
      const textInner = { x: box.x + ZONE_INSET, y: box.y + ZONE_INSET, w: box.w - 2 * ZONE_INSET, h: box.h - 2 * ZONE_INSET };

      if (elem.type === "text_card") {
        paintTextRuns(slide, ctx, { heading: props.title, body: props.body, box, bodyBase: t.fontSize.body });
      } else if (elem.type === "card_list") {
        const items = (Array.isArray(props.items) ? props.items : []).map(it => `• ${String(it)}`);
        const text = items.join("\n");
        const fitted = fitTextLayout(text, textInner.w, textInner.h, t.fontSize.body);
        slide.addText(fitted.text, {
          x: textInner.x + 0.1, y: textInner.y, w: textInner.w - 0.2, h: textInner.h,
          fontSize: fitted.size,
          color: t.ink,
          valign: "middle",
          fontFace: FONT_FAMILY
        });
      } else if (elem.type === "equation") {
        slide.addText(String(props.expression || ""), {
          x: textInner.x, y: textInner.y, w: textInner.w, h: textInner.h,
          fontSize: t.fontSize.body_large + 2,
          bold: true,
          color: t.primaryDark,
          align: "center",
          valign: "middle",
          fontFace: FONT_FAMILY
        });
      } else {
        // title / subtitle 等纯文本槽位
        slide.addText(String(props.text || ""), {
          x: textInner.x, y: textInner.y, w: textInner.w, h: textInner.h,
          fontSize: t.fontSize.body_large,
          bold: elem.type === "title",
          color: t.primaryDark,
          align: "center",
          valign: "middle",
          fontFace: FONT_FAMILY
        });
      }
    }
  }
}

export function render(slide, s, ctx) {
  const zoned = (s.elements || []).filter(e => e.properties && e.properties._zone);
  if (zoned.length === 0) {
    throw new Error(`[composite] 页面 ${s.slide_id || ""} 缺少 _zone 槽位标注, composite 页必须经规划层装配生成`);
  }
  const rows = Math.max(...zoned.map(e => e.properties._zone.row)) + 1;
  for (const elem of zoned) {
    const box = computeZoneBox(elem.properties._zone, rows);
    paintZone(slide, ctx, elem, box);
  }
}
