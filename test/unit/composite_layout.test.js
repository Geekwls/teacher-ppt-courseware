// -*- coding: utf-8 -*-
/**
 * 声明式组合版式测试 (composite_layout.test.js)
 *
 * 覆盖四条链路:
 * 1. spec 校验 fail-closed (非法类型/跨度/时序目标/重复 id 必须抛错);
 * 2. 命名 spec 库加载与 $plan 引用解析 (缺失字段装配失败);
 * 3. 装配产物通过表现门禁 (validatePresentation);
 * 4. 端到端渲染几何体检 0 Critical。
 */

import test from "node:test";
import assert from "node:assert/strict";
import pptxgen from "pptxgenjs";

import {
  validateCompositeSpec,
  getCompositeSpec,
  listCompositeSpecIds,
  resolveSpecForPlan
} from "../../plugin/skills/lesson-courseware/lib_js/presentation/composite_specs.js";
import { assemble as assembleComposite } from "../../plugin/skills/lesson-courseware/lib_js/presentation/layouts/composite.js";
import { validatePresentation } from "../../plugin/skills/lesson-courseware/lib_js/presentation/presentation_validator.js";
import { LAYOUT_IDS } from "../../plugin/skills/lesson-courseware/lib_js/presentation/layout_registry.js";
import { renderLayout } from "../../plugin/skills/lesson-courseware/lib_js/rendering/renderers/index.js";
import { auditDeck } from "../../plugin/skills/lesson-courseware/lib_js/layout_audit.js";
import { resolveTheme } from "../../plugin/skills/lesson-courseware/lib_js/theme.js";

const VALID_SPEC = {
  grid: { cols: 2 },
  zones: [
    { id: "context", type: "text_card", properties: { title: "【情境】", body: "$plan:context_body" } },
    { id: "points", type: "card_list", properties: { items: "$plan:reasoning_items" } },
    { id: "conclusion", type: "conclusion_banner", span: 2, properties: { text: "★ 结论" } }
  ],
  timeline: [
    { step: 1, action: "reveal", target: "points" },
    { step: 2, action: "reveal", target: "conclusion" }
  ]
};

const PLAN_FIELDS = {
  title: "组合版式自检",
  context_title: "【情境呈现】",
  context_body: "游乐园碰碰车每人每次 20 元。",
  reasoning_items: ["① 观察情境", "② 列出算式", "③ 归纳规律"],
  conclusion_text: "★ 相同加数相加可以用乘法表示。"
};

function wrapDeck(slideObj) {
  return {
    schema_version: "1.0.0",
    deck_meta: { source_lesson_id: "test-composite", theme: "clean_math_ocean", aspect_ratio: "16:9" },
    slides: [slideObj]
  };
}

test("组合版式: 命名 spec 库加载且全部合法", () => {
  const ids = listCompositeSpecIds();
  assert.ok(ids.length >= 2, "至少内置 2 个命名 spec");
  for (const id of ids) {
    const spec = getCompositeSpec(id);
    assert.equal(spec.spec_id, id);
    assert.ok(spec.zones.length > 0);
  }
});

test("组合版式: spec 校验 fail-closed", () => {
  assert.throws(() => validateCompositeSpec({ zones: [{ type: "tier_list" }] }), /不受组合版式支持/);
  assert.throws(() => validateCompositeSpec({ grid: { cols: 2 }, zones: [{ type: "card_list", span: 3 }] }), /span/);
  assert.throws(() => validateCompositeSpec({ zones: "nope" }), /zones 必须是非空数组/);
  assert.throws(() => validateCompositeSpec({ zones: [] }), /zones 必须是非空数组/);
  assert.throws(
    () => validateCompositeSpec({
      zones: [{ id: "a", type: "card_list" }, { id: "a", type: "card_list" }]
    }),
    /重复/
  );
  assert.throws(
    () => validateCompositeSpec({
      zones: [{ id: "a", type: "card_list" }],
      timeline: [{ step: 1, action: "reveal", target: "ghost" }]
    }),
    /未在 zones 中定义/
  );
  assert.throws(
    () => validateCompositeSpec({
      zones: [{ id: "a", type: "card_list" }],
      timeline: [{ step: 2, action: "reveal", target: "a" }, { step: 1, action: "reveal", target: "a" }]
    }),
    /单调不递减/
  );
});

test("组合版式: 装配产出标准 AST 且 $plan 引用生效", () => {
  const plan = { layout: "composite", layout_spec: JSON.parse(JSON.stringify(VALID_SPEC)), ...PLAN_FIELDS };
  const { elements, timeline } = assembleComposite(plan);

  assert.equal(elements[0].id, "txt_composite_title");
  assert.equal(elements[0].type, "title");
  const zoned = elements.filter(e => e.properties._zone);
  assert.equal(zoned.length, 3);
  const context = zoned.find(e => e.id === "context");
  assert.equal(context.properties.body, PLAN_FIELDS.context_body);
  const points = zoned.find(e => e.id === "points");
  assert.deepEqual(points.properties.items, PLAN_FIELDS.reasoning_items);
  const conclusion = zoned.find(e => e.id === "conclusion");
  assert.equal(conclusion.properties._zone.span, 2);
  assert.equal(conclusion.properties._zone.row, 1, "span=2 横幅应换行到第二行");

  assert.equal(timeline[0].target, "txt_composite_title");
  assert.ok(timeline.some(t => t.step === 2 && t.target === "conclusion"));
});

test("组合版式: $plan 引用缺失必须装配失败", () => {
  const plan = { layout: "composite", layout_spec: JSON.parse(JSON.stringify(VALID_SPEC)) };
  assert.throws(() => assembleComposite(plan), /在 SlidePlan 上无值/);
  assert.throws(() => assembleComposite({ layout: "composite" }), /缺少版式声明/);
});

test("组合版式: 数轴 marks 由 arcs 自动推导", () => {
  const spec = {
    grid: { cols: 2 },
    zones: [
      {
        id: "model",
        type: "figure_number_line",
        properties: { start: "$plan:model_start", end: "$plan:model_end", step: "$plan:model_step", arcs: "$plan:model_arcs" }
      }
    ]
  };
  const plan = {
    layout: "composite",
    layout_spec: spec,
    title: "数轴自检",
    model_start: 0,
    model_end: 60,
    model_step: 20,
    model_arcs: [{ from: 0, to: 20 }, { from: 20, to: 60 }]
  };
  const { elements } = assembleComposite(plan);
  const model = elements.find(e => e.id === "model");
  assert.deepEqual(model.properties.marks, [0, 20, 60]);
});

test("组合版式: 装配产物通过表现门禁", () => {
  const plan = { layout: "composite", layout_spec_name: "two_cards_banner", ...PLAN_FIELDS };
  const { elements, timeline } = assembleComposite(plan);
  const res = validatePresentation(wrapDeck({
    slide_id: "slide_01_composite",
    layout: "composite",
    elements,
    timeline,
    notes: "组合版式门禁自检讲稿。"
  }));
  assert.equal(res.status, "pass", JSON.stringify(res.errors));
  assert.ok(LAYOUT_IDS.includes("composite"), "composite 必须注册进版式注册表");
});

test("组合版式: 端到端渲染几何体检 0 Critical", () => {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.addNotes("组合版式渲染自检。");

  const plan = {
    layout: "composite",
    title: "组合版式渲染自检",
    layout_spec: JSON.parse(JSON.stringify(VALID_SPEC)),
    ...PLAN_FIELDS
  };
  const { elements, timeline } = assembleComposite(plan);

  const theme = resolveTheme("math", 3, "clean");
  renderLayout(slide, {
    slide_id: "slide_01_composite",
    layout: "composite",
    elements,
    timeline
  }, {
    pptx,
    t: theme,
    themeName: "math",
    grade: 3,
    cardShadow: { type: "outer", color: "CBD5E1", blur: 4, offset: 2, angle: 90, opacity: 0.25 },
    fontFamily: "Microsoft YaHei"
  });

  const audit = auditDeck(pptx);
  assert.equal(audit.summary.critical, 0, JSON.stringify(audit.issues || audit.summary));
});

test("组合版式: resolveSpecForPlan 命名 spec 生效", () => {
  const spec = resolveSpecForPlan({ layout_spec_name: "model_and_banner" });
  assert.equal(spec.spec_id, "model_and_banner");
  assert.ok(spec.zones.some(z => z.type === "figure_number_line"));
});
