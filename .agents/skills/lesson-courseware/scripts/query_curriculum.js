#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 课时课件素材包查询工具 (query_curriculum.js) - 纯 Node.js
 *
 * 从五层教材知识库中提取"一课时"的课件创作素材包:
 *   教材例题(lessons.yaml) + 知识点/教学目标/边界(knowledge_points.yaml)
 *   + 教参重难点/典型错因/变式策略(teaching_reference.yaml) + 练习蓝图摘要(question_blueprints.yaml)
 *
 * 用法:
 *   node query_curriculum.js --prompt "三年级上册数学第四单元第1课时"
 *   node query_curriculum.js --subject math --grade 3 --term term-1 --unit unit-4 --lesson 1
 *   node query_curriculum.js --list-units --subject math --grade 3 --term term-1
 *   node query_curriculum.js --search "口算乘法"
 */

import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";
import { findKbRoot } from "../lib_js/kb_locate.js";
import { runAutoUpdateCheck } from "../lib_js/auto_updater.js";

const KB_ROOT = findKbRoot();

const SUBJECTS = {
  math: "primary-math",
  chinese: "primary-chinese",
  english: "primary-english"
};

const SUBJECT_ALIAS = {
  "数学": "math", "math": "math",
  "语文": "chinese", "chinese": "chinese",
  "英语": "english", "english": "english"
};

const CN_NUM = {
  "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
  "六": 6, "七": 7, "八": 8, "九": 9, "十": 10
};

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf-8")) || null;
  } catch {
    return null;
  }
}

function lessonNum(lessonId) {
  const m = String(lessonId || "").match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export function parsePrompt(prompt) {
  const out = { subject: null, grade: null, term: null, unit: null, lesson: null };
  const p = prompt.toLowerCase();

  for (const [alias, sub] of Object.entries(SUBJECT_ALIAS)) {
    if (p.includes(alias) || prompt.includes(alias)) {
      out.subject = sub;
      break;
    }
  }

  const mGrade = prompt.match(/([1-6一二三四五六])\s*年级/);
  if (mGrade) {
    out.grade = CN_NUM[mGrade[1]] || parseInt(mGrade[1], 10);
  }

  if (/上册|上学期|秋季|秋学期/.test(prompt)) {
    out.term = "term-1";
  } else if (/下册|下学期|春季|春学期/.test(prompt)) {
    out.term = "term-2";
  }

  const mUnit = prompt.match(/第\s*([1-9一二三四五六七八九十]+)\s*单元/);
  if (mUnit) {
    const raw = mUnit[1];
    const num = CN_NUM[raw] || (raw.match(/^[1-9]+$/) ? parseInt(raw, 10) : null);
    if (num) {
      out.unit = `unit-${num}`;
    }
  }

  const mPeriod = prompt.match(/第\s*([1-9一二三四五六七八九十]+)\s*课时/);
  if (mPeriod) {
    const raw = mPeriod[1];
    const num = CN_NUM[raw] || (raw.match(/^[1-9]+$/) ? parseInt(raw, 10) : null);
    if (num) out.lesson = num;
  } else {
    // 语文/英语习惯: "第5课" (排除"第5课文")
    const mLesson = prompt.match(/第\s*([1-9一二三四五六七八九十]+)\s*课(?!文)/);
    if (mLesson) {
      const raw = mLesson[1];
      const num = CN_NUM[raw] || (raw.match(/^[1-9]+$/) ? parseInt(raw, 10) : null);
      if (num) out.lesson = num;
    }
  }

  out.missing_fields = ["subject", "grade", "term", "unit"].filter(k => !out[k]);
  return out;
}

export function resolveUnit(subject, grade, term, unit) {
  if (!KB_ROOT) return { unitEntry: null, status: "not_found", manifest: null };

  const manifestPath = path.join(KB_ROOT, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { unitEntry: null, status: "not_found", manifest: null };

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const subjectEntry = manifest.subjects?.[subject];
  if (!subjectEntry) return { unitEntry: null, status: "not_found", manifest };

  const gradeEntry = subjectEntry.grades?.[`grade-${grade}`];
  if (!gradeEntry) return { unitEntry: null, status: "not_found", manifest };

  const termEntry = gradeEntry[term] || gradeEntry.terms?.[term];
  if (!termEntry) return { unitEntry: null, status: "not_found", manifest };

  const units = termEntry.units || [];
  if (unit === null || unit === undefined) {
    return { unitEntry: { _units: units }, status: "ambiguous", manifest };
  }

  const raw = String(unit).trim();
  const mNum = raw.match(/^unit[-_]?(\d+)$/i) || raw.match(/^(\d+)$/);
  if (mNum) {
    const want = parseInt(mNum[1], 10);
    for (const u of units) {
      const mU = String(u.unit_id || "").match(/(\d+)$/);
      if (mU && parseInt(mU[1], 10) === want) {
        return { unitEntry: u, status: "ok", manifest };
      }
    }
  }

  const mCn = raw.match(/第\s*([1-9一二三四五六七八九十]+)\s*单元/);
  if (mCn) {
    const num = CN_NUM[mCn[1]] || (mCn[1].match(/^\d+$/) ? parseInt(mCn[1], 10) : null);
    if (num) {
      for (const u of units) {
        if (new RegExp(`第\\s*${num}\\s*单元`).test(u.unit_name || "")) {
          return { unitEntry: u, status: "ok", manifest };
        }
      }
    }
  }

  // 名称关键词模糊回退
  for (const u of units) {
    if (raw && (u.unit_name || "").includes(raw)) {
      return { unitEntry: u, status: "ok", manifest };
    }
  }

  return { unitEntry: null, status: "not_found", manifest };
}

function loadUnitPack(subject, grade, term, unitEntry) {
  const d = unitEntry.dir || "";
  const rel = d.startsWith("knowledge")
    ? path.relative("knowledge", d)
    : path.join("curriculum", SUBJECTS[subject], `grade-${grade}-${term}`, path.basename(d));

  const base = path.join(KB_ROOT, rel);
  const pack = { dir: base };

  for (const name of ["metadata", "lessons", "knowledge_points", "teaching_reference", "question_blueprints"]) {
    pack[name] = loadYaml(path.join(base, `${name}.yaml`));
  }
  return pack;
}

export function buildMaterialPack(subject, grade, term, unit, lesson = null) {
  const { unitEntry, status } = resolveUnit(subject, grade, term, unit);

  if (status === "not_found") {
    return {
      status: "not_found",
      message: `知识库中未找到该单元: subject=${subject} grade=${grade} term=${term} unit=${unit}`,
      hint: "可用 --list-units 查看该册全部单元, 或改用 --search 按关键词检索。"
    };
  }

  if (status === "ambiguous") {
    const units = unitEntry._units || [];
    return {
      status: "need_clarification",
      missing_fields: ["unit"],
      candidates: units.map(u => ({
        unit_id: u.unit_id,
        unit_name: u.unit_name,
        status: u.status
      }))
    };
  }

  const pack = loadUnitPack(subject, grade, term, unitEntry);
  const meta = pack.metadata || {};
  const lessonsDoc = pack.lessons || {};
  const kpsDoc = pack.knowledge_points || {};
  const trDoc = pack.teaching_reference || {};
  const bpDoc = pack.question_blueprints || {};

  const lessons = lessonsDoc.lessons || [];
  const kps = kpsDoc.points || [];
  const trs = trDoc.teaching_references || [];

  const result = {
    status: "ok",
    resolution: {
      subject,
      grade,
      term,
      unit_id: meta.unit_id,
      unit_name: meta.unit_name,
      dir: path.relative(KB_ROOT, pack.dir)
    },
    unit: {
      verification_status: meta.verification_status || unitEntry.status,
      edition: meta.edition,
      page_range: meta.page_range,
      unit_overview: meta.unit_overview,
      curriculum_standard_ref: meta.curriculum_standard_ref,
      numeric_upper_bound: meta.numeric_upper_bound,
      evidence_note: meta.page_evidence_note
    },
    lessons_index: lessons.map(l => ({
      lesson_id: l.lesson_id,
      lesson_number: l.lesson_number,
      lesson_name: l.lesson_name,
      page_range: l.page_range
    })),
    material_source: {
      lessons: "lessons.yaml(教材例题原文)",
      knowledge_points: "knowledge_points.yaml(教学目标/边界/溯源)",
      teaching_reference: "teaching_reference.yaml(教参重难点/典型错因/变式策略)",
      question_blueprints: "question_blueprints.yaml(练习蓝图摘要)"
    }
  };

  if (lesson !== null && lesson !== undefined) {
    let target = null;
    if (typeof lesson === "number") {
      target = lessons.find(l => parseInt(l.lesson_number || 0, 10) === lesson);
      if (!target) {
        target = lessons.find(l => String(l.lesson_name || "").includes(`第${lesson}课`));
      }
    }
    if (!target && typeof lesson === "string") {
      target = lessons.find(l => String(l.lesson_name || "").includes(lesson));
    }

    if (!target) {
      return {
        status: "need_clarification",
        message: `该单元下未定位到课时: ${lesson}`,
        numbering_note: "语文/英语的 lesson_number 是教材课文序号(如'第5课'), 数学是课时序号; 请从 lessons_index 中选择, 或用课时名称关键词。",
        lessons_index: result.lessons_index
      };
    }

    const lnum = target.lesson_number;
    const related = kps.filter(kp =>
      lessonNum(kp.lesson_id) === lessonNum(target.lesson_id) ||
      lessonNum(kp.lesson_id) === lnum
    );
    const kpIds = new Set(related.map(kp => kp.point_id));
    const relatedTr = trs.filter(tr => kpIds.has(tr.point_id));

    result.lesson = target;
    result.knowledge_points = related;
    result.teaching_reference = relatedTr;
    if (!related.length) {
      result.caveat = "该课时无直接对应知识点时, 请基于单元知识点与教材例题创作, 并在 evidence 中如实标注。";
    }
  } else {
    result.knowledge_points = kps;
    result.teaching_reference = trs;
  }

  if (bpDoc && Array.isArray(bpDoc.blueprints)) {
    result.question_blueprint_summary = bpDoc.blueprints.slice(0, 1).map(b => ({
      blueprint_id: b.blueprint_id,
      title: b.title,
      difficulty_ratio: b.difficulty_ratio,
      slots: (b.question_slots || []).map(s => ({
        section: s.section,
        question_type: s.question_type,
        difficulty: s.difficulty,
        item_count: s.item_count,
        target_points: s.target_points,
        guidelines: s.guidelines
      }))
    }));
  }

  if (!result.caveat && result.unit.verification_status === "partial") {
    result.caveat = "本单元核验状态为 partial: 素材可供课件创作, 但须在课件页脚注明'内容依据人教版教材整理', 并提示教师课前核对。";
  }

  return result;
}

export function listUnits(subject, grade, term) {
  const { unitEntry, status } = resolveUnit(subject, grade, term, null);
  if (status === "not_found") {
    return { status: "not_found", message: `无该册记录: ${subject} ${grade} ${term}` };
  }
  return {
    status: "ok",
    subject,
    grade,
    term,
    units: (unitEntry._units || []).map(u => ({
      unit_id: u.unit_id,
      unit_name: u.unit_name,
      status: u.status
    }))
  };
}

export function search(keyword) {
  const hits = [];
  if (!KB_ROOT) return { status: "error", message: "未找到知识库根目录" };

  for (const subDir of Object.values(SUBJECTS)) {
    const root = path.join(KB_ROOT, "curriculum", subDir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;

    for (const gt of fs.readdirSync(root)) {
      const gtPath = path.join(root, gt);
      if (!fs.statSync(gtPath).isDirectory()) continue;

      for (const u of fs.readdirSync(gtPath)) {
        const uPath = path.join(gtPath, u);
        if (!fs.statSync(uPath).isDirectory()) continue;

        const meta = loadYaml(path.join(uPath, "metadata.yaml")) || {};
        const lessons = (loadYaml(path.join(uPath, "lessons.yaml")) || {}).lessons || [];
        const kps = (loadYaml(path.join(uPath, "knowledge_points.yaml")) || {}).points || [];

        const kw = keyword.toLowerCase();
        for (const l of lessons) {
          if (String(l.lesson_name || "").toLowerCase().includes(kw)) {
            hits.push({
              match_type: "lesson",
              matched_name: l.lesson_name,
              subject: meta.subject,
              grade: meta.grade,
              term: meta.term,
              unit_id: meta.unit_id,
              unit_name: meta.unit_name,
              lesson_id: l.lesson_id,
              lesson_number: l.lesson_number
            });
          }
        }

        for (const p of kps) {
          if (String(p.point_name || "").toLowerCase().includes(kw)) {
            hits.push({
              match_type: "knowledge_point",
              matched_name: p.point_name,
              subject: meta.subject,
              grade: meta.grade,
              term: meta.term,
              unit_id: meta.unit_id,
              unit_name: meta.unit_name,
              point_id: p.point_id
            });
          }
        }
      }
    }
  }

  return {
    status: "ok",
    query: keyword,
    total_hits: hits.length,
    hits: hits.slice(0, 15)
  };
}

function parseCli() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (["list-units"].includes(key)) {
        params[key] = true;
      } else if (args[i + 1] && !args[i + 1].startsWith("--")) {
        params[key] = args[i + 1];
        i++;
      } else {
        params[key] = true;
      }
    }
  }
  return params;
}

function main() {
  runAutoUpdateCheck();
  const params = parseCli();

  if (params.search) {
    console.log(JSON.stringify(search(params.search), null, 2));
    return;
  }

  if (params["list-units"]) {
    let { subject, grade, term } = params;
    if (params.prompt) {
      const parsed = parsePrompt(params.prompt);
      subject = subject || parsed.subject;
      grade = grade || parsed.grade;
      term = term || parsed.term;
    }
    if (!subject || !grade || !term) {
      console.log(JSON.stringify({
        status: "error",
        message: "--list-units 需要 --subject, --grade, --term (或用 --prompt 提供上下文)"
      }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify(listUnits(subject, parseInt(grade, 10), term), null, 2));
    return;
  }

  let subject = params.subject;
  let grade = params.grade ? parseInt(params.grade, 10) : null;
  let term = params.term;
  let unit = params.unit;
  let lesson = params.lesson ? (isNaN(params.lesson) ? params.lesson : parseInt(params.lesson, 10)) : null;

  if (params.prompt) {
    const parsed = parsePrompt(params.prompt);
    subject = subject || parsed.subject;
    grade = grade || parsed.grade;
    term = term || parsed.term;
    unit = unit || parsed.unit;
    lesson = lesson ?? parsed.lesson;

    if (parsed.missing_fields.length > 0) {
      console.log(JSON.stringify({
        status: "need_clarification",
        message: `提示词缺少关键信息: ${parsed.missing_fields.join(", ")}`,
        parsed,
        hint: "请在自然语言中包含 学科/年级/册次/单元 (例如: '三年级上册数学第四单元第1课时')"
      }, null, 2));
      process.exit(0);
    }
  }

  if (!subject || !grade || !term || !unit) {
    console.log(JSON.stringify({
      status: "error",
      message: "缺少必要参数: 需提供 --prompt 或同时提供 --subject, --grade, --term, --unit",
      usage: "node query_curriculum.js --prompt '三年级上册数学第四单元第1课时'"
    }, null, 2));
    process.exit(1);
  }

  const result = buildMaterialPack(subject, grade, term, unit, lesson);
  console.log(JSON.stringify(result, null, 2));
}

main();
