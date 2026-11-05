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

const CANVAS_W = 13.333;
const CANVAS_H = 7.5;
const CONTENT_TOP = 1.35;
const CONTENT_BOTTOM = 6.65;
const CARD_SHADOW = { type: "outer", color: "CBD5E1", blur: 4, offset: 2, angle: 90, opacity: 0.25 };

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
  const t = resolveTheme(themeName, grade, "standard");

  const subjText = themeName === "chinese" ? "语文" : (themeName === "english" ? "英语" : "数学");
  const footerText = `人教统编版${subjText}${grade}年级  |  智能课件分层引擎垂直切片`;

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "智能课件分层引擎 (Phase 3 Slice)";
  pptx.title = meta.title || "整十、整百数乘一位数的口算";

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
        slide.addText(pageTitle, {
          x: 1.0, y: 2.2, w: CANVAS_W - 2.0, h: 1.4,
          fontSize: t.fontSize.cover_title,
          bold: true,
          color: t.ink,
          align: "center",
          fontFace: FONT_FAMILY
        });
        if (subtitle) {
          slide.addText(subtitle, {
            x: 1.5, y: 3.8, w: CANVAS_W - 3.0, h: 0.8,
            fontSize: t.fontSize.cover_subtitle,
            color: t.muted,
            align: "center",
            fontFace: FONT_FAMILY
          });
        }
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
          slide.addText(item, {
            x: 1.3, y: cy + 0.15, w: cardW - 0.6, h: 0.85,
            fontSize: t.fontSize.body,
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
        slide.addText([
          { text: `${ctxCard?.properties?.title || "【情境】"}\n\n`, options: { fontSize: t.fontSize.body_large, bold: true, color: t.primaryDark } },
          { text: ctxCard?.properties?.body || "", options: { fontSize: t.fontSize.body, color: t.ink } }
        ], {
          x: 1.4, y: CONTENT_TOP + 0.35, w: cardW - 0.8, h: 1.9,
          valign: "top", fontFace: FONT_FAMILY
        });

        if (eqCard) {
          slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
            x: 1.0, y: CONTENT_TOP + 2.7, w: cardW, h: 1.4,
            fill: { color: "EFF6FF" },
            line: { color: t.primary, width: 1.5 },
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
        const reasoningElem = s.elements.find(e => e.id === "card_reasoning");
        const conclusionElem = s.elements.find(e => e.type === "conclusion_banner");

        const leftW = 6.2;
        const rightX = 7.3;
        const rightW = CANVAS_W - rightX - 0.8;
        const mainH = 3.4;

        // 左侧数轴图元容器
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 0.8, y: CONTENT_TOP + 0.1, w: leftW, h: mainH,
          fill: { color: t.panel },
          line: { color: t.border, width: 1.2 },
          shadow: CARD_SHADOW
        });
        if (figElem) {
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
            fill: { color: "F8FAFC" },
            line: { color: t.border, width: 1 }
          });
          slide.addText(st, {
            x: rightX + 0.5, y: sy + 0.08, w: rightW - 1.0, h: 0.6,
            fontSize: t.fontSize.body,
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
          fontSize: t.fontSize.body_large,
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
            fill: { color: "F8FAFC" },
            line: { color: t.border, width: 1 }
          });
          slide.addText(st, {
            x: 1.1, y: sy + 0.08, w: cardW - 0.6, h: 0.62,
            fontSize: t.fontSize.body,
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
            fontSize: t.fontSize.body,
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
          { text: wrongElem?.properties?.body || "", options: { fontSize: t.fontSize.body_large + 2, bold: true, color: "991B1B" } }
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
          { text: causeElem?.properties?.body || "", options: { fontSize: t.fontSize.body, color: t.ink } }
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
            fontSize: t.fontSize.body_large,
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
            fill: { color: "F8FAFC" },
            line: { color: t.border, width: 1 }
          });
          slide.addText(ruleText, {
            x: rightX + 0.4, y: ry + 0.05, w: rightW - 0.8, h: ruleCardH - 0.1,
            fontSize: 16,
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

        // 根据是否有下半部分 questions / banner 动态分配高度
        let textCardH = 2.1;
        if (!hasQs && hasBanner) {
          textCardH = 3.65;
        } else if (!hasQs && !hasBanner) {
          textCardH = 4.8;
        } else if (hasQs && grade >= 7) {
          textCardH = 2.25;
        }

        // 上部：课文原段 / 重点字词
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
          x: 0.8, y: CONTENT_TOP + 0.1, w: cardW, h: textCardH,
          fill: { color: t.panel },
          line: { color: t.border, width: 1.2 },
          shadow: CARD_SHADOW
        });

        const bodyText = textCard?.properties?.body || "";
        const bodyLines = bodyText.split("\n").filter(Boolean).length;
        let textFontSize = (bodyLines > 3 || bodyText.length > 50) ? (themeName === "english" ? 16 : 18) : (hasQs ? 20 : t.fontSize.body);
        if (grade >= 7) {
          textFontSize = (bodyLines > 3 || bodyText.length > 50) ? 15 : 16;
        }

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
          const qy = CONTENT_TOP + textCardH + 0.15;
          const qh = grade >= 7 ? 1.35 : 1.45;
          qs.forEach((q, qIdx) => {
            const qx = 0.8 + qIdx * (qW + 0.25);
            slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
              x: qx, y: qy, w: qW, h: qh,
              fill: { color: "F8FAFC" },
              line: { color: t.border, width: 1 },
              shadow: CARD_SHADOW
            });
            slide.addText(q, {
              x: qx + 0.2, y: qy + 0.08, w: qW - 0.4, h: qh - 0.16,
              fontSize: grade >= 7 ? 15 : 16,
              bold: true,
              color: t.ink,
              valign: "middle",
              fontFace: FONT_FAMILY
            });
          });
        }

        // 底部：核心重点词句横幅
        if (hasBanner) {
          const bannerY = hasQs ? CONTENT_TOP + 3.95 : CONTENT_TOP + textCardH + 0.2;
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
          slide.addText(qText, {
            x: 1.1, y: qy + 0.1, w: cardW - 0.6, h: 0.75,
            fontSize: Math.min(t.fontSize.body, 18),
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
            fontSize: 16,
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
            fontSize: 15,
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
          slide.addText(item, {
            x: 1.4, y: cy + 0.15, w: cardW - 0.8, h: 0.85,
            fontSize: t.fontSize.body_large,
            bold: true,
            color: t.primaryDark,
            valign: "middle",
            fontFace: FONT_FAMILY
          });
        });
        break;
      }

      case "end_cover": {
        slide.addText(pageTitle || "同学们，下课！", {
          x: 1.0, y: 2.4, w: CANVAS_W - 2.0, h: 1.4,
          fontSize: t.fontSize.cover_title,
          bold: true,
          color: t.ink,
          align: "center",
          fontFace: FONT_FAMILY
        });
        const sub = titleElem?.properties?.subtitle || "认真练习，熟能生巧";
        slide.addText(sub, {
          x: 1.5, y: 4.0, w: CANVAS_W - 3.0, h: 0.8,
          fontSize: t.fontSize.cover_subtitle,
          color: t.muted,
          align: "center",
          fontFace: FONT_FAMILY
        });
        break;
      }

      default:
        break;
    }

    // 注入精准 Timeline 动效步骤标记
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
    animReport
  };
}
