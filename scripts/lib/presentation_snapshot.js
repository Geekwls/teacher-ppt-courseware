// -*- coding: utf-8 -*-
/**
 * 表现 AST 快照构建器 (scripts/lib/presentation_snapshot.js)
 *
 * 只保留"结构 + 文案"的稳定视图, 去掉与重构无关的易变字段 (如 schema_version)。
 * update_snapshots.js 与 snapshot 测试共用同一实现, 避免两边口径漂移。
 */

import { planPresentationFromLesson } from "../../plugin/skills/lesson-courseware/lib_js/presentation/lesson_to_presentation.js";

export function buildSnapshot(lessonPlan, options = {}) {
  const presentation = planPresentationFromLesson(lessonPlan, options);
  const snapshot = {
    deck_meta: {
      source_lesson_id: presentation.deck_meta.source_lesson_id,
      theme: presentation.deck_meta.theme,
      style: presentation.deck_meta.style,
      preset: presentation.deck_meta.preset,
      layout_variants: presentation.deck_meta.layout_variants,
      skeleton: presentation.deck_meta.skeleton
    },
    slides: presentation.slides.map(slide => ({
      slide_id: slide.slide_id,
      phase_ref: slide.phase_ref,
      layout: slide.layout,
      layout_variant: slide.layout_variant,
      elements: slide.elements.map(elem => ({
        id: elem.id,
        type: elem.type,
        properties: elem.properties
      })),
      timeline: slide.timeline,
      notes: slide.notes
    }))
  };
  // 与落盘 JSON 保持同一视图: 去掉 undefined 字段, 避免"内存对象 vs 快照文件"假差异
  return JSON.parse(JSON.stringify(snapshot));
}
