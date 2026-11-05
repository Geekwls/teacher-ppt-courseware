#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 课件确定性渲染器入口 (render_deck.js) - 基于 PptxGenJS
 *
 * courseware.json → 16:9 可编辑 .pptx
 * - 练习页默认自动追加"参考答案"页；
 * - 教师讲稿自动写入每页 PPT 备注栏；
 * - 非 verified 状态自动在页脚附上教材核验提示；
 * - 原生支持微课音视频 media 图元与高质感阴影卡片。
 *
 * 用法: node render_deck.js --input courseware.json --outdir output/
 */

import fs from "fs";
import path from "path";
import pptxgen from "pptxgenjs";
import { THEMES, resolveTheme, footerOf, drawPageFrame } from "../lib_js/theme.js";
import { LAYOUTS, renderAnswerPage } from "../lib_js/layouts.js";
import { injectSlideTransitions } from "../lib_js/deck_transition.js";
import { auditDeck } from "../lib_js/layout_audit.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let inputPath = "";
  let outdir = "output";
  let strict = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === "--outdir" && args[i + 1]) {
      outdir = args[i + 1];
      i++;
    } else if (args[i] === "--strict") {
      strict = true;
    }
  }

  if (!inputPath) {
    console.error("用法: node render_deck.js --input <courseware.json> [--outdir <output_dir>] [--strict]");
    process.exit(1);
  }

  return { inputPath, outdir, strict };
}

function sanitizeFilename(name, fallback = "课件") {
  const clean = String(name || "").replace(/[\\/:*?"<>|\r\n]+/g, "").trim();
  return (clean || fallback).slice(0, 80);
}

async function main() {
  const { inputPath, outdir, strict } = parseArgs();

  if (!fs.existsSync(inputPath)) {
    console.error(`[render_deck] 错误: 文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf-8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`[render_deck] 错误: JSON 解析失败: ${err.message}`);
    process.exit(1);
  }

  const meta = data.metadata || {};
  const themeName = meta.subject || "math";
  const evidence = data.curriculum_evidence || {};
  const status = evidence.curriculum_status || "missing";

  let footer = footerOf(meta);
  if (status !== "verified") {
    footer += "  |  内容依据人教版教材整理，使用前请核对";
  }

  // 初始化 PptxGenJS (16:9 现代宽屏 13.333 x 7.5 英寸)
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = meta.teacher_name || "教师助手";
  pptx.title = meta.title || "课件";

  // 解析 学科 x 学段 动态主题与字号体系
  const t = resolveTheme(themeName, meta.grade || 3, meta.style || "standard");
  let pageNo = 0;
  let totalRendered = 0;
  const slideLabels = [];
  const answerExpectations = [];

  for (const s of (data.slides || [])) {
    const stype = s.type;
    const renderFn = LAYOUTS[stype];
    if (!renderFn) {
      console.warn(`[render_deck] 跳过未知幻灯片类型: ${stype}`);
      continue;
    }

    const slide = pptx.addSlide();
    slideLabels.push(`${stype} · ${s.title || meta.title || ""}`.slice(0, 64));
    totalRendered++;

    // 封面与结束页不计入页码，其余页计入
    const isFramePage = stype !== "cover" && stype !== "end";
    if (isFramePage) {
      pageNo++;
      drawPageFrame(slide, pptx, t, s.title, footer, pageNo);
    }

    // 渲染页面特定内容
    const ctx = { t, meta, theme: themeName, pageNo, footer };
    renderFn(slide, pptx, s, ctx);

    // 教师讲稿自动写入 PPT 备注栏
    if (s.notes) {
      slide.addNotes(String(s.notes));
    }

    // 课堂练习页自动追加"参考答案"页 (多题延时模式下; 单题即时模式当堂点击揭晓、不追加冗余页)
    const isInstant = s.interaction_mode === "instant" || (Array.isArray(s.items) && s.items.length === 1);
    if (stype === "practice" && !s.show_answers && !isInstant) {
      const ansSlide = pptx.addSlide();
      const ansTitle = `${s.title || "课堂练习"} · 参考答案`;
      slideLabels.push(ansTitle.slice(0, 64));
      answerExpectations.push({ index: pptx._slides.length - 1, expected: (s.items || []).length });
      totalRendered++;
      pageNo++;
      drawPageFrame(ansSlide, pptx, t, ansTitle, footer, pageNo);
      renderAnswerPage(ansSlide, pptx, s, ctx);
      ansSlide.addNotes("【参考答案页】供教师在学生完成随堂练习后核对并讲解使用。");
    }
  }

  // 确保输出目录存在
  if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
  }

  const baseTitle = sanitizeFilename(meta.title, meta.lesson_name || "课件");
  const pptxFilename = `${baseTitle}.pptx`;
  const pptxOutPath = path.join(outdir, pptxFilename);

  // 渲染结果几何审计: 写盘前读取已排布形状, 拦截越界/裁切/压盖/答案缺题
  const audit = auditDeck(pptx, slideLabels, { answerPages: answerExpectations });

  // 导出 PPTX
  await pptx.writeFile({ fileName: pptxOutPath });

  // 注入全屏放映平滑转场动效 (Fade)
  injectSlideTransitions(pptxOutPath, "fade");

  // 同步复制 JSON 副本到输出目录
  const jsonOutPath = path.join(outdir, `${baseTitle}.json`);
  fs.writeFileSync(jsonOutPath, JSON.stringify(data, null, 2), "utf-8");

  const auditOutPath = path.join(outdir, `${baseTitle}.audit.json`);
  fs.writeFileSync(auditOutPath, JSON.stringify(audit, null, 2), "utf-8");

  console.log(`[render_deck] 渲染完成!`);
  console.log(`  - 课件文件: ${pptxOutPath}`);
  console.log(`  - 契约副本: ${jsonOutPath}`);
  console.log(`  - 几何审计: ${auditOutPath}`);
  console.log(`  - 渲染总页数: ${totalRendered} 页 (含参考答案页)`);
  console.log(`  - 几何体检: ${audit.summary.critical} critical / ${audit.summary.warning} warning`);

  for (const it of audit.issues.slice(0, 10)) {
    console.warn(`    [${it.severity}] P${it.slide} ${it.code}: ${it.message}`);
  }
  if (audit.issues.length > 10) {
    console.warn(`    ... 另有 ${audit.issues.length - 10} 项, 详见审计回执`);
  }

  if (strict && audit.summary.critical > 0) {
    console.error(`[render_deck] --strict: 存在 ${audit.summary.critical} 项严重几何问题, 拒绝交付。`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`[render_deck] 渲染异常:`, err);
  process.exit(1);
});
