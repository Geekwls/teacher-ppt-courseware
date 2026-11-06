// -*- coding: utf-8 -*-
/**
 * 策略偏好包测试 (policy_packs.test.js)
 *
 * 覆盖: 白名单校验 fail-closed (未知键/类型错误)、合并优先级
 * (lessons > units, layout_variants 按页型深合并)、空包等价历史行为、
 * planner 端到端: 单元包风格在无显式偏好时生效。
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  validatePolicyPackEntry,
  mergePolicyPacks,
  resolvePolicyPack
} from "../../plugin/skills/lesson-courseware/lib_js/strategies/policy_packs.js";
import { planPresentationFromLesson } from "../../plugin/skills/lesson-courseware/lib_js/presentation/lesson_to_presentation.js";

test("policy_packs: 白名单校验 fail-closed", () => {
  assert.throws(() => validatePolicyPackEntry({ theme: "x" }, "units.math-g3-t1-u04"), /未知偏好键/);
  assert.throws(() => validatePolicyPackEntry({ style: 123 }, "units.x"), /非空字符串/);
  assert.throws(() => validatePolicyPackEntry({ layout_variants: "grid" }, "units.x"), /必须是对象/);
  assert.throws(() => validatePolicyPackEntry({ skeleton_fill: "yes" }, "units.x"), /必须是布尔值/);
  assert.throws(() => validatePolicyPackEntry("nope", "units.x"), /必须是对象/);

  const ok = validatePolicyPackEntry({
    style: "warm",
    preset: "open_class",
    layout_variant: "grid",
    layout_variants: { objectives_card: "grid" },
    skeleton_fill: false
  }, "units.x");
  assert.deepEqual(ok, {
    style: "warm",
    preset: "open_class",
    layout_variant: "grid",
    layout_variants: { objectives_card: "grid" },
    skeleton_fill: false
  });
});

test("policy_packs: 合并优先级 lessons > units, layout_variants 深合并", () => {
  const merged = mergePolicyPacks(
    { style: "warm", layout_variants: { objectives_card: "grid" } },
    { style: "chalk", layout_variants: { practice_list: "two_column" } }
  );
  assert.equal(merged.style, "chalk");
  assert.equal(merged.layout_variants.objectives_card, "grid", "单元包的变体不被课时包丢失");
  assert.equal(merged.layout_variants.practice_list, "two_column");
});

test("policy_packs: 当前空包解析结果为空对象 (与历史行为等价)", () => {
  const pack = resolvePolicyPack(
    { subject: "math", grade: 3, term: "term-1", unit: 4 },
    "math-g3-t1-u04-l01"
  );
  assert.deepEqual(pack, {});
});

test("policy_packs: planner 端到端 —— 单元包风格在无显式偏好时生效", () => {
  // 空包下 style 兜底链: userPreferences > pack > meta; 显式 meta.style 仍应生效
  const lessonPlan = {
    schema_version: "1.0.0",
    lesson_id: "math-g3-t1-u04-l97",
    meta: {
      subject: "math", grade: 3, term: "term-1", unit: 4,
      topic: "偏好包自检", lesson_type: "concept_learning",
      source_point_id: "math-g3-t1-u04-p01",
      style: "warm"
    },
    objectives: [{ id: "OBJ_01", type: "cognitive", statement: "理解算理", assessment: "能口算 20×3" }],
    teaching_sequence: [
      {
        phase_id: "phase_01_warmup",
        phase_name: "情境导入",
        objective_ref: "OBJ_01",
        content_block: { type: "contextual_problem", scenario: "碰碰车每人 20 元", question: "3 人多少钱？", core_expression: "20 × 3" },
        teacher_guidance: "引导学生列出乘法算式并说出理由。"
      }
    ]
  };

  const presentation = planPresentationFromLesson(lessonPlan, {});
  assert.equal(presentation.deck_meta.style, "warm", "meta.style 在空包时兜底生效");
  const res = presentation;
  assert.ok(res.slides.some(s => s.layout === "context_problem"));
});
