// -*- coding: utf-8 -*-
/**
 * 封面/封底装饰层与渲染器 (renderers/cover.js)
 *
 * 5 套构图全部只用整块色带、细线与虚线做区分, 标题/副标题文字盒保持
 * 在 x∈[1.0, 12.3]、y∈[1.7, 4.9] 的安全区内, 因此任意风格都不会越界或压盖。
 * 唯一例外是 academic 的右侧竖块, 它只铺在空白列 (x≥9.9), 不与文字盒相交。
 */

import { CANVAS_W, CANVAS_H } from "../../domain/canvas.js";

export function renderCoverDecor(slide, ctx, { title, subtitle }) {
  const { pptx, t, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const layout = t.cover?.layout || "center_rule";
  const radius = t.card?.radius ?? 0.06;
  const titleSize = t.fontSize.cover_title;
  const subSize = t.fontSize.cover_subtitle;

  slide.background = { color: t.bgTint };

  // 标题/副标题文字盒 (各构图只改对齐与纵向位置, 宽度始终在安全区内)
  const drawTitle = ({ x = 1.0, y = 2.15, w = CANVAS_W - 2.0, align = "center" } = {}) => {
    slide.addText(title, {
      x, y, w, h: 1.4,
      fontSize: titleSize,
      bold: true,
      color: t.ink,
      align,
      valign: "middle",
      fontFace: FONT_FAMILY
    });
    if (subtitle) {
      slide.addText(subtitle, {
        x, y: y + 1.5, w, h: 0.8,
        fontSize: subSize,
        color: t.muted,
        align,
        valign: "middle",
        fontFace: FONT_FAMILY
      });
    }
  };

  switch (layout) {
    case "center_band": {
      // 暖阳: 左侧色带 + 大圆角色块承载标题
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: 0.16, h: CANVAS_H,
        fill: { color: t.accent }, line: { color: t.accent, width: 0 }
      });
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 1.0, y: 1.8, w: CANVAS_W - 2.0, h: 2.6,
        fill: { color: t.chip }, line: { color: t.border, width: 1 }, rectRadius: 0.3,
        shadow: { ...CARD_SHADOW }
      });
      drawTitle({ y: 2.05 });
      break;
    }
    case "left_split": {
      // 学术: 右侧竖块 + 左对齐标题 + 标题下重线
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 9.9, y: 0, w: CANVAS_W - 9.9, h: CANVAS_H,
        fill: { color: t.chip }, line: { color: t.chip, width: 0 }
      });
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 9.9, y: 0, w: 0.07, h: CANVAS_H,
        fill: { color: t.primary }, line: { color: t.primary, width: 0 }
      });
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: 9.9, h: 0.05,
        fill: { color: t.primary }, line: { color: t.primary, width: 0 }
      });
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 1.0, y: 1.62, w: 0.7, h: 0.07,
        fill: { color: t.accent }, line: { color: t.accent, width: 0 }
      });
      drawTitle({ x: 1.0, y: 1.85, w: 8.4, align: "left" });
      break;
    }
    case "minimal": {
      // 极简: 上下发丝线, 左对齐, 无装饰色
      slide.addShape(pptx.shapes.LINE, {
        x: 1.0, y: 1.55, w: CANVAS_W - 2.0, h: 0,
        line: { color: t.ink, width: 0.75 }
      });
      slide.addShape(pptx.shapes.LINE, {
        x: 1.0, y: CANVAS_H - 1.3, w: CANVAS_W - 2.0, h: 0,
        line: { color: t.border, width: 0.75 }
      });
      drawTitle({ x: 1.0, y: 2.35, w: CANVAS_W - 2.4, align: "left" });
      break;
    }
    case "paper": {
      // 手账: 米黄纸 + 左侧墨绿书脊 + 上下虚线
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: 0.2, h: CANVAS_H,
        fill: { color: t.primary }, line: { color: t.primary, width: 0 }
      });
      slide.addShape(pptx.shapes.LINE, {
        x: 1.0, y: 1.5, w: CANVAS_W - 2.0, h: 0,
        line: { color: t.accent, width: 1.5, dashType: "dash" }
      });
      slide.addShape(pptx.shapes.LINE, {
        x: 1.0, y: CANVAS_H - 1.2, w: CANVAS_W - 2.0, h: 0,
        line: { color: t.border, width: 1, dashType: "dash" }
      });
      drawTitle({ y: 2.0 });
      break;
    }
    default: {
      // 清爽: 顶部主色条 + 标题上方短强调线 + 底部细线
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: CANVAS_W, h: 0.12,
        fill: { color: t.primary }, line: { color: t.primary, width: 0 }
      });
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: (CANVAS_W - 1.6) / 2, y: 1.6, w: 1.6, h: 0.1,
        fill: { color: t.accent }, line: { color: t.accent, width: 0 }, rectRadius: radius
      });
      slide.addShape(pptx.shapes.LINE, {
        x: 2.0, y: CANVAS_H - 0.9, w: CANVAS_W - 4.0, h: 0,
        line: { color: t.border, width: 0.75 }
      });
      drawTitle({ y: 2.1 });
    }
  }
}

export function renderTitleCover(slide, s, ctx) {
  const titleElem = s.elements.find(e => e.type === "title");
  renderCoverDecor(slide, ctx, {
    title: titleElem?.properties?.text || "",
    subtitle: titleElem?.properties?.subtitle || ""
  });
}

export function renderEndCover(slide, s, ctx) {
  const titleElem = s.elements.find(e => e.type === "title");
  renderCoverDecor(slide, ctx, {
    title: titleElem?.properties?.text || "同学们，下课！",
    subtitle: titleElem?.properties?.subtitle || "认真练习，熟能生巧"
  });
}
