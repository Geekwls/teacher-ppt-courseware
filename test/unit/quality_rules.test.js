// -*- coding: utf-8 -*-
/**
 * 质量规则包加载测试 (quality_rules.test.js)
 *
 * 规则从代码下沉到 YAML 后, 必须证明加载链路真的生效, 而不是读不到文件静默跳过。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  getTypoRules,
  getScopeExceptions,
  getNumberScanPolicy
} from "../../plugin/skills/lesson-courseware/lib_js/quality/rules.js";
import { isScopeExcludedHit } from "../../plugin/skills/lesson-courseware/lib_js/lesson/lesson_validator.js";

test("质量规则包: 错别字/禁区例外/扫描策略必须从 YAML 成功加载", () => {
  const typos = getTypoRules();
  assert.ok(typos.some(rule => rule.wrong === "赋子" && rule.right === "赋予"), "错别字规则缺失");

  const scope = getScopeExceptions();
  assert.deepEqual(scope.get("分数"), ["百"]);
  assert.deepEqual(scope.get("除法"), ["消", "免"]);
  assert.deepEqual(scope.get("角"), ["视", "主", "配", "豆", "三", "拐"]);

  const scan = getNumberScanPolicy();
  assert.ok(scan.skipKeys.has("lesson_id"));
  assert.ok(scan.skipKeys.has("fontSize"));
  assert.ok(scan.idPatterns.length > 0);
});

test("质量规则包: 边界例外仍按预期防误杀", () => {
  assert.equal(isScopeExcludedHit("百分数", "分数"), false);
  assert.equal(isScopeExcludedHit("分数乘法", "分数"), true);
  assert.equal(isScopeExcludedHit("消除法", "除法"), false);
  assert.equal(isScopeExcludedHit("除法竖式", "除法"), true);
  assert.equal(isScopeExcludedHit("视角", "角"), false);
  assert.equal(isScopeExcludedHit("直角", "角"), true);
});
