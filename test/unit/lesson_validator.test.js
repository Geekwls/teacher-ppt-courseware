// -*- coding: utf-8 -*-
/**
 * 教学设计门禁单元测试 (test/unit/lesson_validator.test.js)
 * 基于 Node.js 官方内置测试运行器 (node:test + node:assert)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { validateLessonPlan, isScopeExcludedHit } from "../../plugin/skills/lesson-courseware/lib_js/lesson/lesson_validator.js";

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

test("禁区匹配: 词界防误杀「百分数」不命中「分数」, 真禁区仍命中", () => {
  // 直接验证纯函数语义, 不依赖某份金样的禁区清单(否则断言恒真、起不到回归作用)
  assert.equal(isScopeExcludedHit("打折后相当于原价的百分数优惠", "分数"), false, "「百分数」不应命中「分数」");
  assert.equal(isScopeExcludedHit("把单位「1」平均分成若干份, 认识分数", "分数"), true, "真实「分数」表述应命中");
  assert.equal(isScopeExcludedHit("消去法可以简化运算", "除法"), false, "「消去」不应命中「除法」");
  assert.equal(isScopeExcludedHit("photosynthesis in plants", "photo"), false, "英文词界: photo 不应命中 photosynthesis");
});

test("禁区匹配: 带括注与引号的词条归一化后应可命中", () => {
  assert.equal(isScopeExcludedHit("本节还顺带讲解整十数乘整十数", "整十数乘整十数（三年级下册）"), true, "括注不应导致漏检");
  assert.equal(isScopeExcludedHit("我们来看看增加了几倍的表述", "「增加了几倍」的表述"), true, "引号不应导致漏检");
});

test("教学门禁: 带括注的禁区词条必须可命中 - 「整十数乘整十数（三年级下册）」", () => {
  const plan = getClone();
  // 知识库词条带括注修饰, 课件正文不会写括注; 归一化后应能命中
  plan.teaching_sequence[1].content_block.reasoning_steps.push("本节还顺带讲解整十数乘整十数");
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "fail");
  const hit = res.errors.filter(e => e.code === "SCOPE_EXCLUDED_VIOLATION");
  assert.ok(hit.length > 0, "带括注的禁区词条不应因括注而漏检");
});

test("教学门禁: 讲稿提及禁区应降级为 warning, 不阻断交付", () => {
  const plan = getClone();
  plan.teaching_sequence[1].teacher_guidance += "（可顺带提一句整十数乘整十数，本课不展开）";
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "pass", "讲稿属排除性提醒, 不应一票否决");
  const warn = res.warnings.filter(e => e.code === "SCOPE_EXCLUDED_IN_GUIDANCE");
  assert.ok(warn.length > 0, "讲稿触碰禁区应留下警告回执");
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
