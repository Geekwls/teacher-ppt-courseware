#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 一键端到端智能课件生成流水线 CLI (build_courseware.js)
 *
 * 本文件只做参数适配与结果展示; 流程实现见
 * lib_js/pipeline/courseware_builder.js 的 runCoursewareBuild()。
 *
 * 用法:
 *   node build_courseware.js --input <lesson-plan.json> [--outdir <dir>] [--name <basename>]
 *                            [--style clean|warm|chalk] [--preset ...]
 *                            [--no-skeleton-fill] [--no-strict] [--json] [--help]
 */

import fs from "fs";
import { runCoursewareBuild, resolveStyle, CoursewareBuildError } from "../lib_js/pipeline/courseware_builder.js";

const USAGE = "用法: node build_courseware.js --input <lesson-plan.json> [--outdir <dir>] [--name <basename>] [--style clean|warm|chalk] [--preset standard|open_class|review|parent_meeting|new_teacher] [--no-skeleton-fill] [--no-strict] [--json]";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    inputPath: "",
    outdir: "output",
    outputBaseName: "",
    strict: true,
    style: "",
    preset: "",
    skeletonFill: true,
    json: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && args[i + 1]) {
      opts.inputPath = args[++i];
    } else if (arg === "--outdir" && args[i + 1]) {
      opts.outdir = args[++i];
    } else if ((arg === "--name" || arg === "--basename") && args[i + 1]) {
      opts.outputBaseName = args[++i];
    } else if (arg === "--style" && args[i + 1]) {
      opts.style = args[++i];
    } else if (arg === "--preset" && args[i + 1]) {
      opts.preset = args[++i];
    } else if (arg === "--no-skeleton-fill") {
      opts.skeletonFill = false;
    } else if (arg === "--no-strict") {
      opts.strict = false;
    } else if (arg === "--strict") {
      opts.strict = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    }
  }
  return opts;
}

function printIssues(err) {
  (err.issues || []).forEach((item, idx) => {
    const pathRef = item.path || item.slide_id || item.phase_id || "/";
    console.error(`   ${idx + 1}. [${item.code}] ${item.message} (路径: ${pathRef})`);
  });
}

function printFailure(err) {
  switch (err.stage) {
    case "lesson_validation":
      console.error("❌ 教学设计门禁未通过! 发现以下错误:");
      printIssues(err);
      break;
    case "presentation_validation":
      console.error("❌ 课件表现门禁未通过! 发现以下错误:");
      printIssues(err);
      break;
    case "animation_gate":
      console.error(`❌ --strict: ${err.message}`);
      break;
    case "geometry_gate":
      console.error(`❌ --strict: ${err.message}`);
      if (err.auditPath) console.error(`   详见审计回执: ${err.auditPath}`);
      break;
    case "planning":
    case "rendering":
      console.error(`❌ ${err.message}`);
      break;
    default:
      console.error(`❌ ${err.message}`);
  }
}

function printSuccess(result) {
  const presentation = result.presentation;
  const audit = result.auditResult;
  const anim = result.animReport;
  const animPrep = result.animPrepReport;

  console.log("================================================================");
  console.log("🎉 智能课件生成并严格交付成功!");
  console.log("================================================================");
  console.log(`  📁 演示课件 (PPTX):   ${result.pptxPath}`);
  console.log(`  📄 表现契约 (JSON):   ${result.jsonPath}`);
  console.log(`  🔍 几何体检 (Audit):  ${result.auditPath}`);
  console.log("----------------------------------------------------------------");
  console.log(`  📊 幻灯片总数:        ${presentation.slides?.length || 0} 页`);
  console.log(`  🎬 原生动效分步:      ${anim.withTiming} 页含分步 / 共 ${anim.stepsTotal} 步交互 / 顺序合规: ${anim.orderValid ? "是" : "否"}`);
  if (animPrep.total > 0) {
    console.log(`  🎞️ 算理动画:          共 ${animPrep.total} 个 -> 合成 ${animPrep.generated} / 缓存 ${animPrep.cached} / 复用 ${animPrep.reusedExisting} / 降级 ${animPrep.fallback}${animPrep.mathErrors ? ` / 数学门禁拒绝 ${animPrep.mathErrors}` : ""}`);
  }
  console.log(`  🛡️ 严格几何体检:      ${audit.summary.critical} Critical / ${audit.summary.warning} Warning`);
  console.log("================================================================");
}

function toJson(result) {
  const audit = result.auditResult;
  const anim = result.animReport;
  const animPrep = result.animPrepReport;
  return {
    status: "pass",
    title: result.title,
    subject: result.subject,
    grade: result.grade,
    style: result.style,
    slides: result.presentation.slides?.length || 0,
    pptx: result.pptxPath,
    presentation: result.jsonPath,
    audit: result.auditPath,
    geometry: {
      critical: audit.summary.critical,
      warning: audit.summary.warning
    },
    reveal: {
      withTiming: anim.withTiming,
      stepsTotal: anim.stepsTotal,
      orderValid: anim.orderValid
    },
    animation: animPrep.total > 0
      ? {
          total: animPrep.total,
          generated: animPrep.generated,
          cached: animPrep.cached,
          reusedExisting: animPrep.reusedExisting,
          fallback: animPrep.fallback,
          mathErrors: animPrep.mathErrors
        }
      : null,
    skeleton: result.presentation.deck_meta?.skeleton || null
  };
}

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (!opts.inputPath) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!fs.existsSync(opts.inputPath)) {
    console.error(`[build_courseware] 错误: 文件不存在: ${opts.inputPath}`);
    process.exit(1);
  }

  let lessonPlan;
  try {
    lessonPlan = JSON.parse(fs.readFileSync(opts.inputPath, "utf-8"));
  } catch (err) {
    console.error(`[build_courseware] 错误: 无法解析 JSON 文件: ${err.message}`);
    process.exit(1);
  }

  // 风格在打印横幅前先校验, 保持"未知风格"错误与旧版一致
  let resolvedStyle;
  try {
    resolvedStyle = resolveStyle(opts.style, lessonPlan);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  const title = lessonPlan.meta?.topic || lessonPlan.meta?.title || lessonPlan.lesson_id || "课件";
  const subject = lessonPlan.meta?.subject || "通用";
  const grade = lessonPlan.meta?.grade || "?";

  if (!opts.json) {
    console.log("================================================================");
    console.log("🚀 启动课件端到端一键生成流水线 (LessonPlan -> Presentation -> PPTX)");
    console.log("================================================================");
    console.log(`[1/4] 读取教学设计: ${opts.inputPath}`);
    console.log(`      课题: 《${title}》 (学科: ${subject}, 学段: ${grade}年级)`);
  }

  const logger = opts.json ? { log() {} } : console;

  try {
    const result = await runCoursewareBuild({
      lessonPlan,
      outdir: opts.outdir,
      outputBaseName: opts.outputBaseName,
      strict: opts.strict,
      style: resolvedStyle,
      preset: opts.preset,
      skeletonFill: opts.skeletonFill,
      logger
    });
    if (opts.json) {
      console.log(JSON.stringify(toJson(result), null, 2));
    } else {
      printSuccess(result);
    }
    process.exit(0);
  } catch (err) {
    if (err instanceof CoursewareBuildError) {
      if (opts.json) {
        console.error(JSON.stringify({
          status: "fail",
          stage: err.stage,
          message: err.message,
          issues: err.issues,
          audit_path: err.auditPath
        }, null, 2));
      } else {
        printFailure(err);
      }
      process.exit(1);
    }
    if (opts.json) {
      console.error(JSON.stringify({ status: "fail", stage: "unexpected", message: err.message }, null, 2));
    } else {
      console.error("❌ 渲染交付失败:", err.message);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error("未捕获的严重异常:", err);
  process.exit(1);
});
