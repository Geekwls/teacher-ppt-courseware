// -*- coding: utf-8 -*-
/**
 * 课件新页型与版式变体渲染器 (new_page_renderers.js)
 *
 * 核心目标:
 * 承载“旋钮 3｜版式变体”与“配套新页型”，通过 grid_slots 栅格槽位引擎实现纯确定性渲染，
 * 严格遵从几何安全区与对比度标准，杜绝文本溢出与重叠。
 */

import {
  SAFE_CONTENT_BOUNDS,
  INSET_CONTENT_BOUNDS,
  makeGridSlots,
  makeSplitSlots,
  makeListSlots
} from "./grid_slots.js";
import { fitTextLayout, fitFontSize, estimateLines } from "../text_fit.js";

/**
 * 1. 目标页变体渲染 (objectives_card: list / grid / split_lr)
 */
export function renderObjectivesCard(slide, pptx, t, s, cardShadow, fontFamily) {
  const cardList = s.elements.find(e => e.type === "card_list");
  const items = cardList?.properties?.items || [];
  const variant = s.layout_variant || "list";

  if (variant === "grid") {
    const cols = 2;
    const rows = Math.max(1, Math.ceil(items.length / cols));
    const slots = makeGridSlots(INSET_CONTENT_BOUNDS, { rows, cols, gapX: 0.4, gapY: 0.35 });

    items.forEach((item, idx) => {
      const slot = slots[idx];
      if (!slot) return;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        fill: { color: t.panel },
        line: { color: t.border, width: 1.2 },
        shadow: { ...cardShadow }
      });
      // 左侧高亮边饰
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: slot.x + 0.08, y: slot.y + 0.15, w: 0.08, h: slot.h - 0.3,
        fill: { color: t.primary }, line: { color: t.primary, width: 0 }
      });
      const fitted = fitTextLayout(item, slot.w - 0.6, slot.h - 0.3, t.fontSize.body);
      slide.addText(fitted.text, {
        x: slot.x + 0.3, y: slot.y + 0.15, w: slot.w - 0.5, h: slot.h - 0.3,
        fontSize: fitted.size,
        bold: true,
        color: t.ink,
        valign: "middle",
        fontFace: fontFamily
      });
    });
    return;
  }

  if (variant === "split_lr") {
    const [leftSlot, rightSlot] = makeSplitSlots(INSET_CONTENT_BOUNDS, { ratios: [0.35, 0.65], gap: 0.4 });

    // 左侧核心导向大卡
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: leftSlot.x, y: leftSlot.y, w: leftSlot.w, h: leftSlot.h,
      fill: { color: t.chip || "EFF6FF" },
      line: { color: t.primary, width: 1.5 },
      shadow: { ...cardShadow }
    });
    slide.addText([
      { text: "【核心学习导向】\n\n", options: { fontSize: t.fontSize.body_large, bold: true, color: t.primaryDark } },
      { text: "• 明确目标要求\n\n• 聚焦重点难点\n\n• 自主探究合作\n\n• 当堂检测达标", options: { fontSize: t.fontSize.body, color: t.ink } }
    ], {
      x: leftSlot.x + 0.3, y: leftSlot.y + 0.4, w: leftSlot.w - 0.6, h: leftSlot.h - 0.8,
      valign: "top", fontFace: fontFamily
    });

    // 右侧目标条目卡片流
    const rSlots = makeListSlots(rightSlot, { count: items.length, maxItemH: 1.35, gap: 0.25 });
    items.forEach((item, idx) => {
      const slot = rSlots[idx];
      if (!slot) return;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        fill: { color: t.panel },
        line: { color: t.border, width: 1.2 },
        shadow: { ...cardShadow }
      });
      const fitted = fitTextLayout(item, slot.w - 0.6, slot.h - 0.25, t.fontSize.body);
      slide.addText(fitted.text, {
        x: slot.x + 0.3, y: slot.y + 0.12, w: slot.w - 0.6, h: slot.h - 0.24,
        fontSize: fitted.size,
        bold: true,
        color: t.ink,
        valign: "middle",
        fontFace: fontFamily
      });
    });
    return;
  }

  // 默认 list: 经典纵向清单卡
  const slots = makeListSlots(INSET_CONTENT_BOUNDS, { count: items.length, maxItemH: 1.25, gap: 0.3 });
  items.forEach((item, idx) => {
    const slot = slots[idx];
    if (!slot) return;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: slot.x, y: slot.y, w: slot.w, h: slot.h,
      fill: { color: t.panel },
      line: { color: t.border, width: 1.2 },
      shadow: { ...cardShadow }
    });
    const fitted = fitTextLayout(item, slot.w - 0.6, slot.h - 0.25, t.fontSize.body);
    slide.addText(fitted.text, {
      x: slot.x + 0.3, y: slot.y + 0.12, w: slot.w - 0.6, h: slot.h - 0.24,
      fontSize: fitted.size,
      bold: true,
      color: t.ink,
      valign: "middle",
      fontFace: fontFamily
    });
  });
}

/**
 * 2. 练习页变体渲染 (practice_list: single_column / two_column / timed_challenge)
 */
export function renderPracticeList(slide, pptx, t, s, cardShadow, fontFamily) {
  const prElem = s.elements.find(e => e.type === "practice_list");
  const qs = prElem?.properties?.questions || [];
  const variant = s.layout_variant || "single_column";

  if (variant === "two_column") {
    const cols = 2;
    const rows = Math.max(1, Math.ceil(qs.length / cols));
    const slots = makeGridSlots(INSET_CONTENT_BOUNDS, { rows, cols, gapX: 0.4, gapY: 0.25 });

    qs.forEach((qText, idx) => {
      const slot = slots[idx];
      if (!slot) return;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        fill: { color: t.panel },
        line: { color: t.border, width: 1.2 },
        shadow: { ...cardShadow }
      });
      const fitted = fitTextLayout(qText, slot.w - 0.5, slot.h - 0.2, Math.min(t.fontSize.body, 17));
      slide.addText(fitted.text, {
        x: slot.x + 0.25, y: slot.y + 0.1, w: slot.w - 0.5, h: slot.h - 0.2,
        fontSize: fitted.size,
        bold: true,
        color: t.ink,
        valign: "middle",
        fontFace: fontFamily
      });
    });
    return;
  }

  if (variant === "timed_challenge") {
    // 顶部闯关提示横幅
    const bannerH = 0.85;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: INSET_CONTENT_BOUNDS.x, y: INSET_CONTENT_BOUNDS.y, w: INSET_CONTENT_BOUNDS.w, h: bannerH,
      fill: { color: "FEF3C7" },
      line: { color: "F59E0B", width: 1.5 },
      shadow: { ...cardShadow }
    });
    slide.addText("⏱【限时挑战 · 5分钟独立作答】请在规定时间内独立思考、专注作答，字迹工整，当堂达标！", {
      x: INSET_CONTENT_BOUNDS.x + 0.3, y: INSET_CONTENT_BOUNDS.y + 0.1, w: INSET_CONTENT_BOUNDS.w - 0.6, h: bannerH - 0.2,
      fontSize: t.fontSize.body,
      bold: true,
      color: "92400E",
      valign: "middle",
      fontFace: fontFamily
    });

    const remainBounds = {
      x: INSET_CONTENT_BOUNDS.x,
      y: INSET_CONTENT_BOUNDS.y + bannerH + 0.25,
      w: INSET_CONTENT_BOUNDS.w,
      h: INSET_CONTENT_BOUNDS.h - bannerH - 0.25
    };
    const slots = (() => {
      // 按"实际需要几行"分配卡片高度: 等分会让长选项被压到 14pt 以下,
      // 短题却空着大半张卡。给多行题多分高度, 短题保底 0.85in。
      const gap = 0.25;
      const totalH = remainBounds.h - gap * Math.max(0, qs.length - 1);
      const usableW = remainBounds.w - 1.2;
      const baseSize = Math.min(t.fontSize.body, 17);
      const weights = qs.map(q => Math.max(1, estimateLines(String(q ?? ""), usableW, baseSize)));
      const minH = 0.85;
      let heights;
      if (totalH >= minH * qs.length) {
        const extra = totalH - minH * qs.length;
        const wsum = weights.reduce((acc, w) => acc + (w - 1), 0);
        heights = weights.map(w => minH + (wsum > 0 ? (extra * (w - 1)) / wsum : extra / qs.length));
      } else {
        heights = weights.map(() => totalH / qs.length);
      }
      let cy = remainBounds.y;
      return qs.map((_, i) => {
        const slot = { x: remainBounds.x, y: cy, w: remainBounds.w, h: heights[i] };
        cy += heights[i] + gap;
        return slot;
      });
    })();
    qs.forEach((qText, idx) => {
      const slot = slots[idx];
      if (!slot) return;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        fill: { color: t.panel },
        line: { color: t.border, width: 1.2 },
        shadow: { ...cardShadow }
      });
      // 挑战编号角标
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: slot.x + 0.15, y: slot.y + 0.15, w: 0.75, h: slot.h - 0.3,
        fill: { color: "F59E0B" }, line: { color: "F59E0B", width: 0 }
      });
      slide.addText(`关卡${idx + 1}`, {
        x: slot.x + 0.15, y: slot.y + 0.15, w: 0.75, h: slot.h - 0.3,
        fontSize: 12, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontFamily
      });
      const fitted = fitTextLayout(qText, slot.w - 1.2, slot.h - 0.2, Math.min(t.fontSize.body, 17));
      slide.addText(fitted.text, {
        x: slot.x + 1.05, y: slot.y + 0.1, w: slot.w - 1.2, h: slot.h - 0.2,
        fontSize: fitted.size,
        bold: true,
        color: t.ink,
        valign: "middle",
        fontFace: fontFamily
      });
    });
    return;
  }

  // 默认 single_column: 经典单列大题卡
  const slots = makeListSlots(INSET_CONTENT_BOUNDS, { count: qs.length, maxItemH: 1.05, gap: 0.25 });
  qs.forEach((qText, idx) => {
    const slot = slots[idx];
    if (!slot) return;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: slot.x, y: slot.y, w: slot.w, h: slot.h,
      fill: { color: t.panel },
      line: { color: t.border, width: 1.2 },
      shadow: { ...cardShadow }
    });
    const fitted = fitTextLayout(qText, slot.w - 0.6, slot.h - 0.2, Math.min(t.fontSize.body, 18));
    slide.addText(fitted.text, {
      x: slot.x + 0.3, y: slot.y + 0.1, w: slot.w - 0.6, h: slot.h - 0.2,
      fontSize: fitted.size,
      bold: true,
      color: t.ink,
      valign: "middle",
      fontFace: fontFamily
    });
  });
}

/**
 * 3. 小结页变体渲染 (summary_card: points / tree / mindmap)
 */
export function renderSummaryCard(slide, pptx, t, s, cardShadow, fontFamily) {
  const sumCard = s.elements.find(e => e.type === "card_list");
  const items = sumCard?.properties?.items || [];
  const variant = s.layout_variant || "points";

  if (variant === "tree") {
    const [leftSlot, rightSlot] = makeSplitSlots(INSET_CONTENT_BOUNDS, { ratios: [0.35, 0.65], gap: 0.4 });

    // 左侧知识主干
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: leftSlot.x, y: leftSlot.y, w: leftSlot.w, h: leftSlot.h,
      fill: { color: t.chip || "EFF6FF" },
      line: { color: t.primary, width: 1.5 },
      shadow: { ...cardShadow }
    });
    slide.addText([
      { text: "【知识主干脉络】\n\n", options: { fontSize: t.fontSize.body_large, bold: true, color: t.primaryDark } },
      { text: "知识网络互联\n核心规律提炼\n构建认知模型", options: { fontSize: t.fontSize.body, color: t.ink } }
    ], {
      x: leftSlot.x + 0.3, y: leftSlot.y + 0.4, w: leftSlot.w - 0.6, h: leftSlot.h - 0.8,
      valign: "top", fontFace: fontFamily
    });

    // 右侧要点展开
    const rSlots = makeListSlots(rightSlot, { count: items.length, maxItemH: 1.35, gap: 0.25 });
    items.forEach((item, idx) => {
      const slot = rSlots[idx];
      if (!slot) return;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        fill: { color: t.panel },
        line: { color: t.primary, width: 1.2 },
        shadow: { ...cardShadow }
      });
      const fitted = fitTextLayout(item, slot.w - 0.6, slot.h - 0.25, t.fontSize.body_large);
      slide.addText(fitted.text, {
        x: slot.x + 0.3, y: slot.y + 0.12, w: slot.w - 0.6, h: slot.h - 0.24,
        fontSize: fitted.size,
        bold: true,
        color: t.primaryDark,
        valign: "middle",
        fontFace: fontFamily
      });
    });
    return;
  }

  if (variant === "mindmap") {
    // 顶部思维导图核心主题胶囊
    const topH = 0.85;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: INSET_CONTENT_BOUNDS.x + 2.0, y: INSET_CONTENT_BOUNDS.y, w: INSET_CONTENT_BOUNDS.w - 4.0, h: topH,
      fill: { color: t.primary },
      line: { color: t.primaryDark, width: 1.2 },
      shadow: { ...cardShadow }
    });
    slide.addText("★ 本课知识网络", {
      x: INSET_CONTENT_BOUNDS.x + 2.1, y: INSET_CONTENT_BOUNDS.y + 0.1, w: INSET_CONTENT_BOUNDS.w - 4.2, h: topH - 0.2,
      fontSize: t.fontSize.body_large,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: fontFamily
    });

    const remainBounds = {
      x: INSET_CONTENT_BOUNDS.x,
      y: INSET_CONTENT_BOUNDS.y + topH + 0.35,
      w: INSET_CONTENT_BOUNDS.w,
      h: INSET_CONTENT_BOUNDS.h - topH - 0.35
    };
    const cols = Math.min(3, Math.max(1, items.length));
    // 分支卡不需要撑满整块剩余高度: 定高 + 垂直居中, 才像"导图节点"而不是三块面板
    const baseSlots = makeGridSlots(remainBounds, { rows: 1, cols, gapX: 0.35, gapY: 0.2 });
    const cardH = Math.min(remainBounds.h, 2.7);
    const cardY = remainBounds.y + (remainBounds.h - cardH) / 2;
    const slots = baseSlots.map(s => ({ ...s, y: cardY, h: cardH }));
    const branchColors = [t.primary, t.accent, t.primaryDark];

    // 中心节点 → 分支的正交连线 (竖直干线 + 横向母线 + 分支短竖),
    // 让"思维导图"名副其实, 而不是三张并排卡片。
    const trunkX = INSET_CONTENT_BOUNDS.x + INSET_CONTENT_BOUNDS.w / 2;
    const trunkTop = INSET_CONTENT_BOUNDS.y + topH;
    const busY = trunkTop + Math.max(0.12, (cardY - trunkTop) * 0.55);
    const connector = { color: "94A3B8", width: 1.75 };
    slide.addShape(pptx.shapes.LINE, { x: trunkX, y: trunkTop, w: 0, h: busY - trunkTop, line: connector });
    if (slots.length > 1) {
      const leftX = slots[0].x + slots[0].w / 2;
      const rightX = slots[slots.length - 1].x + slots[slots.length - 1].w / 2;
      slide.addShape(pptx.shapes.LINE, { x: leftX, y: busY, w: rightX - leftX, h: 0, line: connector });
    }
    slots.forEach(slot => {
      slide.addShape(pptx.shapes.LINE, {
        x: slot.x + slot.w / 2, y: busY, w: 0,
        h: Math.max(0.01, slot.y - busY),
        line: connector
      });
    });

    items.forEach((item, idx) => {
      const slot = slots[idx];
      if (!slot) return;
      const bColor = branchColors[idx] || t.primary;

      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        fill: { color: t.panel },
        line: { color: t.border, width: 1.2 },
        shadow: { ...cardShadow }
      });

      // 分支顶部小胶囊
      const rawText = String(item).trim();
      let branchTitle = `要点 ${idx + 1}`;
      let branchBody = rawText;
      if (rawText.includes("：") || rawText.includes(":")) {
        const parts = rawText.split(/[:：]/);
        branchTitle = parts[0].trim();
        branchBody = parts.slice(1).join("：").trim();
      }

      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: slot.x + 0.15, y: slot.y + 0.15, w: slot.w - 0.3, h: 0.48,
        fill: { color: t.chip || "EFF6FF" },
        line: { color: bColor, width: 1.2 }
      });
      slide.addText(`【${branchTitle}】`, {
        x: slot.x + 0.2, y: slot.y + 0.16, w: slot.w - 0.4, h: 0.46,
        fontSize: t.fontSize.body,
        bold: true,
        color: bColor,
        align: "center",
        valign: "middle",
        fontFace: fontFamily
      });

      // 分支内容要点
      const fitted = fitTextLayout(branchBody, slot.w - 0.5, slot.h - 0.85, t.fontSize.body);
      slide.addText(fitted.text, {
        x: slot.x + 0.25, y: slot.y + 0.75, w: slot.w - 0.5, h: slot.h - 0.85,
        fontSize: fitted.size,
        color: t.ink,
        valign: "middle",
        fontFace: fontFamily
      });
    });
    return;
  }

  // 默认 points: 经典纵向要点卡
  const slots = makeListSlots(INSET_CONTENT_BOUNDS, { count: items.length, maxItemH: 1.25, gap: 0.3 });
  items.forEach((item, idx) => {
    const slot = slots[idx];
    if (!slot) return;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: slot.x, y: slot.y, w: slot.w, h: slot.h,
      fill: { color: t.panel },
      line: { color: t.primary, width: 1.5 },
      shadow: { ...cardShadow }
    });
    const fitted = fitTextLayout(item, slot.w - 0.8, slot.h - 0.3, t.fontSize.body_large);
    slide.addText(fitted.text, {
      x: slot.x + 0.4, y: slot.y + 0.15, w: slot.w - 0.8, h: slot.h - 0.3,
      fontSize: fitted.size,
      bold: true,
      color: t.primaryDark,
      valign: "middle",
      fontFace: fontFamily
    });
  });
}

/**
 * 4. 新页型: 活动指令卡 (activity_instruction)
 */
export function renderActivityInstruction(slide, pptx, t, s, cardShadow, fontFamily) {
  const actElem = s.elements.find(e => e.type === "activity_card")?.properties || {};
  const actType = actElem.activity_type || "小组合作探究";
  const duration = actElem.duration || "4分钟";
  const tasks = Array.isArray(actElem.tasks) ? actElem.tasks : [];
  const prompt = actElem.prompt || "表达清晰，倾听专注，相互补充。";

  // 1. 顶部活动形式与时长横幅
  const topH = 0.95;
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: INSET_CONTENT_BOUNDS.x, y: INSET_CONTENT_BOUNDS.y, w: INSET_CONTENT_BOUNDS.w, h: topH,
    fill: { color: t.chip || "EFF6FF" },
    line: { color: t.primary, width: 1.5 },
    shadow: { ...cardShadow }
  });
  slide.addText([
    { text: `【活动组织】${actType}    `, options: { fontSize: t.fontSize.body_large, bold: true, color: t.primaryDark } },
    { text: `⏱ 建议时长：${duration}`, options: { fontSize: t.fontSize.body, bold: true, color: t.accent || "2563EB" } }
  ], {
    x: INSET_CONTENT_BOUNDS.x + 0.3, y: INSET_CONTENT_BOUNDS.y + 0.15, w: INSET_CONTENT_BOUNDS.w - 0.6, h: topH - 0.3,
    valign: "middle", fontFace: fontFamily
  });

  // 2. 中间任务清单
  const midBounds = {
    x: INSET_CONTENT_BOUNDS.x,
    y: INSET_CONTENT_BOUNDS.y + topH + 0.25,
    w: INSET_CONTENT_BOUNDS.w,
    h: 2.85
  };
  const taskCount = Math.max(1, tasks.length);
  const slots = makeListSlots(midBounds, { count: taskCount, maxItemH: 0.85, gap: 0.2 });

  tasks.forEach((taskText, idx) => {
    const slot = slots[idx];
    if (!slot) return;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: slot.x, y: slot.y, w: slot.w, h: slot.h,
      fill: { color: t.panel },
      line: { color: t.border, width: 1.2 },
      shadow: { ...cardShadow }
    });
    // 步骤标签
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: slot.x + 0.15, y: slot.y + 0.12, w: 0.95, h: slot.h - 0.24,
      fill: { color: t.primary }, line: { color: t.primary, width: 0 }
    });
    slide.addText(`步骤 ${idx + 1}`, {
      x: slot.x + 0.15, y: slot.y + 0.12, w: 0.95, h: slot.h - 0.24,
      fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontFamily
    });
    const fitted = fitTextLayout(taskText, slot.w - 1.4, slot.h - 0.2, t.fontSize.body);
    slide.addText(fitted.text, {
      x: slot.x + 1.25, y: slot.y + 0.1, w: slot.w - 1.4, h: slot.h - 0.2,
      fontSize: fitted.size,
      bold: true,
      color: t.ink,
      valign: "middle",
      fontFace: fontFamily
    });
  });

  // 3. 底部汇报产出提示横幅
  const botY = INSET_CONTENT_BOUNDS.y + topH + 0.25 + midBounds.h + 0.15;
  const botH = 0.8;
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: INSET_CONTENT_BOUNDS.x, y: botY, w: INSET_CONTENT_BOUNDS.w, h: botH,
    fill: { color: "ECFDF5" },
    line: { color: "10B981", width: 1.5 },
    shadow: { ...cardShadow }
  });
  slide.addText(`★ 交流与汇报提示：${prompt}`, {
    x: INSET_CONTENT_BOUNDS.x + 0.3, y: botY + 0.1, w: INSET_CONTENT_BOUNDS.w - 0.6, h: botH - 0.2,
    fontSize: t.fontSize.body,
    bold: true,
    color: "065F46",
    valign: "middle",
    fontFace: fontFamily
  });
}

/**
 * 5. 新页型: 对比表 (comparison_table)
 */
export function renderComparisonTable(slide, pptx, t, s, cardShadow, fontFamily) {
  const tblElem = s.elements.find(e => e.type === "comparison_table")?.properties || {};
  const bannerElem = s.elements.find(e => e.type === "conclusion_banner");
  const headers = Array.isArray(tblElem.headers) && tblElem.headers.length > 0
    ? tblElem.headers
    : ["对比维度", "常见误区 / 对照项", "标准做法 / 核心规律"];
  const rows = Array.isArray(tblElem.rows) && tblElem.rows.length > 0
    ? tblElem.rows
    : [["核心特征", "混淆概念或步骤缺失", "抓准本质，规范书写解题"]];
  const summaryTip = bannerElem?.properties?.text || tblElem.summary_tip;

  const colCount = headers.length;
  const gap = 0.15;
  const totalGap = (colCount - 1) * gap;
  const colW = (INSET_CONTENT_BOUNDS.w - totalGap) / colCount;

  // 表头行
  const headerY = INSET_CONTENT_BOUNDS.y;
  const headerH = 0.7;
  headers.forEach((hText, cIdx) => {
    const cx = INSET_CONTENT_BOUNDS.x + cIdx * (colW + gap);
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: headerY, w: colW, h: headerH,
      fill: { color: cIdx === 1 ? "DC2626" : (cIdx === 2 ? "059669" : t.primary) },
      line: { color: t.border, width: 0 },
      shadow: { ...cardShadow }
    });
    slide.addText(hText, {
      x: cx + 0.1, y: headerY + 0.05, w: colW - 0.2, h: headerH - 0.1,
      fontSize: t.fontSize.body,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: fontFamily
    });
  });

  // 数据行
  const availH = summaryTip ? 3.2 : 4.0;
  const rowCount = Math.max(1, rows.length);
  const rowH = Math.min(1.2, (availH - (rowCount - 1) * 0.15) / rowCount);

  rows.forEach((row, rIdx) => {
    const ry = headerY + headerH + 0.15 + rIdx * (rowH + 0.15);
    (Array.isArray(row) ? row : []).slice(0, colCount).forEach((cellText, cIdx) => {
      const cx = INSET_CONTENT_BOUNDS.x + cIdx * (colW + gap);
      const isWrongCol = cIdx === 1;
      const isRightCol = cIdx === 2;

      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: cx, y: ry, w: colW, h: rowH,
        fill: { color: isWrongCol ? "FEF2F2" : (isRightCol ? "ECFDF5" : t.panel) },
        line: { color: isWrongCol ? "EF4444" : (isRightCol ? "10B981" : t.border), width: 1.2 },
        shadow: { ...cardShadow }
      });

      const textColor = isWrongCol ? "991B1B" : (isRightCol ? "065F46" : t.ink);
      const fitted = fitTextLayout(String(cellText || ""), colW - 0.4, rowH - 0.2, t.fontSize.body - 1);
      slide.addText(fitted.text, {
        x: cx + 0.2, y: ry + 0.1, w: colW - 0.4, h: rowH - 0.2,
        fontSize: fitted.size,
        bold: isRightCol || isWrongCol,
        color: textColor,
        valign: "middle",
        fontFace: fontFamily
      });
    });
  });

  // 底部结论横幅
  if (summaryTip) {
    const tipY = INSET_CONTENT_BOUNDS.y + headerH + 0.15 + availH + 0.15;
    const tipH = 0.8;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: INSET_CONTENT_BOUNDS.x, y: tipY, w: INSET_CONTENT_BOUNDS.w, h: tipH,
      fill: { color: "FEF3C7" },
      line: { color: "F59E0B", width: 1.5 },
      shadow: { ...cardShadow }
    });
    slide.addText(`★ 对比启示：${summaryTip}`, {
      x: INSET_CONTENT_BOUNDS.x + 0.3, y: tipY + 0.1, w: INSET_CONTENT_BOUNDS.w - 0.6, h: tipH - 0.2,
      fontSize: t.fontSize.body,
      bold: true,
      color: "92400E",
      valign: "middle",
      fontFace: fontFamily
    });
  }
}

/**
 * 6. 新页型: 知识树 (knowledge_tree)
 */
export function renderKnowledgeTree(slide, pptx, t, s, cardShadow, fontFamily) {
  const treeElem = s.elements.find(e => e.type === "tree_graph")?.properties || {};
  const rootTopic = treeElem.root_topic || "单元核心知识网络";
  const branches = Array.isArray(treeElem.branches) ? treeElem.branches : [];

  // 顶部课题根节点
  const rootH = 0.95;
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: INSET_CONTENT_BOUNDS.x, y: INSET_CONTENT_BOUNDS.y, w: INSET_CONTENT_BOUNDS.w, h: rootH,
    fill: { color: t.chip || "EFF6FF" },
    line: { color: t.primary, width: 1.5 },
    shadow: { ...cardShadow }
  });
  slide.addText(`🌳 知识主干：${rootTopic}`, {
    x: INSET_CONTENT_BOUNDS.x + 0.3, y: INSET_CONTENT_BOUNDS.y + 0.15, w: INSET_CONTENT_BOUNDS.w - 0.6, h: rootH - 0.3,
    fontSize: t.fontSize.body_large,
    bold: true,
    color: t.primaryDark,
    align: "center",
    valign: "middle",
    fontFace: fontFamily
  });

  // 底部各分支卡片
  const bBounds = {
    x: INSET_CONTENT_BOUNDS.x,
    y: INSET_CONTENT_BOUNDS.y + rootH + 0.3,
    w: INSET_CONTENT_BOUNDS.w,
    h: INSET_CONTENT_BOUNDS.h - rootH - 0.3
  };
  const bCount = Math.max(1, Math.min(3, branches.length));
  const slots = makeGridSlots(bBounds, { rows: 1, cols: bCount, gapX: 0.35, gapY: 0.2 });

  branches.slice(0, 3).forEach((branch, idx) => {
    const slot = slots[idx];
    if (!slot) return;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: slot.x, y: slot.y, w: slot.w, h: slot.h,
      fill: { color: t.panel },
      line: { color: t.border, width: 1.2 },
      shadow: { ...cardShadow }
    });

    // 分支标题横条
    slide.addShape(pptx.shapes.RECTANGLE, {
      x: slot.x + 0.15, y: slot.y + 0.1, w: slot.w - 0.3, h: 0.08,
      fill: { color: idx === 0 ? t.primary : (idx === 1 ? t.accent : t.primaryDark) },
      line: { color: t.primary, width: 0 }
    });
    const bName = branch.name || branch.title || `分支 ${idx + 1}`;
    slide.addText(bName, {
      x: slot.x + 0.25, y: slot.y + 0.25, w: slot.w - 0.5, h: 0.45,
      fontSize: t.fontSize.body,
      bold: true,
      color: t.primaryDark,
      valign: "middle",
      fontFace: fontFamily
    });

    // 分支要点叶子
    const leaves = branch.leaves || branch.items || [];
    const itemTop = slot.y + 0.8;
    const itemH = 0.72;
    leaves.slice(0, 4).forEach((leaf, lIdx) => {
      const fitted = fitTextLayout(`🌿 ${leaf}`, slot.w - 0.5, itemH - 0.06, t.fontSize.body - 1);
      slide.addText(fitted.text, {
        x: slot.x + 0.25, y: itemTop + lIdx * itemH, w: slot.w - 0.5, h: itemH - 0.06,
        fontSize: fitted.size,
        color: t.ink,
        valign: "middle",
        fontFace: fontFamily
      });
    });
  });
}
