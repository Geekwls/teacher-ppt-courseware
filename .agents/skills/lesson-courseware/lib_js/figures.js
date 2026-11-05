// -*- coding: utf-8 -*-
/**
 * 声明式图元渲染 (figures.js) - 基于 PptxGenJS
 *
 * 全部采用原生 PPT 矢量形状/文本框绘制，不依赖外部位图截屏；
 * 保持高清可读、在 PowerPoint/WPS 中可任意修改。
 * 新增支持微课音视频 media 图元。
 */

import fs from "fs";
import zlib from "zlib";
import { FONT_FAMILY, FONT_SIZES, CARD_SHADOW, SEMANTIC } from "./theme.js";

// PptxGenJS 的 addMedia 默认封面是「深灰底 + 白色播放三角」。
// 这里用纯 Node 生成一张纯色 PNG 作为 cover, 让视频区在未播放时是干净的主题浅色,
// 不引入图片依赖、不叠加会遮住播放画面的形状。
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function solidColorPngDataUri(hex) {
  const h = String(hex || "EFF6FF").replace(/^#/, "");
  const rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
  const W = 2;
  const H = 2;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = rgb[0];
      raw[o + 1] = rgb[1];
      raw[o + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // truecolor
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const OP_SYMBOL = {
  "+": "+",
  "-": "−",
  "×": "×",
  "x": "×",
  "*": "×",
  "÷": "÷",
  "/": "÷"
};

export function renderFigure(slide, pptx, fig, box, theme) {
  if (!fig || typeof fig !== "object") return;
  const kind = fig.kind;
  const fn = DISPATCH[kind];
  if (fn) {
    fn(slide, pptx, fig, box, theme);
  }
}

// ---------------------------------------------------------------- 数学图元
function renderVerticalCalc(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const a = String(fig.operand_a);
  const b = String(fig.operand_b);
  const op = OP_SYMBOL[String(fig.operator || "×")] || "×";
  const result = fig.result;
  const showResult = fig.show_result ?? (result !== undefined && result !== null);

  const cols = Math.max(a.length, b.length + 1, result !== undefined ? String(result).length : 0) + 1;
  const cell = Math.min(0.62, Math.max(0.4, w / (cols + 0.5)));
  const size = Math.floor(cell * 46);
  const top = y + 0.15;

  function put(text, row, rightCol) {
    const bx = x + (cols - rightCol - 0.4) * cell;
    slide.addText(text, {
      x: bx,
      y: top + row * (cell * 1.25),
      w: cell * (rightCol + 0.4),
      h: cell * 1.2,
      fontSize: size,
      bold: true,
      color: theme.ink,
      align: "right",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  }

  put(a, 0, a.length);
  put(op + " " + b, 1, b.length + 1);

  const lineY = top + 2 * cell * 1.25 - 0.04;
  slide.addShape(pptx.shapes.LINE, {
    x: x + cell * 0.35,
    y: lineY,
    w: (cols - 0.35) * cell,
    h: 0,
    line: { color: theme.ink, width: 2.2 }
  });

  // 进位小数字标注 (carries: 支持 { 1: 1 } 或 { "1": "1" })
  if (fig.carries && typeof fig.carries === "object") {
    Object.entries(fig.carries).forEach(([colKey, carryVal]) => {
      const colIdx = parseInt(colKey, 10);
      if (!isNaN(colIdx)) {
        const carryX = x + (cols - colIdx - 0.75) * cell;
        const carryY = lineY - 0.28;
        slide.addText(String(carryVal), {
          x: carryX,
          y: carryY,
          w: cell * 0.5,
          h: 0.25,
          fontSize: Math.max(11, Math.floor(size * 0.55)),
          bold: true,
          color: theme.accent || "F59E0B",
          align: "center",
          valign: "middle",
          fontFace: FONT_FAMILY
        });
      }
    });
  }

  if (showResult && result !== undefined && result !== null) {
    put(String(result), 2, String(result).length);
  }
}

export function renderNumberLine(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const start = parseInt(fig.start, 10);
  const end = parseInt(fig.end, 10);
  const step = parseInt(fig.step || 1, 10);
  if (end <= start || step <= 0) return;

  const figId = fig.id || fig.element_id || "nl_math_model";

  const ticks = [];
  for (let v = start; v <= end; v += step) ticks.push(v);
  const n = ticks.length;
  if (n < 2) return;

  const pad = 0.35;
  const lineY = y + h * 0.65;
  const x0 = x + pad;
  const x1 = x + w - pad;

  // 主轴横线
  slide.addShape(pptx.shapes.LINE, {
    objectName: `${figId}.axis`,
    x: x0 - 0.25,
    y: lineY,
    w: (x1 - x0) + 0.5,
    h: 0,
    line: { color: theme.ink, width: 2.2 }
  });

  const gap = (x1 - x0) / (n - 1);
  const marks = new Set(fig.marks || []);
  const figFontSize = theme?.fontSize?.figure || FONT_SIZES.figure;

  ticks.forEach((v, i) => {
    const tx = x0 + i * gap;
    const hit = marks.has(v);

    // 刻度小竖线
    slide.addShape(pptx.shapes.LINE, {
      x: tx,
      y: lineY - 0.09,
      w: 0,
      h: 0.18,
      line: {
        color: hit ? theme.accent : theme.ink,
        width: hit ? 2.6 : 1.4
      }
    });

    // 刻度数值
    slide.addText(String(v), {
      x: tx - gap / 2,
      y: lineY + 0.12,
      w: gap,
      h: 0.3,
      fontSize: figFontSize,
      bold: hit,
      color: hit ? theme.accent : theme.muted,
      align: "center",
      fontFace: FONT_FAMILY
    });

    // 重点标记圆点
    if (hit) {
      slide.addShape(pptx.shapes.OVAL, {
        x: tx - 0.07,
        y: lineY - 0.31,
        w: 0.14,
        h: 0.14,
        fill: { color: theme.accent },
        line: { color: theme.accent, width: 0 }
      });
    }
  });

  // 跳跃弧线 (Jump Arcs) 过程推演演示
  if (Array.isArray(fig.arcs)) {
    fig.arcs.forEach((arc, arcIdx) => {
      const fromVal = parseInt(arc.from, 10);
      const toVal = parseInt(arc.to, 10);
      if (isNaN(fromVal) || isNaN(toVal) || fromVal === toVal) return;

      const fromIdx = (fromVal - start) / step;
      const toIdx = (toVal - start) / step;
      if (fromIdx < 0 || toIdx < 0 || fromIdx > n - 1 || toIdx > n - 1) return;

      const ax1 = x0 + Math.min(fromIdx, toIdx) * gap;
      const ax2 = x0 + Math.max(fromIdx, toIdx) * gap;
      const arcW = ax2 - ax1;
      const arcH = Math.min(0.55, Math.max(0.24, arcW * 0.4));
      const arcY = lineY - arcH;
      const arcId = arc.id || `arc_${arcIdx + 1}`;
      const targetId = `${figId}.${arcId}`;

      // 弧线 (使用 ARC 拱形)
      slide.addShape(pptx.shapes.ARC, {
        objectName: targetId,
        x: ax1,
        y: arcY,
        w: arcW,
        h: arcH * 2,
        line: { color: theme.accent || "F59E0B", width: 2.2 }
      });

      // 步长说明 (如 "+2", "第1次")
      const labelText = arc.label || (toVal > fromVal ? `+${toVal - fromVal}` : `${toVal - fromVal}`);
      slide.addText(labelText, {
        objectName: `${targetId}_label`,
        x: ax1,
        y: arcY - 0.28,
        w: arcW,
        h: 0.26,
        fontSize: Math.max(12, figFontSize - 2),
        bold: true,
        color: theme.accent || "F59E0B",
        align: "center",
        valign: "middle",
        fontFace: FONT_FAMILY
      });
    });
  }

  if (fig.label) {
    slide.addText(fig.label, {
      x: x,
      y: y,
      w: w,
      h: 0.34,
      fontSize: figFontSize,
      bold: true,
      color: theme.primaryDark,
      align: "center",
      fontFace: FONT_FAMILY
    });
  }
}

function renderPlaceValue(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const digits = fig.digits || {};
  const order = [
    ["thousands", "千"],
    ["hundreds", "百"],
    ["tens", "十"],
    ["ones", "个"]
  ];
  const used = order.filter(([k]) => k in digits).length > 0
    ? order.filter(([k]) => k in digits)
    : order;

  const cols = used.length;
  const cellW = Math.min(0.9, w / cols);
  const tableW = cellW * cols;
  const tx = x + (w - tableW) / 2;
  const label = fig.label;
  const headY = y + (label ? 0.3 : 0);
  const figFontSize = theme?.fontSize?.figure || FONT_SIZES.figure;

  if (label) {
    slide.addText(label, {
      x: x,
      y: y,
      w: w,
      h: 0.3,
      fontSize: figFontSize,
      bold: true,
      color: theme.primaryDark,
      align: "center",
      fontFace: FONT_FAMILY
    });
  }

  used.forEach(([k, labelCn], i) => {
    const cx = tx + i * cellW;
    // 表头
    slide.addText(labelCn, {
      x: cx,
      y: headY,
      w: cellW,
      h: 0.42,
      fontSize: figFontSize,
      bold: true,
      color: theme.primaryDark,
      fill: { color: theme.chip },
      line: { color: theme.primary, width: 1 },
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });

    // 数值单元格
    const val = String(digits[k] !== undefined ? digits[k] : "");
    slide.addText(val, {
      x: cx,
      y: headY + 0.42,
      w: cellW,
      h: 0.52,
      fontSize: figFontSize + 4,
      bold: true,
      color: theme.ink,
      fill: { color: "FFFFFF" },
      line: { color: theme.primary, width: 1 },
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  });
}

// ---------------------------------------------------------------- 语文图元
function renderTianzige(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const chars = (fig.chars || []).slice(0, 6).map(String);
  const pinyin = fig.pinyin || [];
  const n = Math.max(1, chars.length);
  const gap = 0.22;
  const cell = Math.min(1.25, (w - gap * (n - 1)) / n, h - 0.42);
  const total = cell * n + gap * (n - 1);
  const x0 = x + (w - total) / 2;
  const y0 = y + 0.42;

  chars.forEach((ch, i) => {
    const cx = x0 + i * (cell + gap);

    // 拼音
    if (i < pinyin.length && pinyin[i]) {
      slide.addText(String(pinyin[i]), {
        x: cx - 0.1,
        y: y0 - 0.4,
        w: cell + 0.2,
        h: 0.36,
        fontSize: 14,
        color: theme.muted,
        align: "center",
        fontFace: FONT_FAMILY
      });
    }

    // 田字格红底白芯外框
    slide.addShape(pptx.shapes.RECTANGLE, {
      x: cx,
      y: y0,
      w: cell,
      h: cell,
      fill: { color: "FFFFFF" },
      line: { color: theme.bad, width: 1.6 },
      shadow: CARD_SHADOW
    });

    const mid = cell / 2;
    // 横中线 (虚线)
    slide.addShape(pptx.shapes.LINE, {
      x: cx,
      y: y0 + mid,
      w: cell,
      h: 0,
      line: { color: "FCA5A5", width: 1.0, dashType: "dash" }
    });
    // 竖中线 (虚线)
    slide.addShape(pptx.shapes.LINE, {
      x: cx + mid,
      y: y0,
      w: 0,
      h: cell,
      line: { color: "FCA5A5", width: 1.0, dashType: "dash" }
    });

    // 汉字文字
    slide.addText(ch, {
      x: cx,
      y: y0,
      w: cell,
      h: cell,
      fontSize: Math.floor(cell * 40),
      color: theme.ink,
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  });
}

function renderPinyinLine(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const pairs = (fig.pairs || []).slice(0, 12);
  const n = Math.max(1, pairs.length);
  const gap = 0.08;
  const cell = Math.min(1.1, (w - gap * (n - 1)) / n);
  const total = cell * n + gap * (n - 1);
  const x0 = x + (w - total) / 2;
  const y0 = y + Math.max(0, (h - 0.86) / 2);

  pairs.forEach((pr, i) => {
    const cx = x0 + i * (cell + gap);
    // 拼音
    slide.addText(String(pr.pinyin || ""), {
      x: cx - 0.12,
      y: y0,
      w: cell + 0.24,
      h: 0.4,
      fontSize: 16,
      color: theme.muted,
      align: "center",
      fontFace: FONT_FAMILY
    });
    // 汉字
    slide.addText(String(pr.char || ""), {
      x: cx - 0.12,
      y: y0 + 0.4,
      w: cell + 0.24,
      h: 0.52,
      fontSize: 26,
      bold: true,
      color: theme.ink,
      align: "center",
      fontFace: FONT_FAMILY
    });
  });
}

// ---------------------------------------------------------------- 英语图元
function renderWordCard(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const cards = (fig.cards || []).slice(0, 8);
  const n = Math.max(1, cards.length);
  const cols = n > 4 ? 2 : (n <= 3 ? n : 4);
  const rows = Math.ceil(n / cols);
  const gap = 0.18;
  const cardW = Math.min(2.6, (w - gap * (cols - 1)) / cols);
  const cardH = Math.min(1.35, (h - gap * (rows - 1)) / rows);
  const totalW = cardW * cols + gap * (cols - 1);
  const x0 = x + (w - totalW) / 2;
  const totalH = cardH * rows + gap * (rows - 1);
  const y0 = y + Math.max(0, (h - totalH) / 2);

  cards.forEach((card, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cx = x0 + c * (cardW + gap);
    const cy = y0 + r * (cardH + gap);

    const textRuns = [
      { text: String(card.word || ""), options: { fontSize: 24, bold: true, color: theme.primaryDark, breakLine: true } }
    ];
    if (card.phonetic) {
      textRuns.push({ text: String(card.phonetic), options: { fontSize: 14, color: theme.muted, breakLine: true } });
    }
    if (card.meaning) {
      textRuns.push({ text: String(card.meaning), options: { fontSize: 15, color: theme.ink } });
    }

    slide.addText(textRuns, {
      x: cx,
      y: cy,
      w: cardW,
      h: cardH,
      fill: { color: "FFFFFF" },
      line: { color: theme.primary, width: 1.4 },
      shadow: CARD_SHADOW,
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY
    });
  });
}

function renderDialogBubble(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const lines = (fig.lines || []).slice(0, 8);
  const bubbleH = Math.min(0.78, (h - 0.12 * Math.max(0, lines.length - 1)) / Math.max(1, lines.length));
  const bubbleW = w * 0.72;
  const speakers = {};

  lines.forEach((ln, i) => {
    const spName = String(ln.speaker || "?");
    if (!(spName in speakers)) {
      speakers[spName] = Object.keys(speakers).length;
    }
    const left = speakers[spName] % 2 === 0;
    const by = y + i * (bubbleH + 0.12);
    const bx = x + (left ? 0.15 : w - bubbleW - 0.15);

    slide.addText([
      { text: `${spName}: `, options: { fontSize: 18, bold: true, color: theme.primaryDark } },
      { text: String(ln.text || ""), options: { fontSize: 18, color: theme.ink } }
    ], {
      x: bx,
      y: by,
      w: bubbleW,
      h: bubbleH,
      fill: { color: left ? theme.chip : "FFFFFF" },
      line: { color: theme.primary, width: 1.2 },
      shadow: CARD_SHADOW,
      valign: "middle",
      margin: 10,
      fontFace: FONT_FAMILY
    });
  });
}

// ---------------------------------------------------------------- 通用表格图元
function renderTable(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const headers = (fig.headers || []).map(String);
  const rows = (fig.rows || []).slice(0, 8).map(row => (row || []).map(String));
  if (!headers.length || !rows.length) return;

  const label = fig.label;
  const ty = y + (label ? 0.32 : 0);
  const figFontSize = theme?.fontSize?.figure || FONT_SIZES.figure;

  if (label) {
    slide.addText(String(label), {
      x: x,
      y: y,
      w: w,
      h: 0.3,
      fontSize: figFontSize,
      bold: true,
      color: theme.primaryDark,
      align: "center",
      fontFace: FONT_FAMILY
    });
  }

  const tableData = [];
  // 表头行
  tableData.push(headers.map(hText => ({
    text: hText,
    options: {
      bold: true,
      color: "FFFFFF",
      fill: { color: theme.primary },
      align: "center",
      valign: "middle",
      fontFace: FONT_FAMILY,
      fontSize: figFontSize
    }
  })));

  // 数据行
  rows.forEach((row, i) => {
    tableData.push(row.map(cellText => ({
      text: cellText,
      options: {
        color: theme.ink,
        fill: { color: i % 2 === 0 ? "FFFFFF" : theme.chip },
        align: "center",
        valign: "middle",
        fontFace: FONT_FAMILY,
        fontSize: figFontSize
      }
    })));
  });

  slide.addTable(tableData, {
    x: x,
    y: ty,
    w: w,
    h: Math.min(h - (ty - y), 0.5 * tableData.length),
    border: { pt: 1, color: theme.primary }
  });
}

// ---------------------------------------------------------------- 情境插图图元 (本地图片文件)
function renderImage(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const filePath = fig.path ? String(fig.path) : "";
  const hasFile = filePath && fs.existsSync(filePath);

  // 降级: 图片缺失时渲染说明占位卡, 如实告知原因, 不留空白也不伪装
  if (!hasFile) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: x, y: y, w: w, h: h,
      fill: { color: SEMANTIC.white },
      line: { color: SEMANTIC.badBorder, width: 1.2, dashType: "dash" },
      shape: pptx.shapes.ROUNDED_RECTANGLE
    });
    slide.addText(fig.alt ? `插图缺失: ${fig.alt}` : "插图缺失 (图片文件未找到)", {
      x: x + 0.2, y: y, w: w - 0.4, h: h,
      fontSize: Math.min(14, Math.max(10, Math.floor(h * 22))),
      color: SEMANTIC.mediaMuted,
      align: "center", valign: "middle", fontFace: FONT_FAMILY,
      margin: 4
    });
    console.warn(`[renderImage] 插图文件不存在, 已降级为占位卡: ${filePath || "(未填 path)"}`);
    return;
  }

  // 正常渲染: 等比裁剪填满版面 (cover), 保留 alt 无障碍描述
  slide.addImage({
    path: filePath,
    x: x, y: y, w: w, h: h,
    sizing: { type: "cover", w: w, h: h },
    altText: fig.alt || "",
    rounding: false,
    shadow: CARD_SHADOW
  });

  // 可选图注: 底部半透明白底说明条
  if (fig.caption) {
    slide.addText(String(fig.caption), {
      x: x, y: y + h - 0.42, w: w, h: 0.42,
      fill: { color: SEMANTIC.white, transparency: 22 },
      fontSize: 12, color: "334155",
      align: "center", valign: "middle", fontFace: FONT_FAMILY,
      margin: 2
    });
  }
}



/**
 * 诚实的降级卡片: animation / media 图元在没有真实视频也没有外链时,
 * 不再画一个点不动的播放三角占掉半页版面, 而是把演示要点直接写成静态卡片。
 */
function renderMediaInfoCard(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const title = fig.title || "动态演示要点";
  const prompt = fig.prompt || "";
  const conclusion = fig.conclusion || "";
  const steps = (fig.parameters && fig.parameters.steps) || fig.steps || [];

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: theme.chip },
    line: { color: theme.primary, width: 1.2 },
    shadow: CARD_SHADOW
  });

  slide.addText(title, {
    x: x + 0.3, y: y + 0.25, w: w - 0.6, h: 0.55,
    fontSize: 17, bold: true, color: theme.primaryDark,
    align: "center", valign: "middle", fontFace: FONT_FAMILY
  });

  const bullets = [];
  if (prompt) bullets.push(`观察要点：${prompt}`);
  if (Array.isArray(steps)) {
    steps.slice(0, 4).forEach((s, i) => bullets.push(`${i + 1}. ${typeof s === "string" ? s : JSON.stringify(s)}`));
  }
  if (conclusion) bullets.push(`结论：${conclusion}`);
  if (!bullets.length) bullets.push("动态素材尚未生成，请教师按本页步骤板书推演。");

  slide.addText(bullets.join("\n"), {
    x: x + 0.35, y: y + 0.95, w: w - 0.7, h: Math.max(0.8, h - 1.5),
    fill: { color: SEMANTIC.white },
    line: { color: theme.border, width: 1 },
    shape: pptx.shapes.ROUNDED_RECTANGLE,
    fontSize: 14, color: theme.ink, valign: "top", margin: 10,
    fontFace: FONT_FAMILY
  });

  slide.addText("静态演示要点卡 · 动态视频未接入", {
    x: x + 0.35, y: y + h - 0.42, w: w - 0.7, h: 0.3,
    fontSize: 11, color: theme.muted, align: "center", fontFace: FONT_FAMILY
  });
}

/**
 * 视频封面的信息层: 只在上下边缘加窄条, 中心留给播放按钮与播放画面。
 * 不在中心叠形状, 否则点击会命中形状而不是视频, 导致放不出来。
 */
function addMediaOverlay(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const title = fig.title || "课堂微课";
  const duration = fig.duration || "微课视频";
  const prompt = fig.prompt || "";

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: x + 0.16, y: y + 0.16, w: w - 0.32, h: 0.5,
    fill: { color: theme.panel },
    line: { color: theme.border, width: 1 }
  });
  slide.addText(`${title}  ·  ${duration}`, {
    x: x + 0.3, y: y + 0.16, w: w - 0.6, h: 0.5,
    fontSize: 14, bold: true, color: theme.primaryDark,
    align: "center", valign: "middle", fontFace: FONT_FAMILY
  });

  if (h > 2.2 && prompt) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.16, y: y + h - 0.62, w: w - 0.32, h: 0.46,
      fill: { color: theme.panel },
      line: { color: theme.border, width: 1 }
    });
    slide.addText(`观察任务：${prompt}`, {
      x: x + 0.3, y: y + h - 0.62, w: w - 0.6, h: 0.46,
      fontSize: 12, color: theme.ink,
      align: "center", valign: "middle", fontFace: FONT_FAMILY
    });
  }
}

// ---------------------------------------------------------------- 微课音视频与操作视频媒体图元
function renderMedia(slide, pptx, fig, box, theme) {
  const [x, y, w, h] = box;
  const filePath = fig.path ? String(fig.path) : "";
  const hasLocalFile = filePath && fs.existsSync(filePath);
  const linkUrl = fig.link || fig.url || (filePath.startsWith("http") ? filePath : null);

  // 1. 本地媒体原生嵌入: cover 换成主题浅色, 去掉默认深灰播放海报
  if (hasLocalFile) {
    try {
      slide.addMedia({
        type: fig.type || "video",
        path: filePath,
        x, y, w, h,
        cover: fig.cover || solidColorPngDataUri(theme.chip || "EFF6FF")
      });
      addMediaOverlay(slide, pptx, fig, box, theme);
      return;
    } catch (err) {
      console.warn(`[renderMedia] 原生媒体嵌入失败，降级为交互卡片渲染: ${err.message}`);
    }
  }

  // 2. 既无本地媒体又无外链: 不伪装成可播放视频
  if (!linkUrl) {
    renderMediaInfoCard(slide, pptx, fig, box, theme);
    return;
  }

  // 3. 有外链: 渲染可点击的微课播放卡片
  const isAudio = fig.type === "audio";
  const title = fig.title || (isAudio ? "课文示范朗读音频" : "课堂趣味微课 · 操作演示");
  const duration = fig.duration || (isAudio ? "示范音频" : "趣味微课");
  const prompt = fig.prompt || "请同学们认真观察视频中的操作过程与关键细节";

  // 播放器视窗底板
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: SEMANTIC.mediaBg },
    line: { color: SEMANTIC.mediaEdge, width: 1.5 },
    shadow: CARD_SHADOW,
    ...(linkUrl ? { hyperlink: { url: linkUrl } } : {})
  });

  slide.addText(`▶ ${isAudio ? "音频示范" : "趣味微课 / 操作视频"}  |  ${duration}`, {
    x: x + 0.25,
    y: y + 0.2,
    w: w - 0.5,
    h: 0.35,
    fontSize: 12,
    color: SEMANTIC.mediaMuted,
    fontFace: FONT_FAMILY,
    valign: "middle"
  });

  const btnSize = Math.min(1.0, Math.min(w, h) * 0.26);
  const btnX = x + (w - btnSize) / 2;
  const btnY = y + (h - btnSize) / 2 - 0.25;

  slide.addShape(pptx.shapes.OVAL, {
    x: btnX, y: btnY, w: btnSize, h: btnSize,
    fill: { color: SEMANTIC.white },
    line: { color: theme.primary || "3B82F6", width: 2 },
    ...(linkUrl ? { hyperlink: { url: linkUrl } } : {})
  });

  slide.addText("▶", {
    x: btnX + 0.05, y: btnY, w: btnSize, h: btnSize,
    fontSize: Math.floor(btnSize * 30),
    color: theme.primary || "2563EB",
    align: "center", valign: "middle", fontFace: FONT_FAMILY,
    ...(linkUrl ? { hyperlink: { url: linkUrl } } : {})
  });

  slide.addText(title, {
    x: x + 0.3, y: btnY + btnSize + 0.15, w: w - 0.6, h: 0.45,
    fontSize: Math.min(18, Math.max(14, Math.floor(w * 3.5))),
    bold: true, color: SEMANTIC.mediaSurface,
    align: "center", valign: "middle", fontFace: FONT_FAMILY,
    ...(linkUrl ? { hyperlink: { url: linkUrl } } : {})
  });

  if (h > 3.0) {
    slide.addText(`观察任务：${prompt}`, {
      x: x + 0.3, y: y + h - 0.65, w: w - 0.6, h: 0.45,
      fill: { color: SEMANTIC.mediaPanel },
      shape: pptx.shapes.ROUNDED_RECTANGLE,
      fontSize: 12, color: SEMANTIC.mediaHint,
      align: "center", valign: "middle", fontFace: FONT_FAMILY
    });
  }
}

const DISPATCH = {
  vertical_calc: renderVerticalCalc,
  number_line: renderNumberLine,
  place_value: renderPlaceValue,
  tianzige: renderTianzige,
  pinyin_line: renderPinyinLine,
  word_card: renderWordCard,
  dialog_bubble: renderDialogBubble,
  table: renderTable,
  media: renderMedia,
  animation: renderMedia,
  image: renderImage
};
