// -*- coding: utf-8 -*-
/**
 * 教材知识库覆盖率与健康度审计工具 (audit_kb.js)
 *
 * 核心指标:
 * 1. 学期覆盖度: 小学人教版标准 32 个学期 (语 12 + 数 12 + 英 8);
 * 2. 单元质量分布: verified (完全校验) vs partial (部分收录);
 * 3. 课时完备度: 检测是否有低于 500B 的骨架占位 lessons.yaml;
 * 4. 结构完整性 (--strict 门禁): 核心 YAML 可解析、元数据必填、point_id 单元内/全局唯一。
 *
 * 用法:
 *   node scripts/audit_kb.js            # 覆盖率报告, 结构错误只展示不阻断
 *   node scripts/audit_kb.js --strict   # 结构错误非 0 时退出码 1 (CI / npm test 门禁)
 *
 * 注意: 覆盖率尚未 100% 是已知状态, 不作为 --strict 失败条件;
 *       只有"数据坏了/引用了不存在的知识点"这类结构性问题才阻断。
 */

import fs from "fs";
import path from "path";
import { load } from "js-yaml";

const ROOT_DIR = path.resolve(".");
const KB_DIR = path.join(ROOT_DIR, "plugin", "knowledge", "curriculum");
const STRICT = process.argv.includes("--strict");

const CORE_FILES = [
  "metadata.yaml",
  "knowledge_points.yaml",
  "lessons.yaml",
  "teaching_reference.yaml",
  "question_blueprints.yaml"
];

const REQUIRED_METADATA_KEYS = [
  "unit_id", "unit_name", "subject", "grade", "term", "verification_status", "source_id"
];

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

function parseYamlFile(filePath, relPath, errors) {
  try {
    return load(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    errors.push(`${relPath}: YAML 解析失败 - ${err.message}`);
    return null;
  }
}

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
    placeholder_lessons: [],
    point_ids_total: 0,
    structural_errors: []
  };

  const globalPointIds = new Map();

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
        const relUnit = `${subjectKey}/${term}/${unit}`;

        // 1) 核心文件齐备
        for (const fileName of CORE_FILES) {
          if (!fs.existsSync(path.join(unitDir, fileName))) {
            report.structural_errors.push(`${relUnit}: 缺少核心文件 ${fileName}`);
          }
        }

        // 2) metadata 必填字段
        const metaPath = path.join(unitDir, "metadata.yaml");
        if (fs.existsSync(metaPath)) {
          const meta = parseYamlFile(metaPath, `${relUnit}/metadata.yaml`, report.structural_errors);
          if (meta && typeof meta === "object") {
            const status = String(meta?.verification_status || "").replace(/['"]/g, "");
            if (status === "verified") {
              report.verified_units++;
            } else {
              report.partial_units++;
            }
            for (const key of REQUIRED_METADATA_KEYS) {
              if (meta[key] === undefined || meta[key] === null || meta[key] === "") {
                report.structural_errors.push(`${relUnit}: metadata 缺少必填字段 ${key}`);
              }
            }
          }
        }

        // 3) knowledge_points: points 数组、point_id 非空且全局唯一
        const kpPath = path.join(unitDir, "knowledge_points.yaml");
        if (fs.existsSync(kpPath)) {
          const kp = parseYamlFile(kpPath, `${relUnit}/knowledge_points.yaml`, report.structural_errors);
          const points = Array.isArray(kp?.points) ? kp.points : null;
          if (!points || points.length === 0) {
            report.structural_errors.push(`${relUnit}: knowledge_points.points 必须是非空数组`);
          } else {
            const localIds = new Set();
            for (const point of points) {
              const pointId = point?.point_id;
              if (!pointId || typeof pointId !== "string") {
                report.structural_errors.push(`${relUnit}: 存在缺少 point_id 的知识点`);
                continue;
              }
              if (localIds.has(pointId)) {
                report.structural_errors.push(`${relUnit}: point_id 单元内重复 ${pointId}`);
              }
              localIds.add(pointId);
              if (globalPointIds.has(pointId)) {
                report.structural_errors.push(`${relUnit}: point_id 全局重复 ${pointId} (已存在于 ${globalPointIds.get(pointId)})`);
              } else {
                globalPointIds.set(pointId, relUnit);
              }
            }
          }
        }

        // 4) 其余核心 YAML 必须可解析
        for (const fileName of ["lessons.yaml", "teaching_reference.yaml", "question_blueprints.yaml"]) {
          const filePath = path.join(unitDir, fileName);
          if (fs.existsSync(filePath)) {
            parseYamlFile(filePath, `${relUnit}/${fileName}`, report.structural_errors);
          }
        }

        // 5) 课时骨架占位检测
        const lessonsPath = path.join(unitDir, "lessons.yaml");
        if (fs.existsSync(lessonsPath)) {
          const stat = fs.statSync(lessonsPath);
          if (stat.size < 500) {
            report.placeholder_lessons_count++;
            report.placeholder_lessons.push(`${relUnit} (${stat.size}B)`);
          }
        }
      }
    }
  }

  report.point_ids_total = globalPointIds.size;
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
console.log(`  - 知识点总数: ${rep.point_ids_total}`);
console.log(`  - 课时待扩充单元 (lessons < 500B): ${rep.placeholder_lessons_count}`);
console.log("--------------------------------------------------");
console.log(`结构完整性: ${rep.structural_errors.length === 0 ? "✓ 0 错误" : `✗ ${rep.structural_errors.length} 个错误`}`);
for (const err of rep.structural_errors.slice(0, 20)) {
  console.log(`  - ${err}`);
}
if (rep.structural_errors.length > 20) {
  console.log(`  ... 其余 ${rep.structural_errors.length - 20} 条省略`);
}
console.log("==================================================");

if (STRICT && rep.structural_errors.length > 0) {
  process.exit(1);
}
