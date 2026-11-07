// -*- coding: utf-8 -*-
/**
 * 金样教学设计查找工具 (golden_lessons.js)
 *
 * acceptance/lesson_plans/ 按学科分域 (math/ chinese/ english/) 后,
 * 平铺 readdir 不再适用 —— 这里提供统一的递归枚举与按 caseId 查找。
 * caseId = 文件名去 .json (不含子路径), 跨学科由命名规范保证唯一。
 */

import fs from "fs";
import path from "path";

/** 递归枚举目录下全部 .json 教学设计 (确定性排序: 相对路径字典序) */
export function listGoldenLessonPlans(goldenDir) {
  const out = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".json")) {
        out.push(full);
      }
    }
  })(goldenDir);
  return out;
}

/** 按 caseId (文件名去 .json) 查找教学设计文件; 未命中返回 null */
export function findGoldenLessonPlan(goldenDir, caseId) {
  const target = `${caseId}.json`;
  return listGoldenLessonPlans(goldenDir).find(p => path.basename(p) === target) || null;
}
