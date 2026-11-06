// -*- coding: utf-8 -*-
/** 阅读品读页渲染器: 原文卡 (含朗读符号) + 设问卡 + 核心句横幅。 */

import { CANVAS_W, CONTENT_TOP } from "../../domain/canvas.js";
import { fitTextLayout, fitFontSize } from "../../text_fit.js";

/**
 * 朗读符号标注 → 富文本 runs
 *
 * 语文课的朗读指导必须"看得见": 停顿与重音要直接标在原文上, 学生才知道怎么读。
 * 数据结构 (content_block.reading_guide):
 *   annotated: "这时候，|窗外十分安静，|树枝不摇了，"   ← | 为停顿分隔符
 *   stress:    ["窗外十分安静", "不摇了"]                 ← 需重读的片段
 * 输出: 停顿渲染为琥珀色 "／", 重音渲染为加粗红色, 其余为主题正文色。
 *
 * 重音匹配按"最长优先"贪心切分, 避免 "安静" 抢先吃掉 "十分安静" 的首字;
 * 只在单个停顿段内匹配, 跨段的标注属于作者错误, 不做模糊兜底。
 */
function buildReadingRuns(bodyText, guide, fontSize, t) {
  const annotated = String(guide?.annotated || bodyText || "");
  if (!annotated) return [];

  const stressList = (Array.isArray(guide?.stress) ? guide.stress : [])
    .map(s => String(s || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const runs = [];
  const pushText = (text, isStress) => {
    if (!text) return;
    runs.push({
      text,
      options: isStress
        ? { fontSize, bold: true, color: "B91C1C" }
        : { fontSize, color: t.ink }
    });
  };

  const segments = annotated.split("|");
  segments.forEach((seg, segIdx) => {
    if (stressList.length === 0) {
      pushText(seg, false);
    } else {
      let rest = seg;
      while (rest.length) {
        let hit = null;
        for (const s of stressList) {
          const i = rest.indexOf(s);
          if (i >= 0 && (hit === null || i < hit.i)) hit = { i, s };
        }
        if (!hit) { pushText(rest, false); break; }
        if (hit.i > 0) pushText(rest.slice(0, hit.i), false);
        pushText(hit.s, true);
        rest = rest.slice(hit.i + hit.s.length);
      }
    }
    // 停顿符: 最后一个段落之后不再补, 避免句末多出一个孤立的 "／"
    if (segIdx < segments.length - 1) {
      runs.push({ text: "／", options: { fontSize, bold: true, color: "D97706" } });
    }
  });

  return runs;
}

export function render(slide, s, ctx) {
  const { pptx, t, themeName, grade, cardShadow: CARD_SHADOW, fontFamily: FONT_FAMILY } = ctx;
  const textCard = s.elements.find(e => e.id === "card_reading_text");
  const questionsCard = s.elements.find(e => e.id === "card_questions");
  const bannerElem = s.elements.find(e => e.type === "conclusion_banner");
  const cardW = CANVAS_W - 1.6;
  const qs = questionsCard?.properties?.items || [];
  const hasQs = qs.length > 0;
  const hasBanner = !!bannerElem;
  const bodyText = textCard?.properties?.body || "";
  const bodyLines = bodyText.split("\n").filter(Boolean).length;
  // 朗读标注会让正文变长 (每个停顿多一个 "／"), 字号估算须按标注后的实际字数
  const readingGuide = textCard?.properties?.reading_guide || null;
  const measureText = readingGuide?.annotated
    ? String(readingGuide.annotated).replace(/\|/g, "／")
    : bodyText;

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
    shadow: { ...CARD_SHADOW }
  });

  // 字号动态自适应：拆页后原文页享有 20~22pt 护眼大字
  let textFontSize;
  if (!hasQs) {
    textFontSize = (measureText.length > 120 || bodyLines > 4) ? 20 : 22;
  } else if (isIntroPrompt) {
    textFontSize = 18;
  } else {
    textFontSize = (bodyLines > 3 || measureText.length > 50) ? (grade >= 7 ? 15 : 18) : (themeName === "english" ? 16 : 20);
  }
  // 按真实字宽与卡片高度兜底收敛, 防止长文溢出与末行孤字
  textFontSize = Math.min(
    textFontSize,
    fitFontSize(measureText, cardW - 0.6, Math.max(0.4, textCardH - 0.95), textFontSize, 14)
  );

  const bodyRuns = readingGuide
    ? buildReadingRuns(bodyText, readingGuide, textFontSize, t)
    : [{ text: bodyText, options: { fontSize: textFontSize, color: t.ink } }];
  slide.addText([
    { text: `${textCard?.properties?.title || "【精读赏析】"}\n\n`, options: { fontSize: textFontSize, bold: true, color: t.primaryDark } },
    ...bodyRuns
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
        shadow: { ...CARD_SHADOW }
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
      shadow: { ...CARD_SHADOW }
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
}
