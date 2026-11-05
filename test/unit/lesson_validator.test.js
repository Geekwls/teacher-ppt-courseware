// -*- coding: utf-8 -*-
/**
 * 教学设计门禁单元测试 (test/unit/lesson_validator.test.js)
 * 基于 Node.js 官方内置测试运行器 (node:test + node:assert)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { validateLessonPlan } from "../../plugin/skills/lesson-courseware/lib_js/lesson/lesson_validator.js";

// 读取真实的三年级口算乘法金样
const GOLDEN_PATH = path.join(process.cwd(), "acceptance", "lesson_plans", "math_g3_t1_u04_lesson_plan.json");
const goldenSample = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf-8"));

function getClone() {
  return JSON.parse(JSON.stringify(goldenSample));
}

test("教学门禁: 标准金样教学设计应 100% 校验通过", () => {
  const plan = getClone();
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "pass", `应通过校验，实际报错: ${JSON.stringify(res.errors)}`);
  assert.equal(res.errors.length, 0);
});

test("教学门禁: 数学算式真值错误应被严格拦截", () => {
  const plan = getClone();
  // 故意在情境算式中算错 (20 * 3 = 80)
  plan.teaching_sequence[0].content_block.equation = "20 * 3 = 80";
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "fail");
  const hasArithmeticError = res.errors.some(e => e.code === "MATH_CALCULATION_ERROR");
  assert.ok(hasArithmeticError, "应精确拦截 MATH_CALCULATION_ERROR 错误");
});

test("教学门禁: 词法断言防误杀 - 包含「百分数」不应被误判为「分数」禁区违规", () => {
  const plan = getClone();
  // 在情境中加入百分数词汇
  plan.teaching_sequence[0].content_block.scenario = "商场举办活动，打折后相当于原价的百分数优惠。";
  const res = validateLessonPlan(plan);
  const scopeViolation = res.errors.filter(e => e.code === "SCOPE_EXCLUDED_VIOLATION");
  assert.equal(scopeViolation.length, 0, "不应将百分数误杀为分数违规");
});

test("教学门禁: 真实教学禁区拦截 - 触碰「除法口算」应被一票否决", () => {
  const plan = getClone();
  // unit-04 p01 禁区明确包含「除法口算」
  plan.teaching_sequence[0].content_block.scenario = "今天我们提前学习除法口算，大家看屏幕。";
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "fail");
  const scopeViolation = res.errors.filter(e => e.code === "SCOPE_EXCLUDED_VIOLATION");
  assert.ok(scopeViolation.length > 0, "应精准拦截触碰教材禁区除法口算");
});

test("教学门禁: 数域上限扫描 - 题目叙述中超出数域的数字应被拦截", () => {
  const plan = getClone();
  // unit-04 数域上限为 10000，这里放入超出数域的叙述性数字 25000
  plan.teaching_sequence[0].content_block.scenario = "仓库里采购了 25000 瓶饮用水，需要分批发放。";
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "fail");
  const boundExceeded = res.errors.filter(e => e.code === "NUMERIC_UPPER_BOUND_EXCEEDED");
  assert.ok(boundExceeded.length > 0, "应精准捕获超出数域上限的数字 25000");
});
