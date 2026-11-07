// -*- coding: utf-8 -*-
/**
 * 教学设计门禁与硬约束安全防御测试 (test/unit/lesson_guard.test.js)
 *
 * 核心目标:
 * 聚焦教学硬约束防线:
 * 1. 数学算式真值 (零容忍计算错误);
 * 2. 教材知识库禁区 (防超纲，含词法边界防误杀与括注规约);
 * 3. 学段数域上限 (严格阻断超出本单元数域的数字);
 * 4. 讲稿完备性 (兼容纯文本与结构化教案台词);
 * 5. 新教学内容块 (活动指令、对比表、知识树) 合法性。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { validateLessonPlan, isScopeExcludedHit } from "../../plugin/skills/lesson-courseware/lib_js/lesson/lesson_validator.js";
import { extractGuidanceText, formatTeacherGuidance } from "../../plugin/skills/lesson-courseware/lib_js/lesson/guidance_formatter.js";

const GOLDEN_PATH = path.join(process.cwd(), "acceptance", "lesson_plans", "math", "math_g3_t1_u04_lesson_plan.json");
const goldenSample = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf-8"));

function cloneGolden() {
  return JSON.parse(JSON.stringify(goldenSample));
}

test("教学门禁: 标准金样教学设计应 100% 校验通过", () => {
  const plan = cloneGolden();
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "pass", `应通过校验，实际报错: ${JSON.stringify(res.errors)}`);
  assert.equal(res.errors.length, 0);
});

test("教学门禁: 数学算式真值计算错误必须严格拦截", () => {
  const plan = cloneGolden();
  plan.teaching_sequence[0].content_block.equation = "20 * 3 = 80";
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "fail");
  assert.ok(res.errors.some(e => e.code === "MATH_CALCULATION_ERROR"), "应精准拦截算式错误 MATH_CALCULATION_ERROR");
});

test("禁区匹配: 词界防误杀「百分数」不命中「分数」, 真禁区准确命中", () => {
  assert.equal(isScopeExcludedHit("打折后相当于原价的百分数优惠", "分数"), false, "「百分数」不应误杀「分数」");
  assert.equal(isScopeExcludedHit("把单位「1」平均分成若干份, 认识分数", "分数"), true, "真实「分数」必须命中");
  assert.equal(isScopeExcludedHit("消去法可以简化运算", "除法"), false, "「消去」不应误杀「除法」");
  assert.equal(isScopeExcludedHit("photosynthesis in plants", "photo"), false, "英文词界: photo 不应误伤 photosynthesis");
});

test("禁区匹配: 带括注与书名号的词条归一化后准确拦截", () => {
  assert.equal(isScopeExcludedHit("本节还顺带讲解整十数乘整十数", "整十数乘整十数（三年级下册）"), true, "括注修饰不应漏检");
  assert.equal(isScopeExcludedHit("我们来看看增加了几倍的表述", "「增加了几倍」的表述"), true, "引号修饰不应漏检");

  const plan = cloneGolden();
  plan.teaching_sequence[1].content_block.reasoning_steps.push("本节还顺带讲解整十数乘整十数");
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "fail");
  assert.ok(res.errors.some(e => e.code === "SCOPE_EXCLUDED_VIOLATION"));
});

test("教学门禁: 讲稿提及禁区降级为 warning (不阻断正常创作与说明)", () => {
  const plan = cloneGolden();
  plan.teaching_sequence[1].teacher_guidance += "（可顺带提一句整十数乘整十数，本课不展开）";
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "pass", "排除性说明不应导致阻断失败");
  assert.ok(res.warnings.some(e => e.code === "SCOPE_EXCLUDED_IN_GUIDANCE"));
});

test("教学门禁: 数域上限扫描 - 递归拦截题目叙述中超出数域的数字", () => {
  const plan = cloneGolden();
  plan.teaching_sequence[0].content_block.scenario = "仓库里采购了 25000 瓶饮用水，需要分批发放。";
  const res = validateLessonPlan(plan);
  assert.equal(res.status, "fail");
  assert.ok(res.errors.some(e => e.code === "NUMERIC_UPPER_BOUND_EXCEEDED"));
});

test("讲稿结构化: 支持结构化教案对象与向下兼容纯文本", () => {
  const structured = {
    timing: "3分钟",
    say: "同学们请看大屏幕上的几何图形",
    ask: "它们有什么共同特征？",
    expected_answer: "都是轴对称图形",
    transition: "下面我们动手折一折来验证"
  };

  const plainText = extractGuidanceText(structured);
  assert.ok(plainText.length >= 10);
  assert.ok(plainText.includes("轴对称图形"));

  const formatted = formatTeacherGuidance(structured, { speech_detail: "verbatim" });
  assert.ok(formatted.includes("【建议用时】3分钟"));
  assert.ok(formatted.includes("【教学台词】"));
  assert.ok(formatted.includes("【启发提问】"));

  // 纯文本兼容
  assert.equal(formatTeacherGuidance("请同学们独立完成练习。"), "请同学们独立完成练习。");
});

test("教学门禁: 支持活动指令卡、对比表与知识树新内容块类型", () => {
  const plan = cloneGolden();
  const objId = plan.objectives[0]?.id || "OBJ_01";
  plan.teaching_sequence.push(
    {
      phase_id: "phase_activity",
      phase_name: "课堂活动",
      objective_ref: objId,
      content_block: {
        type: "activity_instruction",
        activity_type: "小组合作",
        duration: "4分钟",
        tasks: ["组内轮流说思路", "记录最佳算法", "准备分享"]
      },
      teacher_guidance: "组织学生有序开展四人小组合作交流。"
    },
    {
      phase_id: "phase_compare",
      phase_name: "算法对比",
      objective_ref: objId,
      content_block: {
        type: "comparison_table",
        headers: ["算法对比", "口算方法", "笔算方法"],
        rows: [["适用场景", "整十整百数口算", "多位数乘一位数笔算"]]
      },
      teacher_guidance: "引导学生对比口算与笔算的异同点。"
    },
    {
      phase_id: "phase_tree",
      phase_name: "知识网络",
      objective_ref: objId,
      content_block: {
        type: "knowledge_tree",
        root_topic: "乘法口算体系",
        branches: [{ name: "表内乘法", leaves: ["乘法口诀"] }]
      },
      teacher_guidance: "利用思维导图梳理知识联系。"
    }
  );

  const res = validateLessonPlan(plan);
  assert.equal(res.status, "pass", `新内容块应正常通过门禁: ${JSON.stringify(res.errors)}`);
});
