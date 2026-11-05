// -*- coding: utf-8 -*-
/**
 * 课件表现抽象语法树渲染引擎 (presentation_renderer.js)
 *
 * 核心职责 (纯确定性渲染):
 * 1. 严格消费 Presentation AST (presentation.v1.json)，彻底脱离大模型动态决策;
 * 2. 将 elements 映射为几何卡槽与学科图元 (数轴、生字、公式、卡片);
 * 3. 显式 Timeline 驱动: 配合 reveal_steps 与 deck_transition 注入原生 OpenXML 动画;
 * 4. 驱动 layout_audit 进行几何体检，保证 0 Critical 交付。
 */

import fs from "fs";
import path from "path";
import pptxgen from "pptxgenjs";
import { resolveTheme, footerOf, drawPageFrame, FONT_FAMILY } from "../theme.js";
import { renderNumberLine, renderFigure } from "../figures.js";
import { annotateRevealSteps } from "../reveal_steps.js";
import { injectSlideTransitions } from "../deck_transition.js";
import { auditDeck } from "../layout_audit.js";
import { fitTextLayout, fitFontSize } from "../text_fit.js";
import { prepareFigureAnimations } from "../animation_prep.js";

const CANVAS_W = 13.333;
const CANVAS_H = 7.5;
const CONTENT_TOP = 1.35;
const CONTENT_BOTTOM = 6.65;

/**
 * 卡片投影在渲染开始时由风格包注入 (minimal 近乎无投影, warm 更柔软)。
 * 保留模块级变量而非改造成每个调用点传参, 是为了不让换肤改动扩散到 50+ 个卡槽坐标。
 */
let CARD_SHADOW = { type: "outer", color: "CBD5E1", blur: 4, offset: 2, angle: 90, opacity: 0.25 };

/**
 * 把风格包的圆角同步到本页已创建的圆角矩形上。
 * PptxGenJS 的 rectRadius 是写入时才读取的选项, 因此在 addSlide 之后统一回填即可,
 * 无需逐个修改 addShape 调用点 (改 50 处比改 1 处更容易引入漏改)。
 */
function applyCardRadius(slide, radius) {
  if (radius === undefined || radius === null) return;
  for (const obj of slide?._slideObjects || []) {
    const shapeType = obj?.options?.shape;
    if (shapeType === "roundRect" || shapeType === "ROUNDED_RECTANGLE") {
      obj.options.rectRadius = radius;
    }
  }
}

/**
 * 封面/封底装饰层
 *
 * 5 套构图全部只用整块色带、细线与虚线做区分, 标题/副标题文字盒保持
 * 在 x∈[1.0, 12.3]、y∈[1.7, 4.9] 的安全区内, 因此任意风格都不会越界或压盖。
 * 唯一例外是 academic 的右侧竖块, 它只铺在空白列 (x≥9.9), 不与文字盒相交。
 */
function renderCoverDecor(slide, pptx, t, { title, subtitle }) {
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
        shadow: CARD_SHADOW
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


function findElement(elements, id) {
  return elements.find(e => e.id === id) || null;
}

function findElementsByType(elements, type) {
  return elements.filter(e => e.type === type);
}

export async function renderPresentation(data, options = {}) {
  const defaultBase = data.deck_meta?.title ? `${data.deck_meta.title}_新架构` : "整十数乘一位数的口算_新架构切片";
  const { outdir = "output/vertical_slice", strict = false, outputBaseName = defaultBase } = options;
  fs.mkdirSync(outdir, { recursive: true });

  const meta = data.deck_meta || {};
  let themeName = "math";
  if (meta.theme?.includes("chinese") || meta.source_lesson_id?.includes("chi-")) themeName = "chinese";
  if (meta.theme?.includes("english") || meta.source_lesson_id?.includes("eng-")) themeName = "english";

  let grade = 3;
  const gradeMatch = (meta.source_lesson_id || "").match(/-g(\d)-/);
  if (gradeMatch) grade = parseInt(gradeMatch[1], 10);

  // 风格优先级: CLI --style > 契约 deck_meta.style > clean
  const styleName = options.style || meta.style || "clean";
  const t = resolveTheme(themeName, grade, styleName);
  // "shadow" in card 而非取值判断: minimal 用 null 表示"不写阴影节点",
  // 若写成 || 会把 null 回落成默认投影, 极简风格就失效了
  CARD_SHADOW = t.card && "shadow" in t.card ? t.card.shadow : CARD_SHADOW;

  const subjText = themeName === "chinese" ? "语文" : (themeName === "english" ? "英语" : "数学");
  const footerText = `人教统编版${subjText}${grade}年级`;

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "教师课件助手";
  pptx.title = meta.title || "课件";

  // 动态媒体预处理: 扫描全部 figure_animation 图元, 现场合成算理动画视频
  // (数学门禁前置 + 幂等缓存), 合成产物路径就地写回元素, 之后由 renderFigure 原生嵌入。
  const animEntries = [];
  (data.slides || []).forEach((s, idx) => {
    for (const el of s.elements || []) {
      if (el.type === "figure_animation" && el.properties) {
        animEntries.push({ slide: idx + 1, fig: el.properties });
      }
    }
  });
  const animPrepReport = await prepareFigureAnimations(animEntries, { outdir, strict });

  const revealSlideMarks = [];

  for (const s of data.slides) {
    const slide = pptx.addSlide();
    if (s.notes) slide.addNotes(s.notes);

    // 页面主标题提取
    const titleElem = s.elements.find(e => e.type === "title");
    const pageTitle = titleElem?.properties?.text || "";

    // 封面与封底整页背景，其余页面绘制统一底框与页眉页脚
    if (s.layout !== "title_cover" && s.layout !== "end_cover") {
      drawPageFrame(slide, pptx, t, pageTitle, footerText, revealSlideMarks.length + 1);
    }
    const baseCount = slide._slideObjects.length;

    // 依据布局与元素渲染页面内容
    switch (s.layout) {
      case "title_cover": {
        const subtitle = titleElem?.properties?.subtitle || "";
        renderCoverDecor(slide, pptx, t, { title: pageTitle, subtitle });
        break;
      }

      case "objectives_card": {
        const cardList = s.elements.find(e => e.type === "card_list");
        const items = cardList?.properties?.items || [];
        const cardW = CANVAS_W - 2.0;
        const startY = CONTENT_TOP + 0.3;
        items.forEach((item, idx) => {
          const cy = startY + idx * 1.45;
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 1.0, y: cy, w: cardW, h: 1.15,
            fill: { color: t.panel },
            line: { color: t.border, width: 1.2 },
            shadow: CARD_SHADOW
          });
          const fitted = fitTextLayout(item, cardW - 0.6, 0.85, t.fontSize.body);
          slide.addText(fitted.text, {
            x: 1.3, y: cy + 0.15, w: cardW - 0.6, h: 0.85,
            fontSize: fitted.size,
            bold: true,
            color: t.ink,
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        });
        break;
      }

      case "context_problem": {
        const ctxCard = s.elements.find(e => e.id === "card_context");
        const eqCard = s.elements.find(e => e.id === "eq_warmup");
        const cardW = CANVAS_W - 2.0;

        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 1.0, y: CONTENT_TOP + 0.2, w: cardW, h: 2.2,
          fill: { color: t.panel },
          line: { color: t.border, width: 1.2 },
          shadow: CARD_SHADOW
        });
        const ctxBody = ctxCard?.properties?.body || "";
        const ctxBodySize = fitFontSize(ctxBody, cardW - 0.8, 1.15, t.fontSize.body);
        slide.addText([
          { text: `${ctxCard?.properties?.title || "【情境】"}\n\n`, options: { fontSize: t.fontSize.body_large, bold: true, color: t.primaryDark } },
          { text: ctxBody, options: { fontSize: ctxBodySize, color: t.ink } }
        ], {
          x: 1.4, y: CONTENT_TOP + 0.35, w: cardW - 0.8, h: 1.9,
          valign: "top", fontFace: FONT_FAMILY
        });

        if (eqCard) {
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 1.0, y: CONTENT_TOP + 2.7, w: cardW, h: 1.4,
            fill: { color: t.chip || "EFF6FF" },
            // 描边粗细跟随风格包: 极简的近黑主色配 1.5pt 会像黑框, 按包内基础线宽微调
            line: { color: t.primary, width: Math.min(1.5, (t.card?.borderWidth ?? 1.2) + 0.3) },
            shadow: CARD_SHADOW
          });
          slide.addText(`列式：${eqCard.properties?.expression || ""}`, {
            x: 1.4, y: CONTENT_TOP + 2.8, w: cardW - 0.8, h: 1.2,
            fontSize: t.fontSize.body_large + 2,
            bold: true,
            color: t.primaryDark,
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        }
        break;
      }

      case "model_left_reasoning_right": {
        const figElem = s.elements.find(e => e.type === "figure_number_line");
        const animElem = s.elements.find(e => e.type === "figure_animation");
        const reasoningElem = s.elements.find(e => e.id === "card_reasoning");
        const conclusionElem = s.elements.find(e => e.type === "conclusion_banner");

        const leftW = 6.2;
        const rightX = 7.3;
        const rightW = CANVAS_W - rightX - 0.8;
        const mainH = 3.4;

        // 左侧模型容器: 声明式动画走动态媒体子引擎, 数轴走矢量图元
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 0.8, y: CONTENT_TOP + 0.1, w: leftW, h: mainH,
          fill: { color: t.panel },
          line: { color: t.border, width: 1.2 },
          shadow: CARD_SHADOW
        });
        if (animElem) {
          renderFigure(slide, pptx, { kind: "animation", ...animElem.properties }, [0.9, CONTENT_TOP + 0.4, leftW - 0.2, mainH - 0.8], t);
        } else if (figElem) {
          renderNumberLine(slide, pptx, { ...figElem.properties, id: figElem.id }, [0.9, CONTENT_TOP + 0.4, leftW - 0.2, mainH - 0.8], t);
        }

        // 右侧算理卡片组
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: rightX, y: CONTENT_TOP + 0.1, w: rightW, h: mainH,
          fill: { color: t.panel },
          line: { color: t.border, width: 1.2 },
          shadow: CARD_SHADOW
        });
        const steps = reasoningElem?.properties?.items || [];
        steps.forEach((st, sIdx) => {
          const sy = CONTENT_TOP + 0.35 + sIdx * 0.95;
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: rightX + 0.3, y: sy, w: rightW - 0.6, h: 0.75,
            fill: { color: t.chip || "F8FAFC" },
            line: { color: t.border, width: 1 }
          });
          const fittedStep = fitTextLayout(st, rightW - 1.0, 0.6, t.fontSize.body);
          slide.addText(fittedStep.text, {
            x: rightX + 0.5, y: sy + 0.08, w: rightW - 1.0, h: 0.6,
            fontSize: fittedStep.size,
            bold: true,
            color: t.ink,
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        });

        // 底部结论横幅
        if (conclusionElem) {
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 0.8, y: CONTENT_TOP + 3.75, w: CANVAS_W - 1.6, h: 1.0,
            fill: { color: "FEF3C7" },
            line: { color: "F59E0B", width: 1.5 },
            shadow: CARD_SHADOW
          });
          slide.addText(conclusionElem.properties?.text || "", {
            x: 1.1, y: CONTENT_TOP + 3.85, w: CANVAS_W - 2.2, h: 0.8,
            fontSize: t.fontSize.body_large,
            bold: true,
            color: "92400E",
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        }
        break;
      }

      case "example_step_by_step": {
        const probCard = s.elements.find(e => e.id === "card_ex_problem");
        const stepsCard = s.elements.find(e => e.id === "card_ex_steps");
        const ansCard = s.elements.find(e => e.type === "answer_feedback");
        const cardW = CANVAS_W - 1.6;

        // 顶部题目
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 0.8, y: CONTENT_TOP + 0.1, w: cardW, h: 1.05,
          fill: { color: t.panel },
          line: { color: t.border, width: 1.2 },
          shadow: CARD_SHADOW
        });
        slide.addText(probCard?.properties?.body || "", {
          x: 1.1, y: CONTENT_TOP + 0.18, w: cardW - 0.6, h: 0.9,
          fontSize: fitFontSize(probCard?.properties?.body || "", cardW - 0.6, 0.9, t.fontSize.body_large),
          bold: true,
          color: t.primaryDark,
          valign: "middle",
          fontFace: FONT_FAMILY
        });

        // 中间分步
        const exSteps = stepsCard?.properties?.items || [];
        exSteps.forEach((st, sIdx) => {
          const sy = CONTENT_TOP + 1.35 + sIdx * 0.95;
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 0.8, y: sy, w: cardW, h: 0.78,
            fill: { color: t.chip || "F8FAFC" },
            line: { color: t.border, width: 1 }
          });
          const fittedStep = fitTextLayout(st, cardW - 0.6, 0.62, t.fontSize.body);
          slide.addText(fittedStep.text, {
            x: 1.1, y: sy + 0.08, w: cardW - 0.6, h: 0.62,
            fontSize: fittedStep.size,
            bold: true,
            color: t.ink,
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        });

        // 底部答语
        if (ansCard) {
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 0.8, y: CONTENT_TOP + 4.35, w: cardW, h: 0.75,
            fill: { color: "ECFDF5" },
            line: { color: "10B981", width: 1.2 },
            shadow: CARD_SHADOW
          });
          slide.addText(ansCard.properties?.text || "", {
            x: 1.1, y: CONTENT_TOP + 4.4, w: cardW - 0.6, h: 0.65,
            fontSize: fitFontSize(ansCard.properties?.text || "", cardW - 0.6, 0.65, t.fontSize.body),
            bold: true,
            color: "065F46",
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        }
        break;
      }

      case "misconception_split": {
        const wrongElem = s.elements.find(e => e.id === "card_wrong");
        const causeElem = s.elements.find(e => e.id === "card_cause");
        const correctElem = s.elements.find(e => e.id === "card_correct");
        const colW = (CANVAS_W - 2.0) / 2;

        // 左侧错例
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 0.8, y: CONTENT_TOP + 0.2, w: colW, h: 3.0,
          fill: { color: "FEF2F2" },
          line: { color: "EF4444", width: 1.5 },
          shadow: CARD_SHADOW
        });
        slide.addText([
          { text: "【典型错例】\n\n", options: { fontSize: t.fontSize.body_large, bold: true, color: "DC2626" } },
          { text: wrongElem?.properties?.body || "", options: { fontSize: fitFontSize(wrongElem?.properties?.body || "", colW - 0.6, 1.6, t.fontSize.body_large + 2), bold: true, color: "991B1B" } }
        ], {
          x: 1.1, y: CONTENT_TOP + 0.4, w: colW - 0.6, h: 2.5,
          valign: "top", fontFace: FONT_FAMILY
        });

        // 右侧错因诊断
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 0.8 + colW + 0.4, y: CONTENT_TOP + 0.2, w: colW, h: 3.0,
          fill: { color: t.panel },
          line: { color: t.border, width: 1.2 },
          shadow: CARD_SHADOW
        });
        slide.addText([
          { text: "【病因诊断】\n\n", options: { fontSize: t.fontSize.body_large, bold: true, color: t.primaryDark } },
          { text: causeElem?.properties?.body || "", options: { fontSize: fitFontSize(causeElem?.properties?.body || "", colW - 0.6, 1.6, t.fontSize.body), color: t.ink } }
        ], {
          x: 0.8 + colW + 0.7, y: CONTENT_TOP + 0.4, w: colW - 0.6, h: 2.5,
          valign: "top", fontFace: FONT_FAMILY
        });

        // 底部正解
        if (correctElem) {
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 0.8, y: CONTENT_TOP + 3.5, w: CANVAS_W - 1.6, h: 1.3,
            fill: { color: "ECFDF5" },
            line: { color: "10B981", width: 1.5 },
            shadow: CARD_SHADOW
          });
          slide.addText(correctElem.properties?.text || "", {
            x: 1.1, y: CONTENT_TOP + 3.65, w: CANVAS_W - 2.2, h: 1.0,
            fontSize: fitFontSize(correctElem.properties?.text || "", CANVAS_W - 2.2, 1.0, t.fontSize.body_large),
            bold: true,
            color: "065F46",
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        }
        break;
      }

      case "character_practice": {
        const figElem = s.elements.find(e => e.type === "figure_tianzige");
        const rulesElem = s.elements.find(e => e.id === "card_rules");
        const tipElem = s.elements.find(e => e.id === "card_tip");

        const leftW = 5.6;
        const rightX = 6.7;
        const rightW = CANVAS_W - rightX - 0.8;
        const mainH = 3.6;

        // 左侧田字格容器卡片
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 0.8, y: CONTENT_TOP + 0.1, w: leftW, h: mainH,
          fill: { color: t.panel },
          line: { color: t.border, width: 1.2 },
          shadow: CARD_SHADOW
        });
        if (figElem) {
          renderFigure(slide, pptx, { kind: "tianzige", ...figElem.properties }, [1.0, CONTENT_TOP + 0.3, leftW - 0.4, mainH - 0.6], t);
        }

        // 右侧书写要领与规律卡片
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: rightX, y: CONTENT_TOP + 0.1, w: rightW, h: mainH,
          fill: { color: t.panel },
          line: { color: t.border, width: 1.2 },
          shadow: CARD_SHADOW
        });
        const rRules = rulesElem?.properties?.items || [];
        const ruleCount = Math.max(1, rRules.length);
        const ruleCardH = Math.min(0.95, (mainH - 0.4 - (ruleCount - 1) * 0.15) / ruleCount);
        rRules.forEach((ruleText, rIdx) => {
          const ry = CONTENT_TOP + 0.25 + rIdx * (ruleCardH + 0.15);
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: rightX + 0.25, y: ry, w: rightW - 0.5, h: ruleCardH,
            fill: { color: t.chip || "F8FAFC" },
            line: { color: t.border, width: 1 }
          });
          const fittedRule = fitTextLayout(ruleText, rightW - 0.8, ruleCardH - 0.1, 16);
          slide.addText(fittedRule.text, {
            x: rightX + 0.4, y: ry + 0.05, w: rightW - 0.8, h: ruleCardH - 0.1,
            fontSize: fittedRule.size,
            bold: true,
            color: t.ink,
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        });

        // 底部提示横幅
        if (tipElem) {
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 0.8, y: CONTENT_TOP + 3.85, w: CANVAS_W - 1.6, h: 0.95,
            fill: { color: "FEF3C7" },
            line: { color: "F59E0B", width: 1.5 },
            shadow: CARD_SHADOW
          });
          slide.addText(tipElem.properties?.text || "", {
            x: 1.1, y: CONTENT_TOP + 3.92, w: CANVAS_W - 2.2, h: 0.8,
            fontSize: t.fontSize.body,
            bold: true,
            color: "92400E",
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        }
        break;
      }

      case "reading_focus": {
        const textCard = s.elements.find(e => e.id === "card_reading_text");
        const questionsCard = s.elements.find(e => e.id === "card_questions");
        const bannerElem = s.elements.find(e => e.type === "conclusion_banner");
        const cardW = CANVAS_W - 1.6;
        const qs = questionsCard?.properties?.items || [];
        const hasQs = qs.length > 0;
        const hasBanner = !!bannerElem;
        const bodyText = textCard?.properties?.body || "";
        const bodyLines = bodyText.split("\n").filter(Boolean).length;

        // 根据是否有下半部分 questions / banner 动态分配高度
        let textCardH = 2.1;
        let qh = grade >= 7 ? 1.35 : 1.45;
        let qy = CONTENT_TOP + textCardH + 0.15;
        const isIntroPrompt = hasQs && bodyLines <= 2 && bodyText.length <= 65;

        if (!hasQs && hasBanner) {
          // 拆页后的【原文品读页】：大空间大字号舒展呈现原文
          textCardH = 4.0;
        } else if (!hasQs && !hasBanner) {
          textCardH = 4.8;
        } else if (isIntroPrompt) {
          // 拆页后的【设问探究页】：引导语紧凑，把充足纵向空间留给设问卡片
          textCardH = 1.25;
          qy = CONTENT_TOP + textCardH + 0.15;
          qh = 2.05;
        } else if (hasQs && grade >= 7) {
          textCardH = 2.25;
          qy = CONTENT_TOP + textCardH + 0.15;
          qh = 1.35;
        }

        // 上部：课文原段 / 重点字词
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 0.8, y: CONTENT_TOP + 0.1, w: cardW, h: textCardH,
          fill: { color: t.panel },
          line: { color: t.border, width: 1.2 },
          shadow: CARD_SHADOW
        });

        // 字号动态自适应：拆页后原文页享有 20~22pt 护眼大字
        let textFontSize;
        if (!hasQs) {
          textFontSize = (bodyText.length > 120 || bodyLines > 4) ? 20 : 22;
        } else if (isIntroPrompt) {
          textFontSize = 18;
        } else {
          textFontSize = (bodyLines > 3 || bodyText.length > 50) ? (grade >= 7 ? 15 : 18) : (themeName === "english" ? 16 : 20);
        }
        // 按真实字宽与卡片高度兜底收敛, 防止长文溢出与末行孤字
        textFontSize = Math.min(
          textFontSize,
          fitFontSize(bodyText, cardW - 0.6, Math.max(0.4, textCardH - 0.95), textFontSize, 14)
        );

        slide.addText([
          { text: `${textCard?.properties?.title || "【精读赏析】"}\n\n`, options: { fontSize: textFontSize, bold: true, color: t.primaryDark } },
          { text: bodyText, options: { fontSize: textFontSize, color: t.ink } }
        ], {
          x: 1.1, y: CONTENT_TOP + 0.25, w: cardW - 0.6, h: textCardH - 0.35,
          fontSize: textFontSize,
          valign: "top", fontFace: FONT_FAMILY
        });

        // 中部：探究设问或要点
        if (hasQs) {
          const qCount = qs.length;
          const qW = (cardW - (qCount - 1) * 0.25) / qCount;
          const qFontSize = qh >= 1.9 ? 18 : (grade >= 7 ? 15 : 16);
          qs.forEach((q, qIdx) => {
            const qx = 0.8 + qIdx * (qW + 0.25);
            slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
              x: qx, y: qy, w: qW, h: qh,
              fill: { color: t.chip || "F8FAFC" },
              line: { color: t.border, width: 1 },
              shadow: CARD_SHADOW
            });
            const fittedQ = fitTextLayout(q, qW - 0.4, qh - 0.2, qFontSize);
            slide.addText(fittedQ.text, {
              x: qx + 0.2, y: qy + 0.1, w: qW - 0.4, h: qh - 0.2,
              fontSize: fittedQ.size,
              bold: true,
              color: t.ink,
              valign: "middle",
              fontFace: FONT_FAMILY
            });
          });
        }

        // 底部：核心重点词句横幅
        if (hasBanner) {
          const bannerY = isIntroPrompt ? (qy + qh + 0.18) : (hasQs ? CONTENT_TOP + 3.95 : CONTENT_TOP + textCardH + 0.2);
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 0.8, y: bannerY, w: cardW, h: 0.9,
            fill: { color: "ECFDF5" },
            line: { color: "10B981", width: 1.5 },
            shadow: CARD_SHADOW
          });
          slide.addText(bannerElem.properties?.text || "", {
            x: 1.1, y: bannerY + 0.07, w: cardW - 0.6, h: 0.75,
            fontSize: t.fontSize.body,
            bold: true,
            color: "065F46",
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        }
        break;
      }

      case "practice_list": {
        const prElem = s.elements.find(e => e.type === "practice_list");
        const qs = prElem?.properties?.questions || [];
        const cardW = CANVAS_W - 1.6;

        qs.forEach((qText, qIdx) => {
          const qy = CONTENT_TOP + 0.15 + qIdx * 1.15;
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 0.8, y: qy, w: cardW, h: 0.95,
            fill: { color: t.panel },
            line: { color: t.border, width: 1.2 },
            shadow: CARD_SHADOW
          });
          const fittedQ = fitTextLayout(qText, cardW - 0.6, 0.75, Math.min(t.fontSize.body, 18));
          slide.addText(fittedQ.text, {
            x: 1.1, y: qy + 0.1, w: cardW - 0.6, h: 0.75,
            fontSize: fittedQ.size,
            bold: true,
            color: t.ink,
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        });
        break;
      }

      case "answer_reveal_list": {
        const ansItems = s.elements.filter(e => e.type === "answer_feedback");
        const cardW = CANVAS_W - 1.6;
        const itemCount = Math.max(1, ansItems.length);
        const cardH = Math.min(1.22, (4.9 - (itemCount - 1) * 0.15) / itemCount);

        ansItems.forEach((it, idx) => {
          const cy = CONTENT_TOP + 0.08 + idx * (cardH + 0.15);
          // 外框白底卡片 (常驻)
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 0.8, y: cy, w: cardW, h: cardH,
            fill: { color: t.panel },
            line: { color: t.border, width: 1.2 },
            shadow: CARD_SHADOW
          });
          // 题干 (常驻)
          slide.addText(`${it.properties?.question_num || ""}  ${it.properties?.stem || ""}`, {
            x: 1.1, y: cy + 0.05, w: cardW - 0.6, h: 0.40,
            fontSize: fitFontSize(`${it.properties?.question_num || ""}  ${it.properties?.stem || ""}`, cardW - 0.6, 0.40, 16, 13),
            bold: true,
            color: t.ink,
            fontFace: FONT_FAMILY
          });
          // 浅绿色参考答案卡片 (按步骤淡入)
          const ansBoxH = cardH - 0.52;
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 1.1, y: cy + 0.44, w: cardW - 0.6, h: ansBoxH,
            fill: { color: "ECFDF5" },
            line: { color: "A7F3D0", width: 1 }
          });
          slide.addText(it.properties?.explanation || "", {
            x: 1.2, y: cy + 0.46, w: cardW - 0.8, h: ansBoxH - 0.04,
            fontSize: fitFontSize(it.properties?.explanation || "", cardW - 0.8, ansBoxH - 0.04, 15, 12),
            bold: true,
            color: "047857",
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        });
        break;
      }

      case "summary_card": {
        const sumCard = s.elements.find(e => e.type === "card_list");
        const items = sumCard?.properties?.items || [];
        const cardW = CANVAS_W - 2.0;

        items.forEach((item, idx) => {
          const cy = CONTENT_TOP + 0.3 + idx * 1.45;
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 1.0, y: cy, w: cardW, h: 1.15,
            fill: { color: t.panel },
            line: { color: t.primary, width: 1.5 },
            shadow: CARD_SHADOW
          });
          const fittedItem = fitTextLayout(item, cardW - 0.8, 0.85, t.fontSize.body_large);
          slide.addText(fittedItem.text, {
            x: 1.4, y: cy + 0.15, w: cardW - 0.8, h: 0.85,
            fontSize: fittedItem.size,
            bold: true,
            color: t.primaryDark,
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        });
        break;
      }

      case "phase_placeholder": {
        // 骨架必备环节缺失的提示页: 虚线框 + 待补文案, 一眼看出这不是教学内容
        const hintCard = s.elements.find(e => e.type === "card_list");
        const items = hintCard?.properties?.items || [];
        const cardW = CANVAS_W - 2.0;
        const cardX = 1.0;
        const cardY = CONTENT_TOP + 0.3;
        const cardH = 4.0;

        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: cardX, y: cardY, w: cardW, h: cardH,
          fill: { color: t.bgTint || "FFFFFF" },
          line: { color: t.accent, width: 1.5, dashType: "dash" },
          shadow: CARD_SHADOW
        });

        const bodyText = items.map((it, i) => (i === 0 ? it : `· ${it}`)).join("\n\n");
        const fittedBody = fitTextLayout(bodyText, cardW - 1.0, cardH - 0.8, t.fontSize.body);
        slide.addText(fittedBody.text, {
          x: cardX + 0.5, y: cardY + 0.4, w: cardW - 1.0, h: cardH - 0.8,
          fontSize: fittedBody.size,
          color: t.ink,
          valign: "middle",
          fontFace: FONT_FAMILY
        });
        break;
      }

      case "board_design": {
        const topicCard = s.elements.find(e => e.type === "text_card");
        const branches = s.elements.filter(e => e.type === "card_list");
        const footerCard = s.elements.find(e => e.type === "conclusion_banner");

        // 顶部课题条: 主色浅底, 板书标题居中
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 1.0, y: CONTENT_TOP + 0.15, w: CANVAS_W - 2.0, h: 0.95,
          fill: { color: t.chip || "EFF6FF" },
          line: { color: t.primary, width: 1.2 },
          shadow: CARD_SHADOW
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

        // 分支卡: 1 支占满整行, 2 支左右分栏
        const colCount = Math.max(1, Math.min(2, branches.length));
        const gap = 0.35;
        const colW = (CANVAS_W - 2.0 - gap * (colCount - 1)) / colCount;
        const branchY = CONTENT_TOP + 1.4;
        const branchH = 3.05;

        branches.slice(0, 2).forEach((b, idx) => {
          const bx = 1.0 + idx * (colW + gap);
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: bx, y: branchY, w: colW, h: branchH,
            fill: { color: t.panel },
            line: { color: t.border, width: 1.2 },
            shadow: CARD_SHADOW
          });
          // 左侧色条标记分支 (内缩一点, 不压住圆角边)
          slide.addShape(pptx.shapes.RECTANGLE, {
            x: bx + 0.07, y: branchY + 0.2, w: 0.08, h: branchH - 0.4,
            fill: { color: idx === 0 ? t.primary : t.accent },
            line: { color: idx === 0 ? t.primary : t.accent, width: 0 }
          });

          const head = b.properties?.head || "";
          slide.addText(head, {
            x: bx + 0.3, y: branchY + 0.15, w: colW - 0.55, h: 0.45,
            fontSize: t.fontSize.body,
            bold: true,
            color: idx === 0 ? t.primaryDark : t.ink,
            valign: "middle",
            fontFace: FONT_FAMILY
          });

          // 每条要点独立成块: 拼成一个长文本框时, 折行会把上一条的续行挤到左边缘,
          // 视觉上分不清条目边界; 独立成块后每条各自自适应字号。
          const items = b.properties?.items || [];
          const itemTop = branchY + 0.68;
          const itemH = 0.75;
          items.slice(0, 3).forEach((it, iIdx) => {
            const fitted = fitTextLayout(`· ${it}`, colW - 0.65, itemH - 0.06, t.fontSize.body - 1);
            slide.addText(fitted.text, {
              x: bx + 0.3, y: itemTop + iIdx * itemH, w: colW - 0.55, h: itemH - 0.06,
              fontSize: fitted.size,
              color: t.ink,
              valign: "middle",
              fontFace: FONT_FAMILY
            });
          });
        });

        if (footerCard) {
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 1.0, y: CONTENT_BOTTOM - 0.75, w: CANVAS_W - 2.0, h: 0.7,
            fill: { color: t.chip || "EFF6FF" },
            line: { color: t.border, width: 1 },
            shadow: CARD_SHADOW
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
        break;
      }

      case "homework_card": {
        const tierElem = s.elements.find(e => e.type === "tier_list");
        const tiers = tierElem?.properties?.tiers || [];
        const cardW = CANVAS_W - 2.0;
        const rowH = 1.45;
        const rowGap = 0.3;
        const startY = CONTENT_TOP + 0.28;
        const tierColors = [t.primary, t.accent, t.primaryDark];

        tiers.forEach((tier, idx) => {
          const cy = startY + idx * (rowH + rowGap);
          const tone = tierColors[idx] || t.primary;

          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 1.0, y: cy, w: cardW, h: rowH,
            fill: { color: t.panel },
            line: { color: t.border, width: 1.2 },
            shadow: CARD_SHADOW
          });
          // 左端色块承载层级名 (必做/选做/挑战)
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 1.0, y: cy, w: 1.5, h: rowH,
            fill: { color: tone },
            line: { color: tone, width: 0 }
          });
          slide.addText(tier.tier || "", {
            x: 1.0, y: cy, w: 1.5, h: rowH,
            fontSize: t.fontSize.body_large,
            bold: true,
            color: "FFFFFF",
            align: "center",
            valign: "middle",
            fontFace: FONT_FAMILY
          });

          const fittedDesc = fitTextLayout(tier.desc || "", cardW - 2.3, rowH - 0.45, t.fontSize.body);
          slide.addText(fittedDesc.text, {
            x: 2.8, y: cy + 0.2, w: cardW - 2.1, h: rowH - 0.4,
            fontSize: fittedDesc.size,
            color: t.ink,
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        });
        break;
      }

      case "end_cover": {
        const sub = titleElem?.properties?.subtitle || "认真练习，熟能生巧";
        renderCoverDecor(slide, pptx, t, { title: pageTitle || "同学们，下课！", subtitle: sub });
        break;
      }

      default:
        break;
    }

    // 注入精准 Timeline 动效步骤标记
    // 统一回填风格包圆角 (只改外观, 不改包围盒)
    applyCardRadius(slide, t.card?.radius);

    const annot = annotateRevealSteps(slide, {
      baseCount,
      pageType: s.layout,
      timeline: s.timeline
    });
    revealSlideMarks.push({
      slide: revealSlideMarks.length + 1,
      layout: s.layout,
      steps: annot.steps,
      shapes: annot.shapes,
      mode: annot.mode
    });
  }

  // 写盘与动画后处理
  const pptxPath = path.join(outdir, `${outputBaseName}.pptx`);
  const jsonPath = path.join(outdir, `${outputBaseName}.presentation.json`);
  const auditPath = path.join(outdir, `${outputBaseName}.audit.json`);

  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  await pptx.writeFile({ fileName: pptxPath });

  // 注入全屏原生 OpenXML 单击淡入动画
  const animReport = injectSlideTransitions(pptxPath, "fade");

  // 几何体检 (layout_audit)
  const auditResult = auditDeck(pptx, { strict });
  auditResult.reveal = {
    pages: animReport.pages,
    withTiming: animReport.withTiming,
    stepsTotal: animReport.stepsTotal,
    orderValid: animReport.orderValid,
    perSlide: animReport.perSlide,
    perSlideMarks: revealSlideMarks
  };

  fs.writeFileSync(auditPath, JSON.stringify(auditResult, null, 2));

  return {
    pptxPath,
    jsonPath,
    auditPath,
    auditResult,
    animReport,
    animPrepReport
  };
}
