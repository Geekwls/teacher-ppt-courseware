#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 表现层 AST 结构快照生成器 (update_snapshots.js)
 *
 * 用途: 锁住 PagePlanner + PresentationAssembler 的确定性输出。
 * 重构版式注册表/渲染器拆分时, 只要快照不变, 就说明 AST 语义没有漂移。
 *
 * 用法:
 *   node scripts/update_snapshots.js          # 生成/更新快照
 *   node --test test/unit/presentation_snapshot.test.js   # 校验快照
 */

import fs from "fs";
import path from "path";
import { buildSnapshot } from "./lib/presentation_snapshot.js";
import { listGoldenLessonPlans } from "./lib/golden_lessons.js";

const ROOT = process.cwd();
const GOLDEN_DIR = path.join(ROOT, "acceptance", "lesson_plans");
const SNAPSHOT_DIR = path.join(ROOT, "test", "snapshots", "presentations");

function main() {
  if (!fs.existsSync(GOLDEN_DIR)) {
    console.error(`金样目录不存在: ${GOLDEN_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const files = listGoldenLessonPlans(GOLDEN_DIR);
  for (const filePath of files) {
    const caseId = path.basename(filePath).replace(/\.json$/, "");
    const lessonPlan = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const snapshot = buildSnapshot(lessonPlan);
    const outPath = path.join(SNAPSHOT_DIR, `${caseId}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
    console.log(`✓ ${path.relative(ROOT, outPath)} (${snapshot.slides.length} 页)`);
  }
  console.log(`\n共生成 ${files.length} 份快照。`);
}

main();
