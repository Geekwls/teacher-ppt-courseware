#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 一键端到端智能课件生成流水线 CLI (build_courseware.js)
 *
 * 核心流程 (全自动串联):
 * 1. 消费 LessonPlan AST (纯教学逻辑)
 * 2. 教学门禁校验 (validateLessonPlan) -> 杜绝超纲与结构缺陷
 * 3. 表现智能规划 (planPresentationFromLesson) -> 结合学段认知与学科规则自动拆页
 * 4. 表现门禁校验 (validatePresentation) -> 契约合法性双重验证
 * 5. 确定性渲染与原生动画 (renderPresentation) -> 生成 .pptx 并注入 OpenXML 动效
 * 6. 严格几何审计 (layout_audit) -> 0 Critical 交付保障
 *
 * 用法:
 *   node build_courseware.js --input <lesson-plan.json> [--outdir <dir>] [--name <basename>]
 *                            [--style clean|warm|academic|minimal|chalk] [--no-skeleton-fill] [--no-strict]
 */

import fs from "fs";
import path from "path";
import { validateLessonPlan } from "../lib_js/lesson/lesson_validator.js";
import { planPresentationFromLesson } from "../lib_js/presentation/lesson_to_presentation.js";
import { validatePresentation } from "../lib_js/presentation/presentation_validator.js";
import { renderPresentation } from "../lib_js/rendering/presentation_renderer.js";
import { strictHardFailure } from "../lib_js/animation_prep.js";
import { STYLE_PACK_IDS } from "../lib_js/theme.js";
import { SCENE_PRESET_IDS } from "../lib_js/strategies/scene_presets.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let inputPath = "";
  let outdir = "output";
  let outputBaseName = "";
  let strict = true;
  let style = "";
  let preset = "";
  let skeletonFill = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === "--outdir" && args[i + 1]) {
      outdir = args[i + 1];
      i++;
    } else if ((args[i] === "--name" || args[i] === "--basename") && args[i + 1]) {
      outputBaseName = args[i + 1];
      i++;
    } else if (args[i] === "--style" && args[i + 1]) {
      style = args[i + 1];
      i++;
    } else if (args[i] === "--preset" && args[i + 1]) {
      preset = args[i + 1];
      i++;
    } else if (args[i] === "--no-skeleton-fill") {
      skeletonFill = false;
    } else if (args[i] === "--no-strict") {
      strict = false;
    } else if (args[i] === "--strict") {
      strict = true;
    }
  }

  if (!inputPath) {
    console.error("用法: node build_courseware.js --input <lesson-plan.json> [--outdir <dir>] [--name <basename>] [--style clean|warm|academic|minimal|chalk] [--preset standard|open_class|review|parent_meeting|new_teacher] [--no-skeleton-fill] [--no-strict]");
    process.exit(1);
  }

  return { inputPath, outdir, outputBaseName, strict, style, preset, skeletonFill };
}

async function main() {
  const { inputPath, outdir, outputBaseName, strict, style, preset, skeletonFill } = parseArgs();

  if (!fs.existsSync(inputPath)) {
    console.error(`[build_courseware] 错误: 文件不存在: ${inputPath}`);
    process.exit(1);
  }

  let lessonPlan;
  try {
    lessonPlan = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  } catch (err) {
    console.error(`[build_courseware] 错误: 无法解析 JSON 文件: ${err.message}`);
    process.exit(1);
  }

  const title = lessonPlan.meta?.topic || lessonPlan.meta?.title || lessonPlan.lesson_id || "课件";
  const subject = lessonPlan.meta?.subject || "通用";
  const grade = lessonPlan.meta?.grade || "?";

  // 风格包: CLI --style 优先, 其次契约 meta.style, 缺省 clean
  const styleAliases = { standard: "clean", innovative: "warm" };
  const rawStyle = (style || lessonPlan.meta?.style || "clean").trim().toLowerCase();
  const resolvedStyle = styleAliases[rawStyle] || rawStyle;
  if (!STYLE_PACK_IDS.includes(resolvedStyle)) {
    console.error(`❌ 未知风格: ${rawStyle}。可选: ${STYLE_PACK_IDS.join(" / ")}`);
    process.exit(1);
  }

  console.log("================================================================");
  console.log("🚀 启动课件端到端一键生成流水线 (LessonPlan -> Presentation -> PPTX)");
  console.log("================================================================");
  console.log(`[1/4] 读取教学设计: ${inputPath}`);
  console.log(`      课题: 《${title}》 (学科: ${subject}, 学段: ${grade}年级)`);

  // 1. 校验教学设计 (LessonPlan AST)
  console.log("[2/4] 执行教学逻辑与知识点门禁校验 (LessonPlan Validator)...");
  const planVal = validateLessonPlan(lessonPlan);
  if (planVal.status !== "pass" || (planVal.errors && planVal.errors.length > 0)) {
    console.error("❌ 教学设计门禁未通过! 发现以下错误:");
    (planVal.errors || []).forEach((err, idx) => {
      console.error(`   ${idx + 1}. [${err.code}] ${err.message} (路径: ${err.path || "/"})`);
    });
    process.exit(1);
  }
  console.log("      ✓ 教学设计门禁 100% 通过 (0 Error / 0 Warning)");

  // 2. 自动规划为课件表现 (Presentation AST)
  console.log("[3/4] 结合学段认知容量与学科策略，自动规划幻灯片表现 (PagePlanner)...");
  let presentation;
  try {
    presentation = planPresentationFromLesson(lessonPlan, {
      style: resolvedStyle,
      preset,
      skeleton_fill: skeletonFill
    });
    console.log(`      ✓ 幻灯片编排成功: 共规划 ${presentation.slides?.length || 0} 页 (风格: ${resolvedStyle})`);

    // 课型骨架回执: 口径与提示必须打印, 否则老师看不出这一版和上一版结构差在哪
    const sk = presentation.deck_meta?.skeleton;
    if (sk) {
      console.log(`      ℹ 课型骨架: ${sk.lesson_type_name} · ${sk.intent || ""}`);
      if (sk.filled.length) {
        console.log(`      ⚠ 缺失必备环节: ${sk.filled.join("、")} —— 已各生成 1 页"待补充"占位页, 补全教学设计后可自动替换`);
      } else if (sk.fragmented && sk.missing.length) {
        console.log(`      ℹ 片段式设计: 缺 ${sk.missing.join("、")}, 判定为局部片段课件, 未自动补齐 (需完整课时请补全环节)`);
      }
      if (sk.out_of_order.length) {
        console.log(`      ⚠ 环节顺序与骨架不一致: ${sk.out_of_order.join("、")} (仅提示, 不重排老师已定的教学顺序)`);
      }
      if (sk.off_skeleton_roles.length) {
        console.log(`      ℹ 骨架外环节(保留): ${sk.off_skeleton_roles.join("、")}`);
      }
      if (sk.complete && !sk.filled.length) {
        console.log("      ✓ 课型骨架完备: 必备环节齐备, 顺序与教学法一致");
      }
    }
  } catch (err) {
    console.error(`❌ 表现规划失败: ${err.message}`);
    process.exit(1);
  }

  // 3. 校验表现语法树 (Presentation Validator)
  const presVal = validatePresentation(presentation);
  if (presVal.status !== "pass" || (presVal.errors && presVal.errors.length > 0)) {
    console.error("❌ 课件表现门禁未通过! 发现以下错误:");
    (presVal.errors || []).forEach((err, idx) => {
      console.error(`   ${idx + 1}. [${err.code}] ${err.message} (路径: ${err.path || "/"})`);
    });
    process.exit(1);
  }
  console.log("      ✓ 课件表现门禁 100% 通过 (0 Error / 0 Warning)");

  // 4. 纯确定性渲染与原生动效注入
  console.log("[4/4] 驱动 PptxGenJS 确定性渲染引擎，注入原生 OpenXML 单击分步动画...");
  const baseName = outputBaseName || `${title}_新架构`;
  try {
    const renderRes = await renderPresentation(presentation, {
      outdir,
      outputBaseName: baseName,
      strict,
      style: resolvedStyle
    });

    // 算理动画数学门禁: strict 模式下参数/算理错误一票否决, 拒绝交付
    const hardFail = strictHardFailure(renderRes.animPrepReport);
    if (strict && hardFail) {
      console.error(`❌ --strict: P${hardFail.slide} 算理动画参数未过数学门禁 (${hardFail.error}), 拒绝交付。`);
      process.exit(1);
    }

    const audit = renderRes.auditResult;
    const anim = renderRes.animReport;
    const animPrep = renderRes.animPrepReport;

    // 严格几何门禁: --strict 下存在 Critical 硬伤即拒绝交付
    if (strict && (audit.summary?.critical || 0) > 0) {
      console.error(`❌ --strict: 几何体检发现 ${audit.summary.critical} 个 Critical 硬伤, 拒绝交付。`);
      console.error(`   详见审计回执: ${renderRes.auditPath}`);
      process.exit(1);
    }

    console.log("================================================================");
    console.log("🎉 智能课件生成并严格交付成功!");
    console.log("================================================================");
    console.log(`  📁 演示课件 (PPTX):   ${renderRes.pptxPath}`);
    console.log(`  📄 表现契约 (JSON):   ${renderRes.jsonPath}`);
    console.log(`  🔍 几何体检 (Audit):  ${renderRes.auditPath}`);
    console.log("----------------------------------------------------------------");
    console.log(`  📊 幻灯片总数:        ${presentation.slides?.length || 0} 页`);
    console.log(`  🎬 原生动效分步:      ${anim.withTiming} 页含分步 / 共 ${anim.stepsTotal} 步交互 / 顺序合规: ${anim.orderValid ? "是" : "否"}`);
    if (animPrep.total > 0) {
      console.log(`  🎞️ 算理动画:          共 ${animPrep.total} 个 -> 合成 ${animPrep.generated} / 缓存 ${animPrep.cached} / 复用 ${animPrep.reusedExisting} / 降级 ${animPrep.fallback}${animPrep.mathErrors ? ` / 数学门禁拒绝 ${animPrep.mathErrors}` : ""}`);
    }
    console.log(`  🛡️ 严格几何体检:      ${audit.summary.critical} Critical / ${audit.summary.warning} Warning`);
    console.log("================================================================");

    process.exit(0);
  } catch (err) {
    console.error(`❌ 渲染交付失败: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("未捕获的严重异常:", err);
  process.exit(1);
});
