// -*- coding: utf-8 -*-
/**
 * 现代多维风格与视觉体系 (theme.js) - 基于 PptxGenJS
 *
 * 核心特性:
 * - 16:9 现代宽屏标准: 13.333 x 7.5 英寸 (LAYOUT_WIDE)
 * - 学科 (语数英) x 学段 (低/中/高段) 动态主题矩阵
 * - 防近视大字号、学段阶梯密度与现代卡片设计 (Card UI)
 */

import { execFileSync } from "child_process";

export const CANVAS_W = 13.333;
export const CANVAS_H = 7.5;

/**
 * 字体解析: 固定写死 "Microsoft YaHei" 时, Linux / macOS / 未装雅黑的机器会
 * 由 PowerPoint 或 LibreOffice 静默二次回退, 固定坐标排版随之错位、出现孤字折行。
 * 这里在渲染时探测系统真正可用的中文字体名并写入 pptx。
 *
 * 需要严格「同输入恒同输出」时, 用 COURSEWARE_FONT=Microsoft YaHei 固定字体名。
 */
function resolveFontFamily() {
  const override = (process.env.COURSEWARE_FONT || "").trim();
  if (override) return override;
  const preferred = "Microsoft YaHei";
  try {
    const out = execFileSync("fc-match", ["-f", "%{family}", preferred], {
      encoding: "utf-8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const first = out.split(",")[0].replace(/^["']|["']$/g, "").trim();
    if (!first || /yahei/i.test(first)) return preferred;
    return first;
  } catch {
    // Windows / macOS 通常没有 fc-match, 保持原字体名
    return preferred;
  }
}

export const FONT_FAMILY = resolveFontFamily();

/** 语义色 token: 卡片/答案/板书/媒体播放器的固定色值集中在此, 便于换肤与对比度审查 */
export const SEMANTIC = {
  white: "FFFFFF",
  goodBg: "ECFDF5",
  goodInk: "065F46",
  goodBorder: "A7F3D0",
  badBg: "FEF2F2",
  badBorder: "FCA5A5",
  boardBg: "064E3B",
  boardEdge: "92400E",
  boardChalk: "FDE68A",
  boardBody: "F0FDF4",
  mediaBg: "0F172A",
  mediaEdge: "334155",
  mediaMuted: "94A3B8",
  mediaSurface: "F8FAFC",
  mediaPanel: "1E293B",
  mediaHint: "CBD5E1"
};

export const SUBJECT_LABEL = {
  math: "数学",
  chinese: "语文",
  english: "英语"
};

export const TERM_LABEL = {
  "term-1": "上册",
  "term-2": "下册"
};

// 极简现代微质感柔和投影 (克制细腻，不泛脏)
//
// ⚠️ 只读模板。PptxGenJS 的 addShape 会**原地**把 shadow.blur/offset 由 pt 乘 12700 改成 EMU,
// 因此同一份对象被复用第 N 次时会连乘 12700^N, 数值迅速溢出成非法值 (alpha > 100000),
// 渲染器遇到非法值会直接放弃绘制整个形状 —— 表现为"卡片/田字格凭空消失"。
// 所有调用点必须写成 shadow: { ...CARD_SHADOW }, 每次传新副本。
export const CARD_SHADOW = {
  type: "outer",
  color: "64748B",
  blur: 6,
  offset: 2,
  angle: 90,
  opacity: 0.12
};

/**
 * 1. 学段划分逻辑:
 * - 1~2 年级: 低段 (启蒙具象、超大字号、活泼糖果色、低文字密度)
 * - 3~4 年级: 中段 (承上启下、均衡实用、标准防近视大字、现代卡片流)
 * - 5~6 年级: 高段 (抽象逻辑、紧凑学术、深邃稳重、严谨思辨)
 */
export function getGradeLevel(grade) {
  const g = parseInt(grade, 10);
  if (isNaN(g) || g <= 2) return "lower";
  if (g <= 4) return "middle";
  if (g <= 6) return "upper";
  return "junior"; // 7, 8, 9 年级 (初中学段)
}

/**
 * 2. 学段字号与版面节奏阶梯
 */
export const GRADE_TOKENS = {
  lower: {
    level: "lower",
    levelName: "低年级·启蒙具象",
    fontSize: {
      cover_title: 46,
      cover_subtitle: 24,
      title: 30,
      body: 24,
      body_large: 26,
      callout: 24,
      figure: 20,
      meta: 15,
      footer: 13
    },
    lineHeightMultiplier: 1.35,
    maxItemsPerSlide: 3
  },
  middle: {
    level: "middle",
    levelName: "中年级·图文进阶",
    fontSize: {
      cover_title: 44,
      cover_subtitle: 22,
      title: 28,
      body: 20,
      body_large: 22,
      callout: 22,
      figure: 18,
      meta: 14,
      footer: 13
    },
    lineHeightMultiplier: 1.25,
    maxItemsPerSlide: 4
  },
  upper: {
    level: "upper",
    levelName: "高年级·理性思辨",
    fontSize: {
      cover_title: 42,
      cover_subtitle: 20,
      title: 26,
      body: 18,
      body_large: 20,
      callout: 20,
      figure: 16,
      meta: 13,
      footer: 12
    },
    lineHeightMultiplier: 1.18,
    maxItemsPerSlide: 5
  },
  junior: {
    level: "junior",
    levelName: "初中年级·深度鉴赏与思辨",
    fontSize: {
      cover_title: 44,
      cover_subtitle: 22,
      title: 28,
      body: 20,
      body_large: 22,
      callout: 20,
      figure: 16,
      meta: 13,
      footer: 12
    },
    lineHeightMultiplier: 1.25,
    maxItemsPerSlide: 4
  }
};

/**
 * 3. 基础色彩库 (为兼容旧代码直接访问 THEMES[subject])
 */
export const THEMES = {
  math: {
    primary: "2563EB",
    primaryDark: "1E3A8A",
    accent: "F59E0B",
    bgTint: "F8FAFC",
    chip: "EFF6FF",
    border: "E2E8F0",
    good: "10B981",
    bad: "EF4444",
    ink: "0F172A",
    muted: "64748B",
    panel: "FFFFFF"
  },
  chinese: {
    primary: "991B1B",     // 典雅绛红
    primaryDark: "7F1D1D", // 浓墨重红
    accent: "1E3A5F",      // 沉静黛蓝
    bgTint: "FBF9F5",      // 温润宣纸底色
    chip: "F5EFE6",        // 柔和微黄卡片底
    border: "E7E2DA",      // 雅致纸质边框
    good: "065F46",        // 竹青
    bad: "DC2626",
    ink: "1C1917",         // 徽墨黑
    muted: "78716C",       // 雅灰
    panel: "FFFFFF"
  },
  english: {
    primary: "059669",
    primaryDark: "064E3B",
    accent: "F59E0B",
    bgTint: "F0FDF4",
    chip: "ECFDF5",
    border: "E2E8F0",
    good: "10B981",
    bad: "EF4444",
    ink: "0F172A",
    muted: "64748B",
    panel: "FFFFFF"
  }
};

// 兼容旧版常量
export const FONT_SIZES = GRADE_TOKENS.middle.fontSize;

/**
 * 5. 风格包 (Style Pack) 注册表
 *
 * 设计原则: **只换装饰与字号节奏, 不动固定卡槽坐标**。
 * 页面几何由 layout_audit 事后体检兜底, 风格包若改动外框尺寸, 每种风格都需要
 * 单独维护一套坐标, 变体一多必然重演"校验全绿、产物压盖"的老问题。
 * 因此风格包只控制:
 *   - colors: 底色/卡片底/描边/强调色的收敛程度 (学科主色默认保留, 保证三科可辨)
 *   - type:   标题与正文的缩放节奏 (0.95~1.05, 幅度克制, 由 text_fit 自适应兜底)
 *   - card:   卡片圆角、投影、描边粗细
 *   - frame:  页眉装饰、标题标记、页脚分割线形态
 *   - cover:  封面构图 (居中/色带/左分栏/极简/纸感), 均为纯装饰, 文字盒尺寸不变
 *
 * 明暗约束: 渲染器里存在语义色硬编码 (答案绿 ECFDF5 / 错例红 FEF2F2 / 提示黄 FEF3C7),
 * 这些底色都按"浅底深字"设计。深色黑板风格会让 t.ink 深字落在浅色卡上失去对比,
 * 所以 chalk 采用"米黄纸 + 墨绿"的板书手账质感, 而不是真黑底。
 */
export const STYLE_PACKS = {
  clean: {
    id: "clean",
    label: "清爽白",
    summary: "当前默认: 白底细描边、圆角轻投影, 三科主色分明",
    colors: { bgTint: "F8FAFC", panel: "FFFFFF", border: "E2E8F0" },
    type: { title: 1.0, body: 1.0, cover: 1.0 },
    card: {
      radius: 0.06,
      borderWidth: 1.2,
      shadow: { type: "outer", color: "CBD5E1", blur: 4, offset: 2, angle: 90, opacity: 0.25 }
    },
    frame: { header: "bar", titleMark: "bar", footerRule: "solid" },
    cover: { layout: "center_rule" }
  },
  warm: {
    id: "warm",
    label: "暖阳",
    summary: "米杏底、大圆角、暖橙强调, 适合低中段与公开课",
    colors: {
      bgTint: "FFFBF2",
      panel: "FFFFFF",
      chip: "FEF3E2",
      border: "F1DFC4",
      accent: "F97316",
      muted: "6F5A40"
    },
    // 正文不放大: 实测 warm 的 1.02 倍会让二年级情境卡 5 行文本溢出卡槽
    // (TEXT_OVERFLOW warning), 风格差异由配色/圆角/色带承担即可
    type: { title: 1.04, body: 1.0, cover: 1.02 },
    card: {
      radius: 0.16,
      borderWidth: 1.0,
      shadow: { type: "outer", color: "E7C9A0", blur: 9, offset: 3, angle: 90, opacity: 0.28 }
    },
    frame: { header: "band", titleMark: "dot", footerRule: "solid" },
    cover: { layout: "center_band" }
  },
  academic: {
    id: "academic",
    label: "学术",
    summary: "纯白净底、直角细线、标题下压重线, 适合高段与复习课",
    colors: {
      bgTint: "FFFFFF",
      panel: "FFFFFF",
      chip: "F1F5F9",
      border: "CBD5E1",
      muted: "475569"
    },
    type: { title: 0.96, body: 0.97, cover: 0.98 },
    card: {
      radius: 0.02,
      borderWidth: 1.4,
      shadow: { type: "outer", color: "94A3B8", blur: 3, offset: 1, angle: 90, opacity: 0.16 }
    },
    frame: { header: "rule", titleMark: "underline", footerRule: "solid" },
    cover: { layout: "left_split" }
  },
  minimal: {
    id: "minimal",
    label: "极简",
    summary: "黑白灰、无圆角无投影, 一页一观点, 家长会与汇报首选",
    colors: {
      primary: "111827",
      primaryDark: "030712",
      accent: "6B7280",
      bgTint: "FFFFFF",
      panel: "FFFFFF",
      chip: "F9FAFB",
      border: "E5E7EB",
      ink: "111827",
      muted: "6B7280",
      good: "047857",
      bad: "B91C1C"
    },
    type: { title: 0.98, body: 1.0, cover: 1.0 },
    card: {
      radius: 0.0,
      borderWidth: 0.75,
      // 极简要求"无投影": 用 null 让 PptxGenJS 完全不写 effectLst。
      // 曾尝试 opacity:0 + blur:0, 结果 pptxgenjs 把 0 参与除法, 写出
      // blurRad=1.29e9 的畸形阴影, LibreOffice 渲染成描边发黑的假边框。
      shadow: null
    },
    frame: { header: "hairline", titleMark: "none", footerRule: "none" },
    cover: { layout: "minimal" }
  },
  chalk: {
    id: "chalk",
    label: "板书手账",
    summary: "米黄纸底、墨绿分栏、虚线页脚, 课堂板书与听课笔记质感",
    colors: {
      primary: "1F4D3D",
      primaryDark: "122B22",
      accent: "B45309",
      bgTint: "FBF7EC",
      panel: "FFFDF6",
      chip: "F3EDDD",
      border: "D8CDB4",
      ink: "1B2B22",
      muted: "6B6252",
      good: "065F46",
      bad: "B91C1C"
    },
    type: { title: 1.0, body: 1.0, cover: 1.0 },
    card: {
      radius: 0.04,
      borderWidth: 1.2,
      shadow: { type: "outer", color: "C9BC9C", blur: 3, offset: 2, angle: 90, opacity: 0.2 }
    },
    frame: { header: "paper", titleMark: "underline", footerRule: "dash" },
    cover: { layout: "paper" }
  }
};

/** 旧调用方仍可能传 standard / innovative, 做别名归一, 未知值一律回落到 clean */
const STYLE_ALIASES = {
  standard: "clean",
  default: "clean",
  fresh: "clean",
  innovative: "warm",
  warm_sun: "warm",
  serious: "academic",
  mono: "minimal",
  black_white: "minimal",
  blackboard: "chalk",
  handbook: "chalk"
};

export const STYLE_PACK_IDS = Object.keys(STYLE_PACKS);

export function resolveStylePack(style) {
  const key = String(style || "").trim().toLowerCase();
  if (STYLE_PACKS[key]) return STYLE_PACKS[key];
  const alias = STYLE_ALIASES[key];
  if (alias && STYLE_PACKS[alias]) return STYLE_PACKS[alias];
  return STYLE_PACKS.clean;
}

/**
 * 4. 学科 x 学段 动态主题解析器 (Core Dynamic Resolver)
 */
export function resolveTheme(subject = "math", grade = 3, style = "standard") {
  const level = getGradeLevel(grade);
  const gradeTokens = GRADE_TOKENS[level];
  const sub = String(subject || "math").toLowerCase();

  let colors = { ...(THEMES[sub] || THEMES.math) };

  // 针对不同学段注入特定的色相偏好与情绪氛围
  if (level === "lower") {
    // 1-2年级: 提高明度与亲和力、轻快的微甜马卡龙/糖果色调
    if (sub === "math") {
      colors.primary = "3B82F6";     // 明朗天蓝
      colors.primaryDark = "1D4ED8";
      colors.accent = "FBBF24";      // 阳光暖黄
      colors.bgTint = "F0F9FF";
      colors.chip = "E0F2FE";
    } else if (sub === "chinese") {
      colors.primary = "E11D48";     // 亲和珊瑚朱红
      colors.primaryDark = "9F1239";
      colors.accent = "F59E0B";      // 暖杏黄
      colors.bgTint = "FFF7ED";      // 暖奶杏底
      colors.chip = "FFEDD5";
    } else if (sub === "english") {
      colors.primary = "10B981";     // 活力亮翠绿
      colors.primaryDark = "047857";
      colors.accent = "F59E0B";
      colors.bgTint = "ECFDF5";
      colors.chip = "D1FAE5";
    }
  } else if (level === "upper" || level === "junior") {
    // 5-6年级与初中7-9年级: 沉稳深邃、经典学术范、高对比度与严谨感
    if (sub === "math") {
      colors.primary = "1E3A8A";     // 深邃牛津蓝
      colors.primaryDark = "0F172A"; // 夜幕深蓝
      colors.accent = "D97706";      // 冷金
      colors.bgTint = "F8FAFC";
      colors.chip = "F1F5F9";
    } else if (sub === "chinese") {
      colors.primary = "991B1B";     // 典雅绛红
      colors.primaryDark = "4C0519"; // 浓墨重彩
      colors.accent = "1E3A5F";      // 沉静黛蓝
      colors.bgTint = "FBF9F5";      // 温润宣纸底色
      colors.chip = "F5EFE6";        // 宣纸竹卷微黄淡标
      colors.border = "E7E2DA";      // 雅致纸质边框
      colors.good = "065F46";        // 竹青
      colors.ink = "1C1917";         // 徽墨黑
      colors.muted = "57534E";       // 雅灰
    } else if (sub === "english") {
      colors.primary = "064E3B";     // 深邃常青墨绿
      colors.primaryDark = "022C22";
      colors.accent = "D97706";
      colors.bgTint = "F8FAFC";
      colors.chip = "F1F5F9";
    }
  }

  // 风格包: 在学科 x 学段色之后叠加装饰层 (学科主色默认保留, 三科仍可一眼分辨)
  const pack = resolveStylePack(style);
  colors = { ...colors, ...(pack.colors || {}) };

  const scaledFontSize = scaleFontSize(gradeTokens.fontSize, pack);

  return {
    ...colors,
    style: pack.id,
    stylePack: pack,
    styleLabel: pack.label,
    card: pack.card,
    frame: pack.frame,
    cover: pack.cover,
    gradeLevel: level,
    gradeLevelName: gradeTokens.levelName,
    fontSize: scaledFontSize,
    lineHeightMultiplier: gradeTokens.lineHeightMultiplier,
    maxItemsPerSlide: gradeTokens.maxItemsPerSlide
  };
}

/**
 * 按风格包缩放字号阶梯。
 * 只做 0.95~1.05 的温和缩放: 风格差异靠配色/圆角/装饰承担,
 * 字号用于微调节奏, 过大会直接撑破固定高度卡槽 (由 layout_audit 判 critical)。
 */
function scaleFontSize(fontSize, pack) {
  const titleScale = pack?.type?.title ?? 1;
  const bodyScale = pack?.type?.body ?? 1;
  const coverScale = pack?.type?.cover ?? 1;
  const titleKeys = new Set(["title", "cover_title"]);
  const out = {};
  for (const [key, value] of Object.entries(fontSize)) {
    const scale = key === "cover_title" || key === "cover_subtitle"
      ? coverScale
      : titleKeys.has(key)
        ? titleScale
        : bodyScale;
    out[key] = Math.max(11, Math.round(Number(value) * scale));
  }
  return out;
}

export function footerOf(meta) {
  const parts = [
    `人教版·${meta?.grade || ""}年级${TERM_LABEL[meta?.term] || ""}`,
    meta?.unit_name || ""
  ];
  if (meta?.class_period_label) {
    parts.push(meta.class_period_label);
  }
  return parts.filter(Boolean).join("  |  ");
}

/**
 * 现代内页统一框架:
 * 1. 顶部精致主色条
 * 2. 标题区带圆角小胶囊胶标 + 自适应学段标题字号
 * 3. 底部极淡分割线 + 规范页脚与页码徽章
 */
export function drawPageFrame(slide, pptx, themeTokens, titleText, footerText, pageNo) {
  const t = typeof themeTokens === "object" && themeTokens.primary
    ? themeTokens
    : resolveTheme(themeTokens || "math", 3);

  const frame = t.frame || { header: "bar", titleMark: "bar", footerRule: "solid" };
  const radius = t.card?.radius ?? 0.06;

  // 幻灯片全局背景
  slide.background = { color: t.bgTint };

  // 1. 页眉装饰 (风格包决定形态, 全部贴在画布边缘, 不侵占内容安全区)
  switch (frame.header) {
    case "band":
      // 暖阳: 左侧通栏色带 (强调色, 与标题圆点同色系, 不与学科冷色主色打架)
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: 0.16, h: CANVAS_H,
        fill: { color: t.accent },
        line: { color: t.accent, width: 0 }
      });
      break;
    case "rule":
      // 学术: 顶部一粗一细双线
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: CANVAS_W, h: 0.05,
        fill: { color: t.primary },
        line: { color: t.primary, width: 0 }
      });
      slide.addShape(pptx.shapes.LINE, {
        x: 0.8, y: 0.13, w: CANVAS_W - 1.6, h: 0,
        line: { color: t.border, width: 0.75 }
      });
      break;
    case "hairline":
      // 极简: 一条发丝线
      slide.addShape(pptx.shapes.LINE, {
        x: 0, y: 0.02, w: CANVAS_W, h: 0,
        line: { color: t.ink, width: 0.75 }
      });
      break;
    case "paper":
      // 手账: 顶部虚线
      slide.addShape(pptx.shapes.LINE, {
        x: 0.4, y: 0.07, w: CANVAS_W - 0.8, h: 0,
        line: { color: t.accent, width: 1.5, dashType: "dash" }
      });
      break;
    default:
      // 清爽: 顶部主色条
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0, y: 0, w: CANVAS_W, h: 0.08,
        fill: { color: t.primary },
        line: { color: t.primary, width: 0 }
      });
  }

  // 2. 标题区 (标记形态由风格包决定; 文字盒始终落在 0.8~12.53 之间)
  const y = 0.35;
  if (titleText) {
    const mark = frame.titleMark || "bar";
    let titleX = 0.8;

    if (mark === "bar") {
      titleX = 1.05;
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y: y + 0.08, w: 0.14, h: 0.52,
        fill: { color: t.accent },
        line: { color: t.accent, width: 0 },
        rectRadius: radius
      });
    } else if (mark === "dot") {
      titleX = 1.15;
      slide.addShape(pptx.shapes.OVAL, {
        x: 0.86, y: y + 0.22, w: 0.2, h: 0.2,
        fill: { color: t.accent },
        line: { color: t.accent, width: 0 }
      });
    } else if (mark === "underline") {
      titleX = 0.8;
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0.8, y: y + 0.7, w: 1.0, h: 0.06,
        fill: { color: t.accent },
        line: { color: t.accent, width: 0 }
      });
    }

    slide.addText(titleText, {
      x: titleX,
      y: y,
      w: CANVAS_W - titleX - 0.8,
      h: 0.68,
      fontSize: t.fontSize.title,
      bold: true,
      color: t.primaryDark,
      fontFace: FONT_FAMILY,
      valign: "middle"
    });

    // 标题下方分割线: underline 风格由强调短线代劳, 避免双线叠压
    if (titleText && mark !== "underline") {
      slide.addShape(pptx.shapes.LINE, {
        x: 0.8, y: y + 0.72, w: CANVAS_W - 1.6, h: 0,
        line: { color: t.border, width: 0.75 }
      });
    }
  }

  // 3. 底部页脚分割线
  if (frame.footerRule !== "none") {
    slide.addShape(pptx.shapes.LINE, {
      x: 0.8,
      y: CANVAS_H - 0.45,
      w: CANVAS_W - 1.6,
      h: 0,
      line: {
        color: t.border,
        width: 0.5,
        ...(frame.footerRule === "dash" ? { dashType: "dash" } : {})
      }
    });
  }

  // 4. 页脚文字
  if (footerText) {
    slide.addText(footerText, {
      x: 0.8,
      y: CANVAS_H - 0.4,
      w: CANVAS_W - 2.6,
      h: 0.3,
      fontSize: t.fontSize.footer,
      color: t.muted,
      fontFace: FONT_FAMILY,
      valign: "middle"
    });
  }

  // 5. 简约数字页码徽章
  if (pageNo !== undefined && pageNo !== null) {
    slide.addText(String(pageNo), {
      x: CANVAS_W - 1.6,
      y: CANVAS_H - 0.4,
      w: 0.8,
      h: 0.3,
      fontSize: t.fontSize.footer,
      color: t.muted,
      align: "right",
      fontFace: FONT_FAMILY,
      valign: "middle"
    });
  }
}
