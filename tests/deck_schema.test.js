// -*- coding: utf-8 -*-
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { checkStructure, checkSemantics, validate } from "../plugin/skills/lesson-courseware/lib_js/deck_schema.js";

function getValidDeck() {
  const raw = fs.readFileSync("acceptance/math_g3_u4_l01_courseware.json", "utf8");
  return JSON.parse(raw);
}

test("deck_schema: 真实金样课件完全通过结构与语义校验", () => {
  const deck = getValidDeck();
  const unitMeta = { numeric_upper_bound: 10000 };
  const kpIds = new Set(["math-g3-t1-u04-p01"]);

  const res = validate(deck, unitMeta, kpIds);
  assert.equal(res.errors.length, 0);
});

test("deck_schema: 缺失必填字段触发结构拦截", () => {
  const badDeck = getValidDeck();
  delete badDeck.metadata.subject;

  const structIssues = checkStructure(badDeck);
  assert.equal(structIssues.length > 0, true);
  assert.equal(structIssues[0].code, "SCHEMA_VIOLATION");
});

test("deck_schema: 非法自创未知字段触发拦截", () => {
  const badDeck = getValidDeck();
  badDeck.slides[0].unknown_magic_field = "hack";

  const structIssues = checkStructure(badDeck);
  assert.equal(structIssues.some(i => i.code === "SCHEMA_VIOLATION"), true);
});

test("deck_schema: 知识点白名单拦截未收录的 point_id", () => {
  const deck = getValidDeck();
  deck.curriculum_evidence.referenced_knowledge_points = ["unknown-point-id"];

  const unitMeta = { numeric_upper_bound: 10000 };
  const kpIds = new Set(["math-g3-t1-u04-p01"]); // 白名单仅允许 p01

  const semIssues = checkSemantics(deck, unitMeta, kpIds);
  const kpIssue = semIssues.find(i => i.code === "KP_NOT_IN_UNIT");
  assert.notEqual(kpIssue, undefined);
  assert.match(kpIssue.message, /引用了不属于本单元的知识点/);
});

test("deck_schema: 数学数域上限超出拦截", () => {
  const deck = getValidDeck();
  // 设置较小的上限 100，触发页面中 200/3000 的超界拦截
  const unitMeta = { numeric_upper_bound: 100 };
  const kpIds = new Set(["math-g3-t1-u04-p01"]);

  const semIssues = checkSemantics(deck, unitMeta, kpIds);
  const boundIssue = semIssues.find(i => i.code === "NUMBER_OVER_BOUND");
  assert.notEqual(boundIssue, undefined);
  assert.match(boundIssue.message, /超出本单元数域上界/);
});

test("deck_schema: 教学红线词 (scope_excluded) 硬拦截", () => {
  const deck = getValidDeck();
  deck.slides[1].title = "这里我们学习了连续进位笔算乘法";

  const unitMeta = { numeric_upper_bound: 10000 };
  const kpIds = new Set(["math-g3-t1-u04-p01"]);
  const points = [
    {
      point_id: "math-g3-t1-u04-p01",
      teaching_boundary: {
        scope_excluded: ["不涉及连续进位", "不提前教学两位数乘两位数"]
      }
    }
  ];

  const semIssues = checkSemantics(deck, unitMeta, kpIds, null, points);
  const redlineIssue = semIssues.find(i => i.code === "SCOPE_EXCLUDED_VIOLATION");
  assert.notEqual(redlineIssue, undefined);
  assert.match(redlineIssue.message, /教学边界明确排除/);
});
