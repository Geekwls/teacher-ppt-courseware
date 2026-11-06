// -*- coding: utf-8 -*-
/**
 * 双 AST 契约测试 (schema_contract.test.js)
 *
 * 项目把 LessonPlan / Presentation 的 JSON Schema 作为对外契约, 但此前 schema
 * 从未被代码或测试加载, 产出的 AST 甚至违反了 deck_meta.additionalProperties。
 * 本测试让契约真正可执行:
 *   1. 所有金样教学设计必须通过 lesson-plan.schema.json;
 *   2. 金样经 PagePlanner 规划后的表现 AST 必须通过 presentation.schema.json;
 *   3. schema 的 layout / element 枚举必须与 Layout Registry 完全一致,
 *      防止"新增版式只改代码、忘了改契约"。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import Ajv2020 from "ajv/dist/2020.js";
import { planPresentationFromLesson } from "../../plugin/skills/lesson-courseware/lib_js/presentation/lesson_to_presentation.js";
import { LAYOUT_IDS, ELEMENT_TYPES } from "../../plugin/skills/lesson-courseware/lib_js/presentation/layout_registry.js";
import { RENDER_LAYOUT_IDS } from "../../plugin/skills/lesson-courseware/lib_js/rendering/renderers/index.js";

const ROOT = process.cwd();
const GOLDEN_DIR = path.join(ROOT, "acceptance", "lesson_plans");
const SCHEMA_DIR = path.join(
  ROOT, "plugin", "skills", "lesson-courseware", "references", "schemas"
);

const ajv = new Ajv2020({ allErrors: true, strict: false });

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), "utf-8"));
}

function formatErrors(errors) {
  return (errors || [])
    .slice(0, 12)
    .map(e => `${e.instancePath || "/"} ${e.message}`)
    .join("\n");
}

const goldenFiles = fs.readdirSync(GOLDEN_DIR)
  .filter(f => f.endsWith(".json"))
  .sort();

test("LessonPlan 契约: 全部金样必须通过 lesson-plan.schema.json", () => {
  const validate = ajv.compile(loadSchema("lesson-plan.schema.json"));
  assert.ok(goldenFiles.length > 0, "至少需要 1 份金样教学设计");

  for (const file of goldenFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, file), "utf-8"));
    const valid = validate(data);
    assert.equal(valid, true, `[${file}] 违反 LessonPlan 契约:\n${formatErrors(validate.errors)}`);
  }
});

test("Presentation 契约: 规划产物必须通过 presentation.schema.json", () => {
  const validate = ajv.compile(loadSchema("presentation.schema.json"));

  for (const file of goldenFiles) {
    const lessonPlan = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, file), "utf-8"));
    const presentation = planPresentationFromLesson(lessonPlan, {});
    const valid = validate(presentation);
    assert.equal(valid, true, `[${file}] 违反 Presentation 契约:\n${formatErrors(validate.errors)}`);
  }
});

test("契约枚举: schema 的 layout / element 枚举必须与 Layout Registry 同构", () => {
  const schema = loadSchema("presentation.schema.json");
  const schemaLayouts = schema.properties.slides.items.properties.layout.enum;
  const schemaElements = schema.properties.slides.items.properties.elements.items.properties.type.enum;

  assert.deepEqual(
    [...schemaLayouts].sort(),
    [...LAYOUT_IDS].sort(),
    "presentation.schema.json 的 layout 枚举与 Layout Registry 不一致"
  );
  assert.deepEqual(
    [...schemaElements].sort(),
    [...ELEMENT_TYPES].sort(),
    "presentation.schema.json 的 element type 枚举与 Layout Registry 不一致"
  );
});

test("渲染注册表: 每个 layout 必须且只能有一个 renderer", () => {
  assert.deepEqual(
    [...RENDER_LAYOUT_IDS].sort(),
    [...LAYOUT_IDS].sort(),
    "rendering/renderers/index.js 与 presentation/layout_registry.js 的版式集合不一致"
  );
});
