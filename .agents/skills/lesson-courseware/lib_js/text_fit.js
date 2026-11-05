// -*- coding: utf-8 -*-
/**
 * 文本度量与自适应排版工具 (text_fit.js)
 *
 * 从旧版 layouts.js 提炼的纯函数层, 供表现层渲染器共用:
 * 1. 以 em 为单位的混排字宽估算 (中文全角 1em, 拉丁/数字约 0.55em);
 * 2. 按真实字宽切行, 容量留 0.94 余量, 避免 PowerPoint 二次折行产生孤字;
 * 3. 长句在约 55% 宽度处均衡切成两行 (优先标点/空格后), 消除末行孤字;
 * 4. fitTextLayout: 先按可用高度降字号, 接近一行容量时主动均衡分两行。
 *
 * 这些函数不做任何 I/O, 不依赖 pptxgenjs, 便于单元测试。
 */

const CJK_RE = /[\u1100-\u115F\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFF60]/;

/** 以 em 为单位估算字宽: 中文全角 1em, 拉丁/数字约 0.55em, 标点更窄 */
export function charWidthEm(ch) {
  if (ch === " " || ch === "\t") return 0.30;
  if (CJK_RE.test(ch)) return 1.0;
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[A-Za-z]/.test(ch)) return 0.55;
  if (/[.,;:!?'"`()\[\]{}<>|_\-+=~^$%#@&\\/]/.test(ch)) return 0.42;
  return 0.85;
}

export function textWidthEm(text) {
  let em = 0;
  for (const ch of String(text || "")) em += charWidthEm(ch);
  return em;
}

/** 按真实字宽切行; 容量乘 0.94 留余量, 避免 PowerPoint 二次折行产生孤字 */
export function linesForText(text, widthIn, size) {
  const usableEm = Math.max(4, ((widthIn - 0.14) * 0.88) / (size / 72));
  const lines = [];
  let cur = "";
  let curEm = 0;
  for (const ch of String(text || "")) {
    if (ch === "\n") {
      lines.push(cur);
      cur = "";
      curEm = 0;
      continue;
    }
    const e = charWidthEm(ch);
    if (curEm + e > usableEm && cur) {
      lines.push(cur);
      cur = ch;
      curEm = e;
    } else {
      cur += ch;
      curEm += e;
    }
  }
  lines.push(cur);
  return lines;
}

export function estimateLines(text, widthIn, size = 20) {
  return Math.max(1, linesForText(text, widthIn, size).length);
}

/**
 * 在靠近 55% 宽度处、优先标点/空格后切一刀, 把长句均衡分成两行。
 * 不用「借两个字符」的修补法: 那依赖精确字宽, 换字体就会再次出现孤字。
 */
export function balancedSplit(text) {
  const chars = Array.from(String(text || "").replace(/\n/g, ""));
  const target = textWidthEm(chars.join("")) * 0.55;
  let em = 0;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 1; i < chars.length; i++) {
    em += charWidthEm(chars[i - 1]);
    const bonus = /[\s，,、；;：:）)]/.test(chars[i - 1]) ? -1.2 : 0;
    const score = Math.abs(em - target) + bonus;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best <= 0) return [chars.join("")];
  return [chars.slice(0, best).join(""), chars.slice(best).join("")];
}

/**
 * 自适应文本布局: 先按可用高度降字号; 文本一旦接近一行容量,
 * 主动均衡切成两行, 避免 PowerPoint 按真实字体度量二次折行后末行只剩「元」。
 */
export function fitTextLayout(text, widthIn, boxH, baseSize, minSize = 14) {
  const raw = String(text || "").trim();
  let size = baseSize;
  let lines = linesForText(raw, widthIn, size);
  const fits = (s, ls) => ls.length * (s / 72) * 1.30 <= Math.max(0.3, boxH - 0.06);
  while (size > minSize && !fits(size, lines)) {
    size -= 1;
    lines = linesForText(raw, widthIn, size);
  }

  const usableEm = Math.max(4, ((widthIn - 0.14) * 0.88) / (size / 72));
  const totalEm = textWidthEm(raw.replace(/\n/g, ""));
  if (!raw.includes("\n") && totalEm > usableEm * 0.90) {
    lines = balancedSplit(raw);
  }
  return { text: lines.join("\n"), size, lines: lines.length };
}

/** 仅取自适应字号 (不改动文本内容) 的便捷封装 */
export function fitFontSize(text, widthIn, boxH, baseSize, minSize = 14) {
  return fitTextLayout(text, widthIn, boxH, baseSize, minSize).size;
}

/** 按显示宽度截断 (中英混排下比 .length 公平), 用于答案页题干摘要 */
export function truncateByWidth(text, maxEm) {
  let em = 0;
  let out = "";
  for (const ch of String(text || "")) {
    const e = charWidthEm(ch);
    if (em + e > maxEm) return out.trimEnd() + "…";
    out += ch;
    em += e;
  }
  return out;
}
