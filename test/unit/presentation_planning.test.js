// -*- coding: utf-8 -*-
/**
 * 课件表现规划与双 AST 转换单元测试 (test/unit/presentation_planning.test.js)
 *
 * 核心目标:
 * 聚焦页面规划与调度能力:
 * 1. 课型骨架全覆盖与诊断 (必备环节缺口插占位页、等价角色映射、片段式保护);
 * 2. 认知容量与自动拆页 (算理超载零删减拆页、初中长文本沉浸品读与设问深究拆页);
 * 3. 场景预设驱动 (联动风格、结构、收尾页与讲稿详略);
 * 4. 版式变体仲裁 (显式优先、预设回落、特征自适应);
 * 5. 产出 Presentation AST 严格通过契约校验。
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  LESSON_SKELETONS,
  LESSON_SKELETON_IDS,
  resolvePhaseRole,
  diagnoseSkeleton,
  missingPhaseStubs
} from "../../plugin/skills/lesson-courseware/lib_js/strategies/lesson_skeleton.js";
import { resolveStrategyContext } from "../../plugin/skills/lesson-courseware/lib_js/strategies/strategy_resolver.js";
import { resolveScenePreset } from "../../plugin/skills/lesson-courseware/lib_js/strategies/scene_presets.js";
import { resolveLayoutVariant } from "../../plugin/skills/lesson-courseware/lib_js/rendering/layout_variants.js";
import { planSlidesFromLesson } from "../../plugin/skills/lesson-courseware/lib_js/presentation/page_planner.js";
import { planPresentationFromLesson } from "../../plugin/skills/lesson-courseware/lib_js/presentation/lesson_to_presentation.js";
import { validatePresentation } from "../../plugin/skills/lesson-courseware/lib_js/presentation/presentation_validator.js";

function makeLesson(type, phases = []) {
  return {
    schema_version: "1.0.0",
    lesson_id: "test-lesson-id",
    meta: {
      subject: "math",
      grade: 3,
      term: "term-1",
      unit: 4,
      topic: "测试课",
      lesson_type: type,
      source_point_id: "math-g3-t1-u04-p01"
    },
    objectives: [
      { id: "OBJ_1", statement: "掌握核心概念和运算法则", assessment: "独立计算" }
    ],
    teaching_sequence: phases
  };
}

test("课型骨架: 覆盖全部 5 种课型契约枚举，必备环节无遗漏", () => {
  const expected = ["concept_learning", "practice_consolidation", "unit_review", "experiment_inquiry", "reading_comprehension"];
  assert.deepEqual(LESSON_SKELETON_IDS.slice().sort(), expected.sort());

  expected.forEach(type => {
    const skeleton = LESSON_SKELETONS[type];
    assert.ok(skeleton, `缺失课型骨架: ${type}`);
    const req = skeleton.phases.filter(p => p.required);
    assert.ok(req.length >= 2, `${type} 必备环节至少应有 2 个`);
  });
});

test("骨架诊断: 缺失必备环节生成占位描述并插入占位页", () => {
  // 故意缺少当堂练习 (practice)
  const incomplete = makeLesson("concept_learning", [
    {
      phase_id: "phase_warmup",
      phase_name: "导入",
      objective_ref: "OBJ_1",
      content_block: { type: "contextual_problem", scenario: "场景", question: "问题" },
      teacher_guidance: "引导学生认真思考问题。"
    },
    {
      phase_id: "phase_exp",
      phase_name: "核心探究",
      objective_ref: "OBJ_1",
      content_block: { type: "mathematical_reasoning", reasoning_steps: ["步骤一", "步骤二"] },
      teacher_guidance: "引导学生推导规律。"
    },
    {
      phase_id: "phase_summary",
      phase_name: "小结",
      objective_ref: "OBJ_1",
      content_block: { type: "rule_summary", summary_points: ["要点一"] },
      teacher_guidance: "引导学生总结要点。"
    }
  ]);

  const diag = diagnoseSkeleton(incomplete);
  assert.equal(diag.complete, false);
  assert.ok(diag.missing.some(m => m.role === "practice"));

  // planSlidesFromLesson 自动落地占位页
  const res = planSlidesFromLesson(incomplete);
  const placeholder = res.slidePlans.find(s => s.layout === "phase_placeholder");
  assert.ok(placeholder, "必备环节缺失时必须生成待补充占位页");
  assert.equal(placeholder.placeholder_role, "practice");
});

test("骨架诊断: 语文文本品读等价于数学核心探究 (不误判缺探究)", () => {
  const chineseLesson = makeLesson("concept_learning", [
    {
      phase_id: "phase_warmup",
      phase_name: "导入",
      objective_ref: "OBJ_1",
      content_block: { type: "contextual_problem", scenario: "情境", question: "设问" },
      teacher_guidance: "激发学生朗读兴趣。"
    },
    {
      phase_id: "phase_reading",
      phase_name: "精读课文",
      objective_ref: "OBJ_1",
      content_block: { type: "text_reading", paragraph_excerpt: "葡萄种在山坡的梯田上。" },
      teacher_guidance: "指导学生朗读重点语句。"
    },
    {
      phase_id: "phase_practice",
      phase_name: "当堂练习",
      objective_ref: "OBJ_1",
      content_block: { type: "practice_challenge", items: [{ stem: "仿写句子" }] },
      teacher_guidance: "指导学生独立动笔。"
    },
    {
      phase_id: "phase_summary",
      phase_name: "课堂小结",
      objective_ref: "OBJ_1",
      content_block: { type: "rule_summary", summary_points: ["总结葡萄沟的特点"] },
      teacher_guidance: "总结课堂主要内容。"
    }
  ]);

  const diag = diagnoseSkeleton(chineseLesson);
  assert.equal(diag.complete, true, "文本品读作为等价探究角色，骨架应判定完备");
  assert.equal(diag.missing.length, 0);
});

test("算理超载拆页: 步骤超出学段容量时自动拆页且 100% 完整保留算理", () => {
  const plan = makeLesson("concept_learning", [
    {
      phase_id: "phase_warmup",
      phase_name: "导入",
      objective_ref: "OBJ_1",
      content_block: { type: "contextual_problem", scenario: "场景", question: "问题" },
      teacher_guidance: "引导学生认真思考。"
    },
    {
      phase_id: "phase_exp",
      phase_name: "算理探究",
      objective_ref: "OBJ_1",
      content_block: {
        type: "mathematical_reasoning",
        model_payload: { start: 0, end: 60, step: 20 },
        reasoning_steps: [
          "步骤1: 观察20由2个十组成",
          "步骤2: 3个20即3个2个十连续累加",
          "步骤3: 2个十乘3得6个十",
          "步骤4: 6个十在计数器上表示60",
          "步骤5: 归纳出表内乘法技巧",
          "步骤6: 验证因数末尾的0原样移到末尾"
        ]
      },
      teacher_guidance: "引导学生步步推导。"
    },
    {
      phase_id: "phase_practice",
      phase_name: "练习",
      objective_ref: "OBJ_1",
      content_block: { type: "practice_challenge", items: [{ stem: "20×4" }] },
      teacher_guidance: "独立计算。"
    },
    {
      phase_id: "phase_summary",
      phase_name: "小结",
      objective_ref: "OBJ_1",
      content_block: { type: "rule_summary", summary_points: ["核心法则"] },
      teacher_guidance: "总结规律。"
    }
  ]);

  const res = planSlidesFromLesson(plan);
  const modelSlide = res.slidePlans.find(s => s.slide_id.includes("exploration_model"));
  const reasoningSlide = res.slidePlans.find(s => s.slide_id.includes("exploration_reasoning"));
  assert.ok(modelSlide && reasoningSlide, "必须拆分为数形建模与算理升华两页");
  assert.equal(reasoningSlide.items.length, 6, "全部 6 个算理步骤必须 100% 保留");
});

test("初中长文本拆页: 长段落伴随多设问自动拆为品读页与设问页", () => {
  const plan = {
    schema_version: "1.0.0",
    lesson_id: "chi-g7-t1-u01-l01",
    meta: {
      subject: "chinese",
      grade: 7,
      term: "term-1",
      unit: 1,
      topic: "春",
      lesson_type: "concept_learning",
      source_point_id: "chi-g7-t1-u01-p01"
    },
    objectives: [
      { id: "OBJ_1", statement: "品味春风图优美词句", assessment: "赏析批注" }
    ],
    teaching_sequence: [
      {
        phase_id: "phase_reading_spring_wind",
        phase_name: "春风图品读",
        objective_ref: "OBJ_1",
        content_block: {
          type: "text_reading",
          paragraph_excerpt: "“吹面不寒杨柳风”，不错的，像母亲的手抚摸着你。风里带来些新翻的泥土的气息，混着青草味儿，还有各种花的香，都在微微润湿的空气里酝酿。鸟儿将巢安在繁花嫩叶当中，高兴起来了，呼朋引伴地卖弄清脆的喉咙，唱出宛转的曲子，与轻风流水应和着。",
          focus_questions: [
            "作者从哪几个感官维度描写春风？",
            "“母亲的手”这一比喻传递了怎样的情感温度？"
          ],
          key_phrase: "调动触觉、嗅觉、听觉多感官融情于景"
        },
        teacher_guidance: "指导学生品味语言文字之美。"
      },
      {
        phase_id: "phase_practice",
        phase_name: "仿写练笔",
        objective_ref: "OBJ_1",
        content_block: { type: "practice_challenge", items: [{ stem: "仿写一段春景" }] },
        teacher_guidance: "动笔练习。"
      },
      {
        phase_id: "phase_summary",
        phase_name: "小结",
        objective_ref: "OBJ_1",
        content_block: { type: "rule_summary", summary_points: ["多感官描写法"] },
        teacher_guidance: "总结手法。"
      }
    ]
  };

  const res = planSlidesFromLesson(plan);
  const textSlide = res.slidePlans.find(s => s.slide_id.includes("reading_text"));
  const questSlide = res.slidePlans.find(s => s.slide_id.includes("reading_questions"));
  assert.ok(textSlide && questSlide, "长文本与多设问必须拆分为原文品读页与设问探究页");
  assert.equal(textSlide.layout, "reading_focus");
});

test("场景预设与版式变体: open_class 联动暖阳风格、追加板书作业页并仲裁变体", () => {
  const plan = makeLesson("concept_learning", [
    {
      phase_id: "phase_warmup",
      phase_name: "导入",
      objective_ref: "OBJ_1",
      content_block: { type: "contextual_problem", scenario: "情境", question: "问题" },
      teacher_guidance: "导入环节。"
    },
    {
      phase_id: "phase_exp",
      phase_name: "探究",
      objective_ref: "OBJ_1",
      content_block: { type: "mathematical_reasoning", reasoning_steps: ["步骤一"] },
      teacher_guidance: "探究环节。"
    },
    {
      phase_id: "phase_practice",
      phase_name: "练习",
      objective_ref: "OBJ_1",
      content_block: { type: "practice_challenge", items: [{ stem: "题目1" }, { stem: "题目2" }] },
      teacher_guidance: "练习环节。"
    },
    {
      phase_id: "phase_summary",
      phase_name: "小结",
      objective_ref: "OBJ_1",
      content_block: { type: "rule_summary", summary_points: ["要点1", "要点2"] },
      teacher_guidance: "小结环节。"
    }
  ]);
  plan.meta.preset = "open_class";

  const pres = planPresentationFromLesson(plan);
  assert.equal(pres.deck_meta.preset, "open_class");
  assert.equal(pres.deck_meta.style, "warm");

  // 检查是否自动追加了板书页与分层作业页
  const layouts = pres.slides.map(s => s.layout);
  assert.ok(layouts.includes("board_design"), "open_class 必须追加板书页");
  assert.ok(layouts.includes("homework_card"), "open_class 必须追加分层作业页");

  // 检查版式变体仲裁
  const objSlide = pres.slides.find(s => s.layout === "objectives_card");
  assert.equal(objSlide.layout_variant, "split_lr");
  const prSlide = pres.slides.find(s => s.layout === "practice_list");
  assert.equal(prSlide.layout_variant, "timed_challenge");

  // 严格表现契约门禁
  const vRes = validatePresentation(pres);
  assert.equal(vRes.status, "pass", `Presentation 校验应通过: ${JSON.stringify(vRes.errors)}`);
});
