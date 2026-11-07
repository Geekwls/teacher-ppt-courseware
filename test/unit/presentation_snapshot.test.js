// -*- coding: utf-8 -*-
/**
 * 表现层 AST 快照回归 (presentation_snapshot.test.js)
 *
 * 目的: 锁住 PagePlanner + PresentationAssembler 的确定性输出。
 * 版式注册表、内容包、拆页策略等重构只要语义不变, 快照就必须逐字节一致;
 * 若确属有意的行为变更, 运行 `npm run test:update-snapshots` 并人工审阅 diff。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { buildSnapshot } from "../../scripts/lib/presentation_snapshot.js";
import { findGoldenLessonPlan } from "../../scripts/lib/golden_lessons.js";

const ROOT = process.cwd();
const GOLDEN_DIR = path.join(ROOT, "acceptance", "lesson_plans");
const SNAPSHOT_DIR = path.join(ROOT, "test", "snapshots", "presentations");

const cases = fs.readdirSync(SNAPSHOT_DIR)
  .filter(f => f.endsWith(".json"))
  .sort()
  .map(f => f.replace(/\.json$/, ""));

test("表现 AST 快照: 金样结构、元素与讲稿必须与基线一致", () => {
  assert.ok(cases.length > 0, "至少需要 1 份快照");

  for (const caseId of cases) {
    const goldenPath = findGoldenLessonPlan(GOLDEN_DIR, caseId);
    assert.ok(goldenPath, `[${caseId}] 在 ${GOLDEN_DIR} 下找不到对应金样教学设计`);
    const lessonPlan = JSON.parse(fs.readFileSync(goldenPath, "utf-8"));
    const expected = JSON.parse(
      fs.readFileSync(path.join(SNAPSHOT_DIR, `${caseId}.json`), "utf-8")
    );
    const actual = buildSnapshot(lessonPlan);

    assert.deepEqual(
      actual,
      expected,
      `[${caseId}] 表现 AST 与基线不一致。若为有意变更, 运行 npm run test:update-snapshots 并审阅 diff。`
    );
  }
});
