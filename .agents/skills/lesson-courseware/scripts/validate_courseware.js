#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 课件 JSON 三层确定性校验门禁 (validate_courseware.js) - 纯 Node.js
 *
 * Tier 1  结构: 信封 Schema + 逐页必填字段 + 图元参数 + 讲稿备注
 * Tier 2  归属: 知识点白名单(仅可引用本单元 point_id) + 课时归属
 * Tier 3  溯源: 数域上界拦截(数学) + 教材页码范围核验
 *
 * 用法:
 *   node validate_courseware.js --input courseware.json
 *   node validate_courseware.js --input courseware.json --quiet
 * --quiet 只精简修复提示, 不会隐藏 warnings; 知识库定位失败一律判 fail(fail-closed)。
 * 退出码: 0=通过; 1=存在 error。
 */

import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";
import { findKbRoot } from "../lib_js/kb_locate.js";
import { validate } from "../lib_js/deck_schema.js";

const KB_ROOT = findKbRoot();
const SUBJECTS = {
  math: "primary-math",
  chinese: "primary-chinese",
  english: "primary-english"
};

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return yaml.load(fs.readFileSync(filePath, "utf-8")) || {};
  } catch {
    return {};
  }
}

function loadUnitFacts(meta) {
  if (!KB_ROOT) {
    return {
      error: "未找到教材知识库目录(设置 COURSEWARE_KNOWLEDGE_DIR 或安装到含 plugin/knowledge 的项目)"
    };
  }

  const { subject, grade, term, unit_id } = meta || {};
  if (!subject || !grade || !term || !unit_id) {
    return {
      error: "metadata 缺少 subject/grade/term/unit_id, 无法进行知识库核对"
    };
  }

  const base = path.join(KB_ROOT, "curriculum", SUBJECTS[subject] || "", `grade-${grade}-${term}`);
  const m = String(unit_id).match(/(\d+)$/);
  if (!m) {
    return { error: `非法 unit_id 格式: ${unit_id}` };
  }

  const unitNum = parseInt(m[1], 10);
  const unitDir = path.join(base, `unit-${String(unitNum).padStart(2, "0")}`);
  if (!fs.existsSync(unitDir)) {
    return { error: `知识库中不存在该单元目录: ${unitDir}` };
  }

  const unitMeta = loadYaml(path.join(unitDir, "metadata.yaml"));
  const kpsDoc = loadYaml(path.join(unitDir, "knowledge_points.yaml"));
  const lessonsDoc = loadYaml(path.join(unitDir, "lessons.yaml"));

  const kpIds = new Set((kpsDoc.points || []).map(p => p.point_id).filter(Boolean));
  const lessonIds = new Set((lessonsDoc.lessons || []).map(l => String(l.lesson_id)).filter(Boolean));
  const points = kpsDoc.points || [];

  return { unitMeta, kpIds, lessonIds, points, error: null };
}

// 媒体文件路径相对课件 JSON 所在目录或当前工作目录解析; 找不到时渲染器会降级成占位卡片
function checkMediaPaths(data, baseDir) {
  const out = [];
  (data.slides || []).forEach(slide => {
    const fig = slide.figure;
    if (!fig || !fig.path || /^https?:\/\//.test(String(fig.path))) return;
    const p = String(fig.path);
    const candidates = [path.resolve(baseDir, p), path.resolve(process.cwd(), p)];
    if (!candidates.some(c => fs.existsSync(c))) {
      out.push({
        code: "MEDIA_FILE_NOT_FOUND",
        severity: "warning",
        slide_id: slide.slide_id || null,
        message: `媒体文件不存在: ${p}`,
        hint: "media.path 会相对课件 JSON 所在目录或 cwd 解析; 缺失时渲染器只能画占位卡片, 请补齐文件或改用 link。"
      });
    }
  });
  return out;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let inputPath = "";
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === "--quiet") {
      quiet = true;
    }
  }

  if (!inputPath) {
    console.error("用法: node validate_courseware.js --input <courseware.json> [--quiet]");
    process.exit(1);
  }

  return { inputPath, quiet };
}

function main() {
  const { inputPath, quiet } = parseArgs();

  if (!fs.existsSync(inputPath)) {
    console.log(JSON.stringify({
      status: "invalid_input",
      message: `无法读取课件 JSON: 文件不存在 ${inputPath}`
    }, null, 2));
    process.exit(1);
  }

  let raw = fs.readFileSync(inputPath, "utf-8");
  // 移除 BOM
  if (raw.charCodeAt(0) === 0xFEFF) {
    raw = raw.slice(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.log(JSON.stringify({
      status: "invalid_input",
      message: `无法解析课件 JSON: ${err.message}`
    }, null, 2));
    process.exit(1);
  }

  const facts = loadUnitFacts(data.metadata || {});
  let kbErrors = [];
  let result;

  if (facts.error) {
    // fail-closed: 知识库核对不上时绝不静默放行, 否则伪造 point_id / 超纲数字可绕过 Tier2/3
    kbErrors.push({
      code: "KB_LOCATE_FAILED",
      severity: "error",
      message: facts.error,
      hint: "Tier2/3 知识库核对无法进行, 已拒绝通过; 请检查 COURSEWARE_KNOWLEDGE_DIR 或 metadata 的 subject/grade/term/unit_id。"
    });
    result = validate(data);
  } else {
    result = validate(data, facts.unitMeta, facts.kpIds, facts.lessonIds, facts.points);
  }

  const mediaWarnings = checkMediaPaths(data, path.dirname(path.resolve(inputPath)));
  const errors = [...result.errors, ...kbErrors];
  const warnings = [...result.warnings, ...mediaWarnings];
  const status = errors.length === 0 ? "pass" : "fail";

  const out = {
    status,
    input: inputPath,
    errors,
    // warnings 恒定输出: 静默吞掉警告曾让「知识库未找到」在标准交付链路里彻底消失
    warnings,
    summary: {
      error_count: errors.length,
      warning_count: warnings.length
    }
  };

  if (errors.length > 0 && !quiet) {
    out.repair_hint = "逐条修复 errors 后重新运行本命令; 修改时只改内容字段, slide_id/type/结构字段保持稳定。";
  }

  console.log(JSON.stringify(out, null, 1));
  process.exit(errors.length === 0 ? 0 : 1);
}

main();
