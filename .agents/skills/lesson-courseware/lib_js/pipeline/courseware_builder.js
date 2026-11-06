// -*- coding: utf-8 -*-
/**
 * 一键课件构建用例 (pipeline/courseware_builder.js)
 *
 * 这是 pipeline 层的唯一入口: 教学门禁 -> 表现规划 -> 表现门禁 -> 确定性渲染。
 * CLI、批处理、验收脚本、未来的 Web API 都调用这里, 不再各自拼流程或解析子进程输出。
 *
 * 错误通过 CoursewareBuildError 抛出 (含 stage / issues / auditPath), 由调用方决定
 * 如何展示与退出; 本模块不调用 process.exit, 便于嵌入与单测。
 */

import { validateLessonPlan } from "../lesson/lesson_validator.js";
import { planPresentationFromLesson } from "../presentation/lesson_to_presentation.js";
import { validatePresentation } from "../presentation/presentation_validator.js";
import { renderPresentation } from "../rendering/presentation_renderer.js";
import { strictHardFailure } from "../animation_prep.js";
import { STYLE_PACK_IDS } from "../theme.js";

const STYLE_ALIASES = { standard: "clean", innovative: "warm" };

export class CoursewareBuildError extends Error {
  constructor(stage, message, { issues = null, auditPath = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "CoursewareBuildError";
    this.stage = stage;
    this.issues = issues;
    this.auditPath = auditPath;
  }
}

export function resolveStyle(styleInput, lessonPlan) {
  const raw = String(styleInput || lessonPlan?.meta?.style || "clean").trim().toLowerCase();
  const resolved = STYLE_ALIASES[raw] || raw;
  if (!STYLE_PACK_IDS.includes(resolved)) {
    throw new CoursewareBuildError(
      "style",
      `未知风格: ${raw}。可选: ${STYLE_PACK_IDS.join(" / ")}`
    );
  }
  return resolved;
}

function logSkeleton(logger, presentation) {
  const sk = presentation.deck_meta?.skeleton;
  if (!sk) return;

  logger.log(`      ℹ 课型骨架: ${sk.lesson_type_name} · ${sk.intent || ""}`);
  if (sk.filled.length) {
    logger.log(`      ⚠ 缺失必备环节: ${sk.filled.join("、")} —— 已各生成 1 页"待补充"占位页, 补全教学设计后可自动替换`);
  } else if (sk.fragmented && sk.missing.length) {
    logger.log(`      ℹ 片段式设计: 缺 ${sk.missing.join("、")}, 判定为局部片段课件, 未自动补齐 (需完整课时请补全环节)`);
  }
  if (sk.out_of_order.length) {
    logger.log(`      ⚠ 环节顺序与骨架不一致: ${sk.out_of_order.join("、")} (仅提示, 不重排老师已定的教学顺序)`);
  }
  if (sk.off_skeleton_roles.length) {
    logger.log(`      ℹ 骨架外环节(保留): ${sk.off_skeleton_roles.join("、")}`);
  }
  if (sk.complete && !sk.filled.length) {
    logger.log("      ✓ 课型骨架完备: 必备环节齐备, 顺序与教学法一致");
  }
}

export async function runCoursewareBuild({
  lessonPlan,
  outdir = "output",
  outputBaseName = "",
  strict = true,
  style = "",
  preset = "",
  skeletonFill = true,
  logger = console
} = {}) {
  if (!lessonPlan || typeof lessonPlan !== "object") {
    throw new CoursewareBuildError("input", "无效的 LessonPlan 对象");
  }

  const title = lessonPlan.meta?.topic || lessonPlan.meta?.title || lessonPlan.lesson_id || "课件";
  const subject = lessonPlan.meta?.subject || "通用";
  const grade = lessonPlan.meta?.grade || "?";
  const resolvedStyle = resolveStyle(style, lessonPlan);

  // 1. 教学门禁 (LessonPlan AST)
  logger.log("[2/4] 执行教学逻辑与知识点门禁校验 (LessonPlan Validator)...");
  const planVal = validateLessonPlan(lessonPlan);
  if (planVal.status !== "pass" || (planVal.errors && planVal.errors.length > 0)) {
    throw new CoursewareBuildError(
      "lesson_validation",
      "教学设计门禁未通过",
      { issues: planVal.errors || [] }
    );
  }
  logger.log("      ✓ 教学设计门禁 100% 通过 (0 Error / 0 Warning)");

  // 2. 表现规划 (Presentation AST)
  logger.log("[3/4] 结合学段认知容量与学科策略，自动规划幻灯片表现 (PagePlanner)...");
  let presentation;
  try {
    presentation = planPresentationFromLesson(lessonPlan, {
      style: resolvedStyle,
      preset,
      skeleton_fill: skeletonFill
    });
  } catch (err) {
    throw new CoursewareBuildError("planning", `表现规划失败: ${err.message}`, { cause: err });
  }
  logger.log(`      ✓ 幻灯片编排成功: 共规划 ${presentation.slides?.length || 0} 页 (风格: ${resolvedStyle})`);
  logSkeleton(logger, presentation);

  // 3. 表现门禁 (Presentation Validator)
  const presVal = validatePresentation(presentation);
  if (presVal.status !== "pass" || (presVal.errors && presVal.errors.length > 0)) {
    throw new CoursewareBuildError(
      "presentation_validation",
      "课件表现门禁未通过",
      { issues: presVal.errors || [] }
    );
  }
  logger.log("      ✓ 课件表现门禁 100% 通过 (0 Error / 0 Warning)");

  // 4. 确定性渲染
  logger.log("[4/4] 驱动 PptxGenJS 确定性渲染引擎，注入原生 OpenXML 单击分步动画...");
  const baseName = outputBaseName || `${title}_课件`;
  let renderRes;
  try {
    renderRes = await renderPresentation(presentation, {
      outdir,
      outputBaseName: baseName,
      strict,
      style: resolvedStyle
    });
  } catch (err) {
    throw new CoursewareBuildError("rendering", `渲染交付失败: ${err.message}`, { cause: err });
  }

  // 算理动画数学门禁: strict 模式下参数/算理错误一票否决, 拒绝交付
  const hardFail = strictHardFailure(renderRes.animPrepReport);
  if (strict && hardFail) {
    throw new CoursewareBuildError(
      "animation_gate",
      `P${hardFail.slide} 算理动画参数未过数学门禁 (${hardFail.error}), 拒绝交付。`
    );
  }

  // 严格几何门禁: --strict 下存在 Critical 硬伤即拒绝交付
  const audit = renderRes.auditResult;
  if (strict && (audit.summary?.critical || 0) > 0) {
    throw new CoursewareBuildError(
      "geometry_gate",
      `几何体检发现 ${audit.summary.critical} 个 Critical 硬伤, 拒绝交付。`,
      { auditPath: renderRes.auditPath }
    );
  }

  return {
    title,
    subject,
    grade,
    style: resolvedStyle,
    presentation,
    baseName,
    ...renderRes
  };
}
