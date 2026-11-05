// -*- coding: utf-8 -*-
/**
 * 课型骨架单元测试 (test/unit/lesson_skeleton.test.js)
 *
 * 覆盖 3 层:
 * 1. 注册表自身: 5 种课型齐全、角色引用合法、等价角色不串槽;
 * 2. 诊断纯函数: 角色识别优先级、缺口、顺序偏离、片段式判定、占位锚点;
 * 3. 落地效果: 占位页插入位置、收尾页按课型差异、契约门禁接受新页型。
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  LESSON_SKELETONS,
  LESSON_SKELETON_IDS,
  PHASE_ROLES,
  resolvePhaseRole,
  diagnoseSkeleton,
  missingPhaseStubs,
  formatSkeletonLine
} from "../../plugin/skills/lesson-courseware/lib_js/strategies/lesson_skeleton.js";
import { LESSON_TYPE_POLICIES } from "../../plugin/skills/lesson-courseware/lib_js/strategies/strategy_resolver.js";
import { planSlidesFromLesson } from "../../plugin/skills/lesson-courseware/lib_js/presentation/page_planner.js";
import { planPresentationFromLesson } from "../../plugin/skills/lesson-courseware/lib_js/presentation/lesson_to_presentation.js";
import { validatePresentation } from "../../plugin/skills/lesson-courseware/lib_js/presentation/presentation_validator.js";

/** schema 里 lesson_type 的全部枚举值 (契约与实现必须一一对应, 不允许静默回落) */
const SCHEMA_LESSON_TYPES = [
  "concept_learning",
  "practice_consolidation",
  "unit_review",
  "experiment_inquiry",
  "reading_comprehension"
];

function phase(phaseId, blockType, extra = {}) {
  return {
    phase_id: phaseId,
    phase_name: phaseId,
    objective_ref: "OBJ_01",
    content_block: { type: blockType, ...extra },
    teacher_guidance: "这是用于单元测试的教师引导讲稿，长度足够。"
  };
}

function lesson(lessonType, phases) {
  return {
    schema_version: "1.0.0",
    lesson_id: "test-lesson",
    meta: {
      subject: "math",
      grade: 3,
      term: "term-1",
      unit: 1,
      topic: "测试课题",
      lesson_type: lessonType,
      source_point_id: "math-g3-t1-u01-p01"
    },
    objectives: [{ id: "OBJ_01", statement: "掌握本课核心方法", assessment: "能独立完成练习" }],
    teaching_sequence: phases
  };
}

test("课型骨架: 覆盖 schema 全部 5 种课型, 不留静默回落的口子", () => {
  assert.deepEqual(
    LESSON_SKELETON_IDS.slice().sort(),
    SCHEMA_LESSON_TYPES.slice().sort(),
    "骨架注册表必须与 lesson-plan.schema.json 的 lesson_type 枚举完全一致"
  );
  SCHEMA_LESSON_TYPES.forEach(type => {
    assert.ok(LESSON_TYPE_POLICIES[type], `策略表缺少课型 ${type}, 会静默回落成新授课`);
    assert.ok(LESSON_SKELETONS[type].name, `骨架 ${type} 缺中文名`);
  });
});

test("课型骨架: 每个环节角色都有定义, 且必备环节至少 1 个", () => {
  for (const [type, skeleton] of Object.entries(LESSON_SKELETONS)) {
    assert.ok(skeleton.phases.length >= 3, `${type} 的骨架环节过少`);
    const required = skeleton.phases.filter(p => p.required);
    assert.ok(required.length >= 2, `${type} 至少要有 2 个必备环节, 否则骨架形同虚设`);
    for (const p of skeleton.phases) {
      assert.ok(PHASE_ROLES[p.role], `${type} 引用了未定义的角色 ${p.role}`);
      (p.aliases || []).forEach(a => {
        assert.ok(PHASE_ROLES[a], `${type} 引用了未定义的等价角色 ${a}`);
      });
    }
  }
});

test("角色识别: phase_id 关键字优先于 content_block.type", () => {
  // 同为 practice_challenge, 靠 phase_id 区分基础练习与变式练习
  assert.equal(resolvePhaseRole(phase("phase_02_basic_practice", "practice_challenge")), "basic_practice");
  assert.equal(resolvePhaseRole(phase("phase_03_variant_practice", "practice_challenge")), "variant_practice");
  assert.equal(resolvePhaseRole(phase("phase_05_practice", "practice_challenge")), "practice");
  // 关键字顺序: error_analysis 不能被 practice 抢走
  assert.equal(resolvePhaseRole(phase("phase_04_error_analysis", "practice_challenge")), "error_analysis");
  assert.equal(resolvePhaseRole(phase("phase_01_recall", "rule_summary")), "recall");
});

test("角色识别: 无关键字时回落到 content_block.type", () => {
  assert.equal(resolvePhaseRole(phase("phase_a", "contextual_problem")), "warmup");
  assert.equal(resolvePhaseRole(phase("phase_b", "mathematical_reasoning")), "exploration");
  assert.equal(resolvePhaseRole(phase("phase_c", "text_reading")), "reading");
  assert.equal(resolvePhaseRole(phase("phase_d", "worked_example")), "example");
  assert.equal(resolvePhaseRole(phase("phase_e", "misconception_analysis")), "misconception");
  assert.equal(resolvePhaseRole(phase("phase_f", "rule_summary")), "summary");
});

test("角色识别: 既没关键字也没可用 type 时返回 null, 交给 unmapped 报告", () => {
  assert.equal(resolvePhaseRole({ phase_id: "phase_xyz", content_block: { type: "unknown_block" } }), null);
  assert.equal(resolvePhaseRole({}), null);
});

test("骨架诊断: 结构完整的新授课判定为完备, 且不产生顺序告警", () => {
  const report = diagnoseSkeleton(lesson("concept_learning", [
    phase("phase_01_warmup", "contextual_problem"),
    phase("phase_02_exploration", "mathematical_reasoning"),
    phase("phase_03_practice", "practice_challenge"),
    phase("phase_04_summary", "rule_summary")
  ]));
  assert.equal(report.complete, true);
  assert.equal(report.missing.length, 0);
  assert.equal(report.outOfOrder.length, 0);
  assert.equal(report.fragmented, false);
  assert.ok(formatSkeletonLine(report).includes("完备"));
});

test("骨架诊断: 缺当堂练习应被识别为必备环节缺口", () => {
  const report = diagnoseSkeleton(lesson("concept_learning", [
    phase("phase_01_warmup", "contextual_problem"),
    phase("phase_02_exploration", "mathematical_reasoning"),
    phase("phase_04_summary", "rule_summary")
  ]));
  assert.equal(report.complete, false);
  assert.deepEqual(report.missing.map(m => m.role), ["practice"]);
  assert.equal(report.missing[0].label, "当堂练习");
  assert.equal(report.fragmented, false, "缺 1 个槽位、覆盖 3 个槽位, 不属于片段式");
});

test("骨架诊断: 语文\'文本品读\'等价于数学\'核心探究\', 不误报缺探究", () => {
  const report = diagnoseSkeleton(lesson("concept_learning", [
    phase("phase_01_warmup", "contextual_problem"),
    phase("phase_02_reading", "text_reading"),
    phase("phase_03_practice", "practice_challenge"),
    phase("phase_04_summary", "rule_summary")
  ]));
  assert.equal(report.complete, true, "reading 是 exploration 的等价角色, 不应判缺失");
  assert.equal(report.off_skeleton_roles.length, 0, "等价角色不应被列为骨架外环节");
});

test("骨架诊断: 骨架外环节保留但不算缺口 (如新授课里混入复习唤醒)", () => {
  const report = diagnoseSkeleton(lesson("concept_learning", [
    phase("phase_01_warmup", "contextual_problem"),
    phase("phase_02_recall", "rule_summary"),
    phase("phase_03_practice", "practice_challenge"),
    phase("phase_04_summary", "rule_summary")
  ]));
  // 缺 exploration 是缺口; recall 不属于新授课骨架, 保留但不计数
  assert.deepEqual(report.missing.map(m => m.role), ["exploration"]);
  assert.deepEqual(report.off_skeleton_roles.map(r => r.role), ["recall"]);
});

test("骨架诊断: 小结排在练习之前应报顺序偏离, 但不阻断", () => {
  const report = diagnoseSkeleton(lesson("concept_learning", [
    phase("phase_01_warmup", "contextual_problem"),
    phase("phase_02_exploration", "mathematical_reasoning"),
    phase("phase_03_summary", "rule_summary"),
    phase("phase_04_practice", "practice_challenge")
  ]));
  assert.equal(report.outOfOrder.length, 1);
  assert.equal(report.outOfOrder[0].role, "practice");
  assert.ok(report.outOfOrder[0].note.includes("当堂练习"));
});

test("骨架诊断: 缺口多于已覆盖槽位时判定为片段式设计", () => {
  const report = diagnoseSkeleton(lesson("concept_learning", [
    phase("phase_02_reading", "text_reading")
  ]));
  assert.equal(report.fragmented, true, "单个环节的片段课件不应被判成\'残缺课时\'");
  assert.ok(report.missing.length > report.matched.length);
});

test("占位锚点: 缺失的练习环节应插在易错辨析之后、小结之前", () => {
  const report = diagnoseSkeleton(lesson("concept_learning", [
    phase("phase_01_warmup", "contextual_problem"),
    phase("phase_02_exploration", "mathematical_reasoning"),
    phase("phase_03_misconception", "misconception_analysis"),
    phase("phase_05_summary", "rule_summary")
  ]));
  const stubs = missingPhaseStubs(report);
  assert.equal(stubs.length, 1);
  assert.equal(stubs[0].role, "practice");
  assert.equal(stubs[0].insertAfterPhaseId, "phase_03_misconception");
});

test("占位锚点: 缺首个必备环节时插在其后第一个已存在环节之前", () => {
  const report = diagnoseSkeleton(lesson("concept_learning", [
    phase("phase_02_exploration", "mathematical_reasoning"),
    phase("phase_03_practice", "practice_challenge"),
    phase("phase_04_summary", "rule_summary")
  ]));
  const stubs = missingPhaseStubs(report);
  assert.equal(stubs.length, 1);
  assert.equal(stubs[0].role, "warmup");
  assert.equal(stubs[0].insertAfterPhaseId, null);
  assert.equal(stubs[0].insertBeforePhaseId, "phase_02_exploration");
});

test("落地: 缺失必备环节时生成待补充页, 位置在小结之前", () => {
  const plan = lesson("concept_learning", [
    phase("phase_01_warmup", "contextual_problem"),
    phase("phase_02_exploration", "mathematical_reasoning"),
    phase("phase_03_summary", "rule_summary")
  ]);
  const res = planSlidesFromLesson(plan);
  const placeholder = res.slidePlans.find(s => s.layout === "phase_placeholder");
  assert.ok(placeholder, "缺当堂练习应生成占位页");
  assert.ok(placeholder.title.includes("当堂练习"), "占位页标题应点明缺的是哪个环节");

  const idxPlaceholder = res.slidePlans.indexOf(placeholder);
  const idxSummary = res.slidePlans.findIndex(s => s.layout === "summary_card");
  assert.ok(idxPlaceholder < idxSummary, "占位页应插在小结之前, 而不是糊在末尾");
  assert.equal(res.skeletonReport.filled.length, 1);
});

test("落地: 片段式设计不补占位页, 只做诊断", () => {
  const plan = lesson("concept_learning", [phase("phase_02_reading", "text_reading")]);
  const res = planSlidesFromLesson(plan);
  assert.equal(res.slidePlans.filter(s => s.layout === "phase_placeholder").length, 0, "片段课件不该被占位页塞满");
  assert.equal(res.skeletonReport.fragmented, true);
  assert.ok(res.skeletonReport.missing.length >= 2, "缺什么仍要如实报告");
});

test("落地: --no-skeleton-fill 可关闭补齐 (skeleton_fill: false)", () => {
  const plan = lesson("concept_learning", [
    phase("phase_01_warmup", "contextual_problem"),
    phase("phase_02_exploration", "mathematical_reasoning"),
    phase("phase_03_summary", "rule_summary")
  ]);
  const res = planSlidesFromLesson(plan, { skeleton_fill: false });
  assert.equal(res.slidePlans.filter(s => s.layout === "phase_placeholder").length, 0);
  assert.equal(res.skeletonReport.filled.length, 0);
  assert.equal(res.skeletonReport.missing.length, 1, "关闭补齐不影响诊断结论");
});

test("落地: 练习巩固课收尾追加分层作业页, 不追加板书页", () => {
  const plan = lesson("practice_consolidation", [
    phase("phase_01_recall", "rule_summary"),
    phase("phase_02_basic_practice", "practice_challenge", {
      items: [{ stem: "1+1=", answer: "2", explanation: "基础题" }]
    }),
    phase("phase_03_variant_practice", "practice_challenge", {
      items: [{ stem: "2+2=", answer: "4", explanation: "变式题" }]
    }),
    phase("phase_04_summary", "rule_summary")
  ]);
  const layouts = planSlidesFromLesson(plan).slidePlans.map(s => s.layout);
  assert.ok(layouts.includes("homework_card"), "练习课应布置分层作业");
  assert.ok(!layouts.includes("board_design"), "练习课不挂板书结构页");
  assert.ok(layouts.indexOf("homework_card") < layouts.indexOf("end_cover"), "作业页应在封底之前");
});

test("落地: 单元复习课收尾先板书结构再分层作业", () => {
  const plan = lesson("unit_review", [
    phase("phase_01_network", "rule_summary", { summary_points: ["要点一", "要点二", "要点三"] }),
    phase("phase_02_topic_drill", "practice_challenge", {
      items: [{ stem: "例题", answer: "答案", explanation: "解析" }]
    }),
    phase("phase_03_misconception", "misconception_analysis", {
      wrong_case: "错例",
      cause_analysis: "错因",
      correct_method: "正解方法"
    }),
    phase("phase_04_summary", "rule_summary", { summary_points: ["方法一", "方法二"] })
  ]);
  const layouts = planSlidesFromLesson(plan).slidePlans.map(s => s.layout);
  const iBoard = layouts.indexOf("board_design");
  const iHw = layouts.indexOf("homework_card");
  assert.ok(iBoard > -1 && iHw > -1, "复习课应同时产出板书页与作业页");
  assert.ok(iBoard < iHw, "板书结构应在分层作业之前");
});

test("落地: 三种课型都规划完毕后仍能通过表现契约门禁", () => {
  const cases = {
    concept_learning: [
      phase("phase_01_warmup", "contextual_problem", { scenario: "情境", question: "问题" }),
      phase("phase_02_exploration", "mathematical_reasoning", {
        model_payload: { start: 0, end: 10, step: 5, arcs: [] },
        reasoning_steps: ["一步", "两步"],
        core_rule: "规律"
      }),
      phase("phase_03_practice", "practice_challenge", {
        items: [{ stem: "题", answer: "答", explanation: "析" }]
      }),
      phase("phase_04_summary", "rule_summary", { summary_points: ["小结"] })
    ],
    practice_consolidation: [
      phase("phase_01_recall", "rule_summary", { summary_points: ["回顾"] }),
      phase("phase_02_basic_practice", "practice_challenge", {
        items: [{ stem: "题", answer: "答", explanation: "析" }]
      }),
      phase("phase_03_variant_practice", "practice_challenge", {
        items: [{ stem: "题2", answer: "答2", explanation: "析2" }]
      }),
      phase("phase_04_summary", "rule_summary", { summary_points: ["小结"] })
    ],
    unit_review: [
      phase("phase_01_network", "rule_summary", { summary_points: ["网络"] }),
      phase("phase_02_topic_drill", "practice_challenge", {
        items: [{ stem: "题", answer: "答", explanation: "析" }]
      }),
      phase("phase_03_summary", "rule_summary", { summary_points: ["小结"] })
    ]
  };

  for (const [type, phases] of Object.entries(cases)) {
    const pres = planPresentationFromLesson(lesson(type, phases));
    const val = validatePresentation(pres);
    assert.equal(
      val.status,
      "pass",
      `${type} 的表现契约应通过, 实际错误: ${JSON.stringify(val.errors)}`
    );
  }
});
