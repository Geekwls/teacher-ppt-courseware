// -*- coding: utf-8 -*-
/**
 * 策略解析器与智能分页规划器单元测试 (test/unit/strategy_and_page_planner.test.js)
 * 基于 Node.js 官方内置测试运行器 (node:test + node:assert)
 */

import test from "node:test";
import assert from "node:assert/strict";

import { resolveStrategyContext } from "../../plugin/skills/lesson-courseware/lib_js/strategies/strategy_resolver.js";
import { planSlidesFromLesson } from "../../plugin/skills/lesson-courseware/lib_js/presentation/page_planner.js";
import { planPresentationFromLesson } from "../../plugin/skills/lesson-courseware/lib_js/presentation/lesson_to_presentation.js";
import { validatePresentation } from "../../plugin/skills/lesson-courseware/lib_js/presentation/presentation_validator.js";

const mockLessonPlan = {
  schema_version: "1.0.0",
  lesson_id: "test-mat-g3",
  meta: { subject: "math", grade: 3, term: "term-1", unit: 4, topic: "整十数口算", lesson_type: "concept_learning" },
  objectives: [{ id: "OBJ_01", statement: "理解整十数乘一位数算理", assessment: "口算准确" }],
  teaching_sequence: [
    {
      phase_id: "phase_warmup",
      phase_name: "导入",
      objective_ref: "OBJ_01",
      content_block: { type: "contextual_problem", scenario: "碰碰车20元", question: "3人多少元？", equation: "20×3=60" },
      teacher_guidance: "引导学生根据生活经验列出乘法算式"
    },
    {
      phase_id: "phase_exp",
      phase_name: "算理探究",
      objective_ref: "OBJ_01",
      content_block: {
        type: "mathematical_reasoning",
        model_type: "number_line",
        model_payload: { start: 0, end: 60, step: 20, arcs: [{ from: 0, to: 20 }] },
        reasoning_steps: ["想：20是2个十", "2个十×3=6个十", "6个十就是60"],
        core_rule: "先算2×3=6，再添0"
      },
      teacher_guidance: "结合数轴模型引导学生理解计数单位累加"
    },
    {
      phase_id: "phase_practice",
      phase_name: "闯关演练",
      objective_ref: "OBJ_01",
      content_block: {
        type: "practice_challenge",
        items: [
          { stem: "30×4=", answer: "120", explanation: "想3个十乘4" },
          { stem: "500×6=", answer: "3000", explanation: "口诀自带0" }
        ]
      },
      teacher_guidance: "逐题对答案进行诊断和病因分析"
    }
  ]
};

test("策略解析器: 三年级数学策略与基准规划", () => {
  const ctxMiddle = resolveStrategyContext({ subject: "math", grade: 3, lesson_type: "concept_learning" });
  assert.equal(ctxMiddle.meta.grade_tier, "middle", "三年级应正确映射为 middle 认知学段");
  assert.equal(ctxMiddle.cognitive.maxStepsPerReasoningSlide, 4, "中年级算理单页上限应为 4 步");
  assert.equal(ctxMiddle.subject.splitPracticeAndAnswer, true, "数学新授课应策略性拆分练习与答案页");

  const resMiddle = planSlidesFromLesson(mockLessonPlan);
  assert.equal(resMiddle.slidePlans.length, 7, "基准环节应生成 7 页");
  const practiceSlide = resMiddle.slidePlans.find(s => s.layout === "practice_list");
  const answerSlide = resMiddle.slidePlans.find(s => s.layout === "answer_reveal_list");
  assert.ok(practiceSlide && answerSlide, "练习环节应被成功拆分为独立做题页与答案诊断页");
});

test("智能分页: 算理步骤超载跨页拆分 (零删减硬约束)", () => {
  const plan = JSON.parse(JSON.stringify(mockLessonPlan));
  plan.teaching_sequence[1].content_block.reasoning_steps = [
    "步骤1: 观察20是由2个十组成的",
    "步骤2: 3个20即为3个2个十连续累加",
    "步骤3: 计算2个十乘3得到6个十",
    "步骤4: 认识到6个十在计数器上表示60",
    "步骤5: 归纳出先算表内乘法2×3=6的技巧",
    "步骤6: 验证因数末尾的0原样移到积的末尾"
  ];

  const res = planSlidesFromLesson(plan);
  assert.equal(res.slidePlans.length, 8, "算理超载时应自动拆页为 8 页");
  const modelSlide = res.slidePlans.find(s => s.slide_id.includes("exploration_model"));
  const reasoningSlide = res.slidePlans.find(s => s.slide_id.includes("exploration_reasoning"));
  assert.ok(modelSlide && reasoningSlide, "应拆分为数形建模页与算理升华页");
  assert.equal(reasoningSlide.items.length, 6, "所有 6 个算理步骤必须 100% 完整保留");
});

test("表现契约校验: 拆页生成的 Presentation AST 必须通过契约门禁", () => {
  const plan = JSON.parse(JSON.stringify(mockLessonPlan));
  const pres = planPresentationFromLesson(plan);
  const val = validatePresentation(pres);
  assert.equal(val.status, "pass", `Presentation AST 门禁应为 pass，实际错误: ${JSON.stringify(val.errors)}`);
  assert.equal(val.errors.length, 0);
});

test("初中长文本智能拆页: 长文本伴随多设问应自动拆分为品读页与设问页", () => {
  const readingPlan = {
    schema_version: "1.0.0",
    lesson_id: "test-chi-g7",
    meta: { subject: "chinese", grade: 7, term: "term-1", unit: 1, topic: "春", lesson_type: "concept_learning" },
    objectives: [{ id: "OBJ_01", statement: "品味语言美", assessment: "有感情朗读" }],
    teaching_sequence: [
      {
        phase_id: "phase_reading",
        phase_name: "绘春赏析",
        objective_ref: "OBJ_01",
        content_block: {
          type: "text_reading",
          paragraph_excerpt: "桃树、杏树、梨树，都开满了花赶趟儿。红的像火，粉的像霞，白的像雪。花里带着甜味儿；闭了眼，树上仿佛已经满是桃儿、杏儿、梨儿。花下成千成百的蜜蜂嗡嗡地闹着，大小的蝴蝶飞来飞去。",
          focus_questions: [
            "1. 动词品味：「闹」好在哪里？",
            "2. 修辞品析：为什么联想到桃儿杏儿？",
            "3. 感官角度：调动了哪些感官？"
          ],
          key_phrase: "★ 绘春手法：多感官协同 · 动静结合"
        },
        teacher_guidance: "指导学生分步品读写景手法与感官交融"
      }
    ]
  };

  const res = planSlidesFromLesson(readingPlan);
  // 封面(1) + 目标(1) + 原文品读(1) + 设问探究(1) + 封底(1) = 5页
  assert.equal(res.slidePlans.length, 5, "初中长文本加 3 设问应触发拆页，总页数应为 5");
  const readingTextSlide = res.slidePlans.find(s => s.slide_id.includes("reading_text"));
  const readingQsSlide = res.slidePlans.find(s => s.slide_id.includes("reading_questions"));
  assert.ok(readingTextSlide && readingQsSlide, "应自动拆分为原文品读页与设问探究页");
  assert.equal(readingTextSlide.questions.length, 0, "原文品读页不应含设问挤占空间");
  assert.equal(readingQsSlide.questions.length, 3, "设问探究页应保留全部 3 个深度设问");
});
