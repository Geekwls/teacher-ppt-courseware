// -*- coding: utf-8 -*-
/**
 * 教材知识库覆盖率与健康度审计工具 (audit_kb.js)
 *
 * 核心指标:
 * 1. 学期覆盖度: 小学人教版标准 32 个学期 (语 12 + 数 12 + 英 8);
 * 2. 单元质量分布: verified (完全校验) vs partial (部分收录);
 * 3. 课时完备度: 检测是否有低于 500B 的骨架占位 lessons.yaml。
 */

import fs from "fs";
import path from "path";
import { load } from "js-yaml";

const ROOT_DIR = path.resolve(".");
const KB_DIR = path.join(ROOT_DIR, "plugin", "knowledge", "curriculum");

// 人教版小学标准 32 学期定义 (英语 3 年级起步)
const STANDARD_TERMS = {
  "primary-math": [
    "grade-1-term-1", "grade-1-term-2",
    "grade-2-term-1", "grade-2-term-2",
    "grade-3-term-1", "grade-3-term-2",
    "grade-4-term-1", "grade-4-term-2",
    "grade-5-term-1", "grade-5-term-2",
    "grade-6-term-1", "grade-6-term-2"
  ],
  "primary-chinese": [
    "grade-1-term-1", "grade-1-term-2",
    "grade-2-term-1", "grade-2-term-2",
    "grade-3-term-1", "grade-3-term-2",
    "grade-4-term-1", "grade-4-term-2",
    "grade-5-term-1", "grade-5-term-2",
    "grade-6-term-1", "grade-6-term-2"
  ],
  "primary-english": [
    "grade-3-term-1", "grade-3-term-2",
    "grade-4-term-1", "grade-4-term-2",
    "grade-5-term-1", "grade-5-term-2",
    "grade-6-term-1", "grade-6-term-2"
  ]
};

function audit() {
  if (!fs.existsSync(KB_DIR)) {
    console.error(`知识库根目录不存在: ${KB_DIR}`);
    process.exit(1);
  }

  const report = {
    total_standard_terms: 32,
    existing_terms_count: 0,
    missing_terms_count: 0,
    missing_terms: {},
    units_total: 0,
    verified_units: 0,
    partial_units: 0,
    placeholder_lessons_count: 0,
    placeholder_lessons: []
  };

  for (const [subjectKey, expectedTerms] of Object.entries(STANDARD_TERMS)) {
    const subjDir = path.join(KB_DIR, subjectKey);
    const existingTerms = fs.existsSync(subjDir)
      ? fs.readdirSync(subjDir).filter(f => f.startsWith("grade-"))
      : [];

    const existingSet = new Set(existingTerms);
    const missing = expectedTerms.filter(t => !existingSet.has(t));

    report.existing_terms_count += existingTerms.length;
    report.missing_terms_count += missing.length;
    if (missing.length) {
      report.missing_terms[subjectKey] = missing;
    }

    // 扫描现有单元
    for (const term of existingTerms) {
      const termDir = path.join(subjDir, term);
      const units = fs.readdirSync(termDir).filter(u => u.startsWith("unit-"));
      for (const unit of units) {
        report.units_total++;
        const unitDir = path.join(termDir, unit);
        const metaPath = path.join(unitDir, "metadata.yaml");
        if (fs.existsSync(metaPath)) {
          try {
            const meta = load(fs.readFileSync(metaPath, "utf8"));
            const status = String(meta?.verification_status || "").replace(/['"]/g, "");
            if (status === "verified") {
              report.verified_units++;
            } else {
              report.partial_units++;
            }
          } catch (_) {
            report.partial_units++;
          }
        }

        const lessonsPath = path.join(unitDir, "lessons.yaml");
        if (fs.existsSync(lessonsPath)) {
          const stat = fs.statSync(lessonsPath);
          if (stat.size < 500) {
            report.placeholder_lessons_count++;
            report.placeholder_lessons.push(`${subjectKey}/${term}/${unit} (${stat.size}B)`);
          }
        }
      }
    }
  }

  return report;
}

const rep = audit();
console.log("==================================================");
console.log("       教材知识库健康度与覆盖率审计报告");
console.log("==================================================");
console.log(`人教版标准学期覆盖: ${rep.existing_terms_count} / ${rep.total_standard_terms} (${((rep.existing_terms_count/rep.total_standard_terms)*100).toFixed(1)}%)`);
console.log(`缺失学期总数: ${rep.missing_terms_count} 个`);

for (const [subj, list] of Object.entries(rep.missing_terms)) {
  console.log(`  - ${subj} 缺 ${list.length} 个: ${list.join(", ")}`);
}

console.log("--------------------------------------------------");
console.log(`单元总数: ${rep.units_total}`);
console.log(`  - 完全校验单元 (verified): ${rep.verified_units}`);
console.log(`  - 部分收录单元 (partial): ${rep.partial_units}`);
console.log(`  - 课时待扩充单元 (lessons < 500B): ${rep.placeholder_lessons_count}`);
console.log("==================================================");
