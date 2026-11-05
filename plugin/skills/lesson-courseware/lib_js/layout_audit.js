// -*- coding: utf-8 -*-
/**
 * 渲染结果几何审计 (layout_audit.js)
 *
 * 设计目标: 校验门禁只管 JSON 契约, 管不到「文字是否被裁切 / 是否压在一起 /
 * 是否跑出画布 / 答案有没有被静默丢掉」。本模块在 pptx 写盘前读取
 * PptxGenJS 已排布好的形状数据, 做一次确定性的几何体检, 结果写入回执。
 *
 * 不修改任何渲染调用点: 只读取 slide._slideObjects 里的 x/y/w/h/text/fontSize。
 * 估算采用「字宽 em」模型, 阈值刻意放宽, 目的是拦截肉眼可见的硬伤而非追求像素级精确。
 */

const EMU_PER_INCH = 914400;
const CJK = /[\u1100-\u115F\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFF60]/;
const EDGE_TOLERANCE = 0.02;

function issue(slide, label, code, severity, message, hint = null) {
  const out = { slide, label, code, severity, message };
  if (hint) out.hint = hint;
  return out;
}

function textOf(obj) {
  const t = obj?.text;
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    // breakLine 表示「该 run 之后换行」; 末尾 run 的 breakLine 不产生真实段落
    // (pptxgenjs 写盘时不会为它输出空 <a:p>), 这里同样不能多计一行。
    return t
      .map((r, i) => String(r?.text ?? "") + (r?.options?.breakLine && i < t.length - 1 ? "\n" : ""))
      .join("");
  }
  return "";
}

function fontSizeOf(obj) {
  let size = Number(obj?.options?.fontSize) || 0;
  if (Array.isArray(obj?.text)) {
    for (const r of obj.text) {
      const s = Number(r?.options?.fontSize) || 0;
      if (s > size) size = s;
    }
  }
  return size > 0 ? size : 18;
}

function charEm(ch) {
  if (ch === " " || ch === "\t") return 0.30;
  if (CJK.test(ch)) return 1.0;
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[A-Za-z]/.test(ch)) return 0.55;
  if (/[.,;:!?'"`()\[\]{}<>|_\-+=~^$%#@&\\/]/.test(ch)) return 0.42;
  return 0.85;
}

function neededLines(text, widthIn, sizePt, marginPt) {
  const usable = Math.max(0.4, widthIn - (marginPt * 2) / 72 - 0.10);
  let lines = 1;
  let used = 0;
  for (const ch of text) {
    if (ch === "\n") {
      lines++;
      used = 0;
      continue;
    }
    const cw = (charEm(ch) * sizePt) / 72;
    if (used + cw > usable && used > 0) {
      lines++;
      used = cw;
    } else {
      used += cw;
    }
  }
  return lines;
}

function overlapRatio(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const minArea = Math.min(a.w * a.h, b.w * b.h);
  return minArea > 0 ? (ix * iy) / minArea : 0;
}

function shapeGeom(obj) {
  const o = obj?.options || {};
  const raw = {
    x: Number(o.x) || 0,
    y: Number(o.y) || 0,
    w: Number(o.w) || 0,
    h: Number(o.h) || 0
  };
  // PptxGenJS 部分内部路径(表格/媒体/图元)直接写入 EMU, 统一折算为英寸
  const isEmu = Math.max(raw.x, raw.y, raw.w, raw.h) > 100;
  const k = isEmu ? EMU_PER_INCH : 1;
  return { x: raw.x / k, y: raw.y / k, w: raw.w / k, h: raw.h / k };
}

/**
 * @param {object} pptx PptxGenJS 实例 (已 addSlide/render, 尚未 writeFile)
 * @param {string[]} labels 与 _slides 一一对应的页面标签
 * @param {object} expectations 可选, { answerPages: [{ index, expected }] }
 */
export function auditDeck(pptx, labels = [], expectations = {}) {
  const slides = pptx?._slides || [];
  const layout = pptx?._presLayout || {};
  const canvasW = (Number(layout.width) || 13.333 * EMU_PER_INCH) / EMU_PER_INCH;
  const canvasH = (Number(layout.height) || 7.5 * EMU_PER_INCH) / EMU_PER_INCH;
  const issues = [];

  slides.forEach((slide, idx) => {
    const page = idx + 1;
    const label = labels[idx] || `slide-${page}`;
    const objects = slide?._slideObjects || [];
    const textBoxes = [];

    objects.forEach((obj, oi) => {
      const g = shapeGeom(obj);
      if (g.w <= 0 || g.h <= 0) return;

      // 1. 画布越界
      if (
        g.x < -EDGE_TOLERANCE ||
        g.y < -EDGE_TOLERANCE ||
        g.x + g.w > canvasW + EDGE_TOLERANCE ||
        g.y + g.h > canvasH + EDGE_TOLERANCE
      ) {
        issues.push(issue(page, label, "SHAPE_OUT_OF_CANVAS", "critical",
          `形状 #${oi} 越出画布: x=${g.x.toFixed(2)} y=${g.y.toFixed(2)} w=${g.w.toFixed(2)} h=${g.h.toFixed(2)}`,
          "检查该页 cy 累加布局是否缺少边界保护。"));
      }

      const text = textOf(obj);
      if (!text.trim()) return;

      // 2. 文本自溢出 (估算行高需求 vs 文本框高度)
      const size = fontSizeOf(obj);
      const marginPt = Number(obj?.options?.margin) || 0;
      const lines = neededLines(text, g.w, size, marginPt);
      const needH = lines * (size / 72) * 1.28 + (marginPt * 2) / 72 + 0.04;
      const ratio = needH / g.h;
      if (ratio > 1.25) {
        const preview = text.replace(/\s+/g, " ").slice(0, 28);
        issues.push(issue(page, label, "TEXT_OVERFLOW", ratio > 1.6 ? "critical" : "warning",
          `文本框 #${oi} 内容约需 ${needH.toFixed(2)}in, 实际仅 ${g.h.toFixed(2)}in (${lines} 行 @${size}pt): 「${preview}…」`,
          "缩小字号、增大文本框或拆分内容, 避免放映时文字被裁切/压盖。"));
      }

      textBoxes.push({ ...g, oi, text: text.replace(/\s+/g, " ").slice(0, 24) });
    });

    // 3. 文本互相压盖 (只比较带文字的形状, 卡片底板不参与)
    for (let i = 0; i < textBoxes.length; i++) {
      for (let j = i + 1; j < textBoxes.length; j++) {
        const r = overlapRatio(textBoxes[i], textBoxes[j]);
        if (r > 0.30) {
          issues.push(issue(page, label, "TEXT_OVERLAP", r > 0.55 ? "critical" : "warning",
            `文本框 #${textBoxes[i].oi} 与 #${textBoxes[j].oi} 重叠 ${(r * 100).toFixed(0)}%: 「${textBoxes[i].text}」/「${textBoxes[j].text}」`,
            "调整 y 坐标或文本框高度, 禁止两段文字叠在一起。"));
        }
      }
    }
  });

  // 4. 参考答案完整性: 逐页数「参考答案」标记, 防止渲染时静默丢题
  for (const ap of expectations.answerPages || []) {
    const slide = slides[ap.index];
    if (!slide) continue;
    let hits = 0;
    for (const obj of slide._slideObjects || []) {
      const text = textOf(obj);
      if (text.includes("参考答案")) hits++;
    }
    if (hits < ap.expected) {
      issues.push(issue(ap.index + 1, labels[ap.index] || "参考答案页", "ANSWER_ITEM_MISSING", "critical",
        `参考答案页仅渲染 ${hits} 题, 源数据共 ${ap.expected} 题`,
        "答案页必须完整覆盖所有练习题, 超界时应自动拆页而不是丢弃。"));
    }
  }

  const critical = issues.filter(i => i.severity === "critical").length;
  const warning = issues.filter(i => i.severity === "warning").length;
  return {
    canvas: { w: canvasW, h: canvasH },
    slide_count: slides.length,
    issues,
    summary: { critical, warning, total: issues.length }
  };
}

export default auditDeck;
