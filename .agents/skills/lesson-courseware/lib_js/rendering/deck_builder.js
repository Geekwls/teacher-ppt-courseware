// -*- coding: utf-8 -*-
/**
 * 课件表现抽象语法树渲染编排 (deck_builder.js)
 *
 * 核心职责 (纯确定性渲染):
 * 1. 严格消费 Presentation AST, 彻底脱离大模型动态决策;
 * 2. 解析主题、创建幻灯片、绘制统一页框, 把具体版式交给 renderers/<layout>.js;
 * 3. 显式 Timeline 驱动: 配合 reveal_steps 与 deck_transition 注入原生 OpenXML 动画;
 * 4. 驱动 layout_audit 进行几何体检, 保证 0 Critical 交付。
 *
 * 本文件只做 I/O 编排, 不包含任何版式绘制代码。
 */

import fs from "fs";
import path from "path";
import pptxgen from "pptxgenjs";
import { resolveTheme, drawPageFrame, FONT_FAMILY } from "../theme.js";
import { annotateRevealSteps } from "../reveal_steps.js";
import { injectSlideTransitions } from "../deck_transition.js";
import { auditDeck } from "../layout_audit.js";
import { prepareFigureAnimations } from "../animation_prep.js";
import { gradeLabel } from "../domain/grades.js";
import { renderLayout } from "./renderers/index.js";

/**
 * 卡片投影默认值。风格包在渲染开始时注入。
 *
 * ⚠️ 只读模板: PptxGenJS 会原地把 shadow.blur/offset 乘 12700 转 EMU, 复用同一引用会
 * 连乘 12700^N 直到溢出成非法 alpha, 渲染器随即丢弃该形状 (卡片/田字格凭空消失)。
 * 调用点一律写 shadow: { ...CARD_SHADOW }。
 */
const DEFAULT_CARD_SHADOW = { type: "outer", color: "CBD5E1", blur: 4, offset: 2, angle: 90, opacity: 0.25 };

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

export async function buildDeck(data, options = {}) {
  const defaultBase = data.deck_meta?.title ? `${data.deck_meta.title}_课件` : "课时课件";
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
  const cardShadow = t.card && "shadow" in t.card ? t.card.shadow : DEFAULT_CARD_SHADOW;

  const subjText = themeName === "chinese" ? "语文" : (themeName === "english" ? "英语" : "数学");
  const footerText = `人教统编版 ${subjText} · ${gradeLabel(grade)}`;

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

  const ctx = { pptx, t, themeName, grade, cardShadow, fontFamily: FONT_FAMILY };
  const revealSlideMarks = [];

  for (const s of data.slides) {
    const slide = pptx.addSlide();
    if (s.notes) slide.addNotes(s.notes);

    // 页面主标题提取 (仅用于页框页眉)
    const titleElem = s.elements.find(e => e.type === "title");
    const pageTitle = titleElem?.properties?.text || "";

    // 封面与封底整页背景，其余页面绘制统一底框与页眉页脚
    if (s.layout !== "title_cover" && s.layout !== "end_cover") {
      drawPageFrame(slide, pptx, t, pageTitle, footerText, revealSlideMarks.length + 1);
    }
    const baseCount = slide._slideObjects.length;

    // 依据版式注册表绘制页面内容
    renderLayout(slide, s, ctx);

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
  const animReport = await injectSlideTransitions(pptxPath, "fade");

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
