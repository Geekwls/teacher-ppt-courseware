// -*- coding: utf-8 -*-
/**
 * 内容块版式映射测试 (block_layout_map.test.js)
 *
 * 覆盖: unitKey 推导、映射优先级 (units > subjects > default)、对象映射、
 * 显式 content_block.layout 覆盖与非法版式拦截、planner 端到端接线
 * (显式 composite 单页直装 / 显式标准版式重映射)。
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  unitKeyOf,
  resolveFromMap,
  resolveBlockLayout
} from "../../plugin/skills/lesson-courseware/lib_js/strategies/block_layout_map.js";
import { planPresentationFromLesson } from "../../plugin/skills/lesson-courseware/lib_js/presentation/lesson_to_presentation.js";
import { validatePresentation } from "../../plugin/skills/lesson-courseware/lib_js/presentation/presentation_validator.js";

const META = { subject: "math", grade: 3, term: "term-1", unit: 4 };

test("block_layout_map: unitKey 推导", () => {
  assert.equal(unitKeyOf(META), "math-g3-t1-u04");
  assert.equal(unitKeyOf({ ...META, term: "term-2" }), "math-g3-t2-u04");
  assert.equal(unitKeyOf({ subject: "chinese", grade: 7, term: "term-1", unit: 1 }), "chinese-g7-t1-u01");
});

test("block_layout_map: 默认映射镜像既有版式选择", () => {
  const map = { default: {
    contextual_problem: "context_problem",
    vocabulary_focus: "reading_focus",
    character_writing: "character_practice",
    text_reading: "reading_focus",
    mathematical_reasoning: "model_left_reasoning_right",
    worked_example: "example_step_by_step",
    misconception_analysis: "misconception_split",
    rule_summary: "summary_card",
    activity_instruction: "activity_instruction",
    comparison_table: "comparison_table",
    knowledge_tree: "knowledge_tree",
    board_design: "board_design",
    layered_homework: "homework_card"
  } };
  for (const [blockType, expected] of Object.entries(map.default)) {
    const hit = resolveFromMap(map, { meta: META, cb: { type: blockType } });
    assert.equal(hit.layout, expected, blockType);
    assert.equal(hit.spec, null);
  }
  assert.equal(resolveFromMap(map, { meta: META, cb: { type: "practice_challenge" } }), null);
});

test("block_layout_map: 优先级 units > subjects > default 与对象映射", () => {
  const map = {
    default: { rule_summary: "summary_card" },
    subjects: { math: { rule_summary: "knowledge_tree" } },
    units: { "math-g3-t1-u04": { rule_summary: { layout: "composite", spec: "three_column_points" } } }
  };
  assert.equal(resolveFromMap(map, { meta: META, cb: { type: "rule_summary" } }).layout, "composite");
  assert.equal(resolveFromMap(map, { meta: META, cb: { type: "rule_summary" } }).spec, "three_column_points");
  assert.equal(
    resolveFromMap(map, { meta: { ...META, unit: 5 }, cb: { type: "rule_summary" } }).layout,
    "knowledge_tree",
    "非覆盖单元回落到学科映射"
  );
  assert.equal(
    resolveFromMap(map, { meta: { ...META, subject: "chinese" }, cb: { type: "rule_summary" } }).layout,
    "summary_card",
    "非覆盖学科回落到默认映射"
  );
});

test("block_layout_map: 显式 content_block.layout 优先且校验合法性", () => {
  const explicit = resolveBlockLayout({ meta: META, cb: { type: "rule_summary", layout: "comparison_table" } });
  assert.deepEqual(explicit, { layout: "comparison_table", spec: null, explicit: true, level: "explicit" });
  assert.throws(
    () => resolveBlockLayout({ meta: META, cb: { type: "rule_summary", layout: "no_such_layout" } }),
    /不是已注册版式/
  );
});

test("block_layout_map: planner 接线 —— 显式 composite 单页直装", () => {
  const lessonPlan = {
    schema_version: "1.0.0",
    lesson_id: "math-g3-t1-u04-l99",
    meta: { ...META, topic: "组合版式接线自检", lesson_type: "concept_learning", source_point_id: "math-g3-t1-u04-p01" },
    objectives: [{ id: "OBJ_01", type: "cognitive", statement: "理解算理", assessment: "能口算 20×3" }],
    teaching_sequence: [
      {
        phase_id: "phase_01_exploration",
        phase_name: "算理探究",
        objective_ref: "OBJ_01",
        content_block: {
          type: "mathematical_reasoning",
          layout: "composite",
          layout_spec: {
            grid: { cols: 2 },
            zones: [
              { id: "model", type: "figure_number_line", properties: { start: "$plan:model_start", end: "$plan:model_end", step: "$plan:model_step", arcs: "$plan:model_arcs" } },
              { id: "steps", type: "card_list", properties: { items: "$plan:reasoning_items" } },
              { id: "rule", type: "conclusion_banner", span: 2, properties: { text: "$plan:conclusion_text" } }
            ],
            timeline: [
              { step: 1, action: "reveal", target: "steps" },
              { step: 2, action: "reveal", target: "rule" }
            ]
          },
          model_start: 0,
          model_end: 60,
          model_step: 20,
          model_arcs: [{ from: 0, to: 20 }],
          reasoning_items: ["① 观察", "② 归纳"],
          conclusion_text: "★ 2个十×3=6个十"
        },
        teacher_guidance: "引导学生观察数轴跳跃，归纳计数单位算理。"
      }
    ]
  };

  const presentation = planPresentationFromLesson(lessonPlan, {});
  const compositeSlide = presentation.slides.find(s => s.layout === "composite");
  assert.ok(compositeSlide, "应产出 composite 页");
  assert.equal(compositeSlide.elements[0].id, "txt_composite_title");
  const model = compositeSlide.elements.find(e => e.id === "model");
  assert.deepEqual(model.properties.marks, [0, 20]);

  const res = validatePresentation(presentation);
  assert.equal(res.status, "pass", JSON.stringify(res.errors));
});

test("block_layout_map: planner 接线 —— 显式标准版式重映射且跳过拆页", () => {
  const lessonPlan = {
    schema_version: "1.0.0",
    lesson_id: "math-g3-t1-u04-l98",
    meta: { ...META, topic: "重映射自检", lesson_type: "concept_learning", source_point_id: "math-g3-t1-u04-p01" },
    objectives: [{ id: "OBJ_01", type: "cognitive", statement: "辨析易错", assessment: "能改正典型错误" }],
    teaching_sequence: [
      {
        phase_id: "phase_01_misconception",
        phase_name: "易错辨析",
        objective_ref: "OBJ_01",
        content_block: {
          type: "misconception_analysis",
          layout: "comparison_table",
          wrong_case: "20×3=60 写成 20×3=600",
          cause_analysis: "末尾添零个数错误",
          correct_method: "2个十×3=6个十=60"
        },
        teacher_guidance: "对比错例与正解，强调计数单位。"
      }
    ]
  };

  const presentation = planPresentationFromLesson(lessonPlan, {});
  const slide = presentation.slides.find(s => s.phase_ref === "phase_01_misconception");
  assert.equal(slide.layout, "comparison_table", "显式版式重映射生效");
  const res = validatePresentation(presentation);
  assert.equal(res.status, "pass", JSON.stringify(res.errors));
});
