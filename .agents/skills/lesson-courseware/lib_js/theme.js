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
  return "upper";
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
    primary: "B91C1C",
    primaryDark: "7F1D1D",
    accent: "D97706",
    bgTint: "FFFBF5",
    chip: "FEF2F2",
    border: "FDE8E8",
    good: "059669",
    bad: "DC2626",
    ink: "1C1917",
    muted: "78716C",
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
  } else if (level === "upper") {
    // 5-6年级: 沉稳深邃、冷感学术范、高对比度与严谨感
    if (sub === "math") {
      colors.primary = "1E3A8A";     // 深邃牛津蓝
      colors.primaryDark = "0F172A"; // 夜幕深蓝
      colors.accent = "D97706";      // 冷金
      colors.bgTint = "F8FAFC";
      colors.chip = "F1F5F9";
    } else if (sub === "chinese") {
      colors.primary = "881337";     // 典雅墨红紫
      colors.primaryDark = "4C0519"; // 浓墨重彩
      colors.accent = "B45309";      // 暗古铜金
      colors.bgTint = "FBF7F0";      // 古意宣纸底
      colors.chip = "F5EBE1";
    } else if (sub === "english") {
      colors.primary = "064E3B";     // 深邃常青墨绿
      colors.primaryDark = "022C22";
      colors.accent = "D97706";
      colors.bgTint = "F8FAFC";
      colors.chip = "F1F5F9";
    }
  }

  // metadata.style = "innovative": 让契约里的风格字段真正生效(更活泼的强调色与底色)
  if (style === "innovative") {
    colors.accent = { math: "8B5CF6", chinese: "EA580C", english: "0891B2" }[sub] || colors.accent;
    colors.chip = { math: "F5F3FF", chinese: "FFF7ED", english: "ECFEFF" }[sub] || colors.chip;
    colors.bgTint = { math: "FAFAFF", chinese: "FFFCF7", english: "F7FEFF" }[sub] || colors.bgTint;
  }

  return {
    ...colors,
    style,
    gradeLevel: level,
    gradeLevelName: gradeTokens.levelName,
    fontSize: gradeTokens.fontSize,
    lineHeightMultiplier: gradeTokens.lineHeightMultiplier,
    maxItemsPerSlide: gradeTokens.maxItemsPerSlide
  };
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

  // 幻灯片全局背景
  slide.background = { color: t.bgTint };

  // 1. 顶部精致主色条
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: CANVAS_W,
    h: 0.08,
    fill: { color: t.primary },
    line: { color: t.primary, width: 0 }
  });

  // 2. 标题区 (左侧圆角竖条 + 标题文字)
  const y = 0.35;
  if (titleText) {
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.8,
      y: y + 0.08,
      w: 0.14,
      h: 0.52,
      fill: { color: t.accent },
      line: { color: t.accent, width: 0 }
    });

    slide.addText(titleText, {
      x: 1.05,
      y: y,
      w: CANVAS_W - 2.0,
      h: 0.68,
      fontSize: t.fontSize.title,
      bold: true,
      color: t.primaryDark,
      fontFace: FONT_FAMILY,
      valign: "middle"
    });

    // 标题下方细微半透明分割线
    slide.addShape(pptx.shapes.LINE, {
      x: 0.8,
      y: y + 0.72,
      w: CANVAS_W - 1.6,
      h: 0,
      line: { color: t.border, width: 0.75 }
    });
  }

  // 3. 底部页脚分割线
  slide.addShape(pptx.shapes.LINE, {
    x: 0.8,
    y: CANVAS_H - 0.45,
    w: CANVAS_W - 1.6,
    h: 0,
    line: { color: t.border, width: 0.5 }
  });

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
