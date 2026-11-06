// -*- coding: utf-8 -*-
/**
 * 课件表现编排引擎 (lesson_to_presentation.js)
 *
 * 核心架构:
 * 1. 调用 PagePlanner 获得经由多维策略仲裁后的 SlidePlan 大纲;
 * 2. 由 Layout Registry 逐页装配 elements 与显式 timeline (版式知识不在此层);
 * 3. 严格输出符合 presentation.schema.json (v1.0.0) 的标准 AST。
 */

import { planSlidesFromLesson } from "./page_planner.js";
import { assembleSlide } from "./layout_registry.js";

export function planPresentationFromLesson(lessonPlan, options = {}) {
  const { strategyContext, scenePreset, slidePlans, skeletonReport } = planSlidesFromLesson(lessonPlan, options);

  const slides = slidePlans.map(plan => {
    const { elements, timeline } = assembleSlide(plan);

    const slideObj = {
      slide_id: plan.slide_id,
      phase_ref: plan.phase_ref,
      layout: plan.layout,
      elements,
      timeline,
      notes: plan.notes || "请同学们认真学习。"
    };
    if (plan.layout_variant) {
      slideObj.layout_variant = plan.layout_variant;
    }
    return slideObj;
  });

  return {
    schema_version: "1.0.0",
    deck_meta: {
      source_lesson_id: lessonPlan.lesson_id || "lesson_unknown",
      theme: strategyContext.preferences.theme,
      style: strategyContext.preferences.style,
      preset: scenePreset?.preset_id || "standard",
      layout_variants: scenePreset?.variants || {},
      aspect_ratio: strategyContext.preferences.aspect_ratio,
      // 课型骨架回执: 供 CLI 打印缺口、供后续教案迭代对齐
      skeleton: skeletonReport
        ? {
            lesson_type: skeletonReport.lesson_type,
            lesson_type_name: skeletonReport.lesson_type_name,
            intent: skeletonReport.intent,
            complete: skeletonReport.complete,
            fragmented: skeletonReport.fragmented,
            missing: skeletonReport.missing.map(m => m.label || m.role),
            filled: skeletonReport.filled.map(f => f.label || f.role),
            off_skeleton_roles: skeletonReport.off_skeleton_roles.map(r => r.label || r.role),
            out_of_order: skeletonReport.outOfOrder.map(o => o.phase_id),
            closers: skeletonReport.closers
          }
        : null
    },
    slides
  };
}
