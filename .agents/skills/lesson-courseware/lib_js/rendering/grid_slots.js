// -*- coding: utf-8 -*-
/**
 * 栅格与槽位几何计算引擎 (grid_slots.js)
 *
 * 核心目标:
 * 把幻灯片的绝对坐标硬编码收敛为参数化几何区块，杜绝“为增加版式变体而复制坐标”。
 * 
 * 契约规范:
 * 1. 宽屏画布 W = 13.333in, H = 7.5in;
 * 2. 页眉区域占位 y: 0.0 ~ 1.35in, 页脚占位 y: 6.7 ~ 7.5in;
 * 3. 安全有效内容区 SafeBounds 缺省为 x: 0.8, y: 1.45, w: 11.733, h: 5.15in。
 */

export const CANVAS_W = 13.333;
export const CANVAS_H = 7.5;

export const SAFE_CONTENT_BOUNDS = {
  x: 0.8,
  y: 1.45,
  w: 11.733,
  h: 5.15
};

export const INSET_CONTENT_BOUNDS = {
  x: 1.0,
  y: 1.55,
  w: 11.333,
  h: 4.95
};

/**
 * 网格槽位生成器 (行列矩阵)
 * @param {object} bounds 容器边界 { x, y, w, h }
 * @param {object} options
 *   - rows: 行数 (默认 2)
 *   - cols: 列数 (默认 2)
 *   - gapX: 列间距 (英寸, 默认 0.3)
 *   - gapY: 行间距 (英寸, 默认 0.25)
 * @returns {Array<{ x:number, y:number, w:number, h:number, row:number, col:number, index:number }>}
 */
export function makeGridSlots(bounds = SAFE_CONTENT_BOUNDS, {
  rows = 2,
  cols = 2,
  gapX = 0.3,
  gapY = 0.25
} = {}) {
  const r = Math.max(1, Number(rows) || 1);
  const c = Math.max(1, Number(cols) || 1);
  const totalGapX = (c - 1) * gapX;
  const totalGapY = (r - 1) * gapY;
  const slotW = Math.max(0.1, (bounds.w - totalGapX) / c);
  const slotH = Math.max(0.1, (bounds.h - totalGapY) / r);

  const slots = [];
  let idx = 0;
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      slots.push({
        index: idx++,
        row,
        col,
        x: Number((bounds.x + col * (slotW + gapX)).toFixed(3)),
        y: Number((bounds.y + row * (slotH + gapY)).toFixed(3)),
        w: Number(slotW.toFixed(3)),
        h: Number(slotH.toFixed(3))
      });
    }
  }
  return slots;
}

/**
 * 分栏槽位生成器 (非对称或等比分栏)
 * @param {object} bounds 容器边界
 * @param {object} options
 *   - ratios: 分栏比例数组, 如 [0.4, 0.6] 或 [1, 1, 1]
 *   - gap: 栏间距 (英寸, 默认 0.35)
 *   - direction: "horizontal" (左右分栏) | "vertical" (上下分栏)
 * @returns {Array<{ x:number, y:number, w:number, h:number, index:number, ratio:number }>}
 */
export function makeSplitSlots(bounds = SAFE_CONTENT_BOUNDS, {
  ratios = [0.5, 0.5],
  gap = 0.35,
  direction = "horizontal"
} = {}) {
  const normRatios = Array.isArray(ratios) && ratios.length > 0 ? ratios : [1, 1];
  const count = normRatios.length;
  const sumRatio = normRatios.reduce((acc, v) => acc + (Number(v) || 1), 0);
  const totalGap = (count - 1) * gap;

  if (direction === "vertical") {
    const availH = Math.max(0.1, bounds.h - totalGap);
    let curY = bounds.y;
    return normRatios.map((ratio, index) => {
      const h = Number((availH * (ratio / sumRatio)).toFixed(3));
      const slot = {
        index,
        ratio,
        x: bounds.x,
        y: Number(curY.toFixed(3)),
        w: bounds.w,
        h
      };
      curY += h + gap;
      return slot;
    });
  }

  // 默认水平左右分栏
  const availW = Math.max(0.1, bounds.w - totalGap);
  let curX = bounds.x;
  return normRatios.map((ratio, index) => {
    const w = Number((availW * (ratio / sumRatio)).toFixed(3));
    const slot = {
      index,
      ratio,
      x: Number(curX.toFixed(3)),
      y: bounds.y,
      w,
      h: bounds.h
    };
    curX += w + gap;
    return slot;
  });
}

/**
 * 序列卡片流槽位生成器 (纵向或横向线性列表)
 * @param {object} bounds 容器边界
 * @param {object} options
 *   - count: 条目数
 *   - itemH: 单项固定高度 (若为 null 则在 bounds.h 内根据 gap 均分)
 *   - maxItemH: 单项最大高度限制 (防止项少时卡片过高变形)
 *   - gap: 间距 (默认 0.2)
 *   - direction: "vertical" | "horizontal"
 * @returns {Array<{ x:number, y:number, w:number, h:number, index:number }>}
 */
export function makeListSlots(bounds = SAFE_CONTENT_BOUNDS, {
  count = 3,
  itemH = null,
  maxItemH = 1.45,
  gap = 0.2,
  direction = "vertical"
} = {}) {
  const n = Math.max(1, Number(count) || 1);

  if (direction === "vertical") {
    let finalH;
    let finalGap = gap;
    if (itemH !== null && itemH !== undefined) {
      finalH = Math.min(itemH, bounds.h / n);
    } else {
      const computedH = (bounds.h - (n - 1) * gap) / n;
      finalH = Math.min(maxItemH, Math.max(0.6, computedH));
      // 如果限制了 maxItemH 且有多余纵向空间，适当增大 gap 居中排布
      if (computedH > maxItemH && n > 1) {
        finalGap = (bounds.h - n * finalH) / (n - 1);
      }
    }

    const startY = bounds.y + Math.max(0, (bounds.h - (n * finalH + (n - 1) * finalGap)) / 2);
    const slots = [];
    for (let i = 0; i < n; i++) {
      slots.push({
        index: i,
        x: bounds.x,
        y: Number((startY + i * (finalH + finalGap)).toFixed(3)),
        w: bounds.w,
        h: Number(finalH.toFixed(3))
      });
    }
    return slots;
  }

  // 水平排列
  const slotW = (bounds.w - (n - 1) * gap) / n;
  const slots = [];
  for (let i = 0; i < n; i++) {
    slots.push({
      index: i,
      x: Number((bounds.x + i * (slotW + gap)).toFixed(3)),
      y: bounds.y,
      w: Number(slotW.toFixed(3)),
      h: bounds.h
    });
  }
  return slots;
}
