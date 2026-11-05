// -*- coding: utf-8 -*-
/**
 * 策略解析器与智能分页规划器自动化单元测试
 * (test_strategy_and_page_planner.js)
 */

import { resolveStrategyContext } from "../lib_js/strategies/strategy_resolver.js";
import { planSlidesFromLesson } from "../lib_js/presentation/page_planner.js";
import { planPresentationFromLesson } from "../lib_js/presentation/lesson_to_presentation.js";
import { validatePresentation } from "../lib_js/presentation/presentation_validator.js";

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASS: ${message}`);
}

console.log("=== 开始 Phase 2 策略解析器与 PagePlanner 自动化测试 ===");

// -----------------------------------------------------------------------------
// Test Case 1: 标准三年级数学策略解析与规划
// -----------------------------------------------------------------------------
console.log("\n[Test 1] 标准三年级数学策略解析与基准 10 页规划...");
const ctxMiddle = resolveStrategyContext({ subject: "math", grade: 3, lesson_type: "concept_learning" });
assert(ctxMiddle.meta.grade_tier === "middle", "三年级应正确映射为 middle 认知学段");
assert(ctxMiddle.cognitive.maxStepsPerReasoningSlide === 4, "中年级算理单页上限应为 4 步");
assert(ctxMiddle.subject.splitPracticeAndAnswer === true, "数学新授课应策略性拆分练习与答案页");

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

const resMiddle = planSlidesFromLesson(mockLessonPlan);
assert(resMiddle.slidePlans.length === 7, `基准教学环节应生成 7 页 (封面+目标+导入+探究+题目+答案+封底)，实际: ${resMiddle.slidePlans.length}`);
const practiceSlide = resMiddle.slidePlans.find(s => s.layout === "practice_list");
const answerSlide = resMiddle.slidePlans.find(s => s.layout === "answer_reveal_list");
assert(Boolean(practiceSlide && answerSlide), "练习环节应被 PagePlanner 成功拆分为独立做题页与答案诊断页");

// -----------------------------------------------------------------------------
// Test Case 2: 算理步骤超载智能跨页测试 (防止算理被裁切)
// -----------------------------------------------------------------------------
console.log("\n[Test 2] 算理步骤超载场景智能拆页验证 (硬约束: 算理零删减)...");
const overloadedLessonPlan = JSON.parse(JSON.stringify(mockLessonPlan));
// 注入 6 个推导步骤 (超过 middle 学段的 4 步阈值)
overloadedLessonPlan.teaching_sequence[1].content_block.reasoning_steps = [
  "步骤1: 观察20是由2个十组成的",
  "步骤2: 3个20即为3个2个十连续累加",
  "步骤3: 计算2个十乘3得到6个十",
  "步骤4: 认识到6个十在计数器上表示60",
  "步骤5: 归纳出先算表内乘法2×3=6的技巧",
  "步骤6: 验证因数末尾的0原样移到积的末尾"
];

const resOverloaded = planSlidesFromLesson(overloadedLessonPlan);
assert(resOverloaded.slidePlans.length === 8, `算理超载时应触发智能拆页 (+1页)，总页数应为 8 页，实际: ${resOverloaded.slidePlans.length}`);

const modelSlide = resOverloaded.slidePlans.find(s => s.slide_id.includes("exploration_model"));
const reasoningSlide = resOverloaded.slidePlans.find(s => s.slide_id.includes("exploration_reasoning"));
assert(Boolean(modelSlide && reasoningSlide), "超载算理应自动拆分为「数形建模页」与「算理升华页」");
assert(reasoningSlide.items.length === 6, "所有 6 个算理步骤必须 100% 完整保留，杜绝任何粗暴删减！");

// -----------------------------------------------------------------------------
// Test Case 3: 拆页后的 Presentation AST 结构与门禁验证
// -----------------------------------------------------------------------------
console.log("\n[Test 3] 校验拆页后生成的 Presentation AST 契约合规性...");
const fullAst = planPresentationFromLesson(overloadedLessonPlan);
const valResult = validatePresentation(fullAst);
assert(valResult.status === "pass", `智能拆页生成的 AST 必须通过独立门禁验证: ${JSON.stringify(valResult.errors)}`);
assert(valResult.errors.length === 0, "AST 门禁应为 0 错误");

console.log("\n========================================================");
console.log("🎉 Phase 2 策略解析器 (StrategyResolver) 与 PagePlanner 自动化测试全量通过!");
console.log("========================================================\n");
