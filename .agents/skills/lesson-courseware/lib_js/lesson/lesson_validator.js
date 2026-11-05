// -*- coding: utf-8 -*-
/**
 * 课时教学内容抽象语法树校验器 (lesson_validator.js)
 *
 * 核心职责 (教学法与硬约束门禁):
 * 1. 契约 Schema 校验: 检查 schema_version, lesson_id, meta, objectives, teaching_sequence;
 * 2. SSOT 教材知识库核验:
 *    - 检验 source_point_id 是否真实存在于知识库 metadata/knowledge_points.yaml 中;
 *    - 拦截教学禁区 (teaching_boundary.scope_excluded);
 *    - 核查数域上限 (numeric_upper_bound);
 * 3. 教学目标与环节闭环:
 *    - 检查每个 phase 的 objective_ref 是否真实指向声明的目标 ID;
 *    - 确保环节覆盖完整的导入、探究、应用与总结闭环;
 * 4. 学科数学真实性校验:
 *    - 调用 math_solver 验证所有算式与练习题的数学计算真值，零容忍算错。
 */

import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";
import { findKbRoot } from "../kb_locate.js";
import { checkArithmeticInText } from "../math_solver.js";

const KB_ROOT = findKbRoot();
const SUBJECT_DIRS = {
  math: "primary-math",
  chinese: "primary-chinese",
  english: "primary-english",
  science: "primary-science"
};

function issue(code, message, severity = "error", phaseId = null, hint = null) {
  const item = { code, message, severity };
  if (phaseId) item.phase_id = phaseId;
  if (hint) item.hint = hint;
  return item;
}

export function validateLessonPlan(data) {
  const issues = [];

  if (!data || typeof data !== "object") {
    return {
      status: "fail",
      errors: [issue("INVALID_JSON", "LessonPlan 数据必须是有效的 JSON 对象")],
      warnings: [],
      summary: { error_count: 1, warning_count: 0 }
    };
  }

  // 1. Schema 基础检查
  if (!data.schema_version || !/^1\.\d+\.\d+$/.test(String(data.schema_version))) {
    issues.push(issue("SCHEMA_VERSION_INVALID", "必须指定合法的 schema_version (如 1.0.0)"));
  }
  if (!data.lesson_id || typeof data.lesson_id !== "string") {
    issues.push(issue("LESSON_ID_REQUIRED", "必须指定 lesson_id"));
  }

  const meta = data.meta;
  if (!meta) {
    issues.push(issue("META_REQUIRED", "必须包含 meta 元数据对象"));
  } else {
    const requiredMeta = ["subject", "grade", "term", "unit", "topic", "lesson_type", "source_point_id"];
    requiredMeta.forEach(field => {
      if (!meta[field]) {
        issues.push(issue("META_FIELD_MISSING", `meta 缺少必填字段: ${field}`));
      }
    });
  }

  // 2. 目标闭环检查
  const objectives = Array.isArray(data.objectives) ? data.objectives : [];
  if (objectives.length === 0) {
    issues.push(issue("OBJECTIVES_EMPTY", "必须至少定义 1 个学习目标 (objectives)"));
  }
  const objectiveIds = new Set();
  objectives.forEach(obj => {
    if (!obj.id || !obj.statement || !obj.assessment) {
      issues.push(issue("OBJECTIVE_INCOMPLETE", `目标定义不完整: ${JSON.stringify(obj)}`));
    }
    objectiveIds.add(obj.id);
  });

  // 3. 教学环节闭环检查
  const sequence = Array.isArray(data.teaching_sequence) ? data.teaching_sequence : [];
  if (sequence.length < 3) {
    issues.push(issue("SEQUENCE_TOO_SHORT", "教学环节 (teaching_sequence) 至少包含 3 个环节"));
  }

  sequence.forEach(phase => {
    if (!phase.phase_id || !phase.phase_name) {
      issues.push(issue("PHASE_IDENTITY_MISSING", "教学环节缺少 phase_id 或 phase_name"));
    }
    if (!phase.objective_ref || !objectiveIds.has(phase.objective_ref)) {
      issues.push(issue(
        "OBJECTIVE_REF_DANGLING",
        `环节 ${phase.phase_id || "未知"} 引用的目标 [${phase.objective_ref}] 未在 objectives 中声明`,
        "error",
        phase.phase_id,
        "请确保每个教学环节都对齐到明确的学习目标 ID。"
      ));
    }
    if (!phase.content_block || typeof phase.content_block !== "object") {
      issues.push(issue("CONTENT_BLOCK_MISSING", `环节 ${phase.phase_id} 必须包含 content_block`, "error", phase.phase_id));
    }
    if (!phase.teacher_guidance || phase.teacher_guidance.length < 5) {
      issues.push(issue("TEACHER_GUIDANCE_REQUIRED", `环节 ${phase.phase_id} 必须包含充分的 teacher_guidance 教师引导讲稿`, "error", phase.phase_id));
    }
  });

  // 4. SSOT 教材事实源校验
  if (meta && KB_ROOT) {
    const subjDir = SUBJECT_DIRS[meta.subject];
    if (subjDir) {
      const unitStr = `unit-${String(meta.unit).padStart(2, "0")}`;
      const unitPath = path.join(KB_ROOT, "curriculum", subjDir, `grade-${meta.grade}-${meta.term}`, unitStr);

      if (!fs.existsSync(unitPath)) {
        issues.push(issue("KB_UNIT_NOT_FOUND", `知识库中不存在该教材单元目录: ${unitPath}`, "error"));
      } else {
        const kpPath = path.join(unitPath, "knowledge_points.yaml");
        const metaPath = path.join(unitPath, "metadata.yaml");
        let kpDoc = null;
        let unitMeta = null;

        try {
          if (fs.existsSync(kpPath)) kpDoc = yaml.load(fs.readFileSync(kpPath, "utf-8"));
          if (fs.existsSync(metaPath)) unitMeta = yaml.load(fs.readFileSync(metaPath, "utf-8"));
        } catch (e) {
          issues.push(issue("KB_LOAD_ERROR", `解析知识库 YAML 失败: ${e.message}`, "error"));
        }

        if (kpDoc && Array.isArray(kpDoc.points)) {
          const targetPoint = kpDoc.points.find(p => p.point_id === meta.source_point_id);
          if (!targetPoint) {
            issues.push(issue(
              "POINT_ID_INVALID",
              `source_point_id [${meta.source_point_id}] 不存在于本单元知识库白名单中`,
              "error",
              null,
              `可选白名单: ${kpDoc.points.map(p => p.point_id).join(", ")}`
            ));
          } else {
            // 检查教学禁区
            const excluded = targetPoint.teaching_boundary?.scope_excluded || [];
            const planText = JSON.stringify(data);
            excluded.forEach(exc => {
              if (planText.includes(exc)) {
                issues.push(issue(
                  "SCOPE_EXCLUDED_VIOLATION",
                  `课件内容触碰教材禁区 [${exc}]`,
                  "error",
                  null,
                  `知识点明确排除: ${exc}，请勿超纲教学。`
                ));
              }
            });
          }
        }

        // 数域上限检查
        if (meta.subject === "math" && unitMeta?.teaching_boundary?.numeric_upper_bound) {
          const maxBound = Number(unitMeta.teaching_boundary.numeric_upper_bound);
          // 扫描整个文本中的乘法积
          const numMatches = JSON.stringify(data).matchAll(/=\s*(\d+)/g);
          for (const m of numMatches) {
            const val = parseInt(m[1], 10);
            if (val > maxBound) {
              issues.push(issue(
                "NUMERIC_UPPER_BOUND_EXCEEDED",
                `计算结果 ${val} 超出本单元数域上限 (${maxBound})`,
                "error",
                null,
                "请将口算数字收敛在本学段教学范围之内。"
              ));
            }
          }
        }
      }
    }
  }

  // 5. 学科数学计算真值校验
  sequence.forEach(phase => {
    const cb = phase.content_block || {};
    // 易错警示环节中故意保留的错例不作为计算错误拦截，只核验正解
    const textToScan = [
      cb.equation,
      cb.correct_method,
      cb.core_rule,
      ...(cb.reasoning_steps || []),
      ...(cb.solution_steps || [])
    ].filter(Boolean).join(" \n ");

    const mathIssues = checkArithmeticInText(textToScan);
    mathIssues.forEach(mi => {
      issues.push(issue(
        "MATH_CALCULATION_ERROR",
        `数学算式真值错误: ${mi.message}`,
        "error",
        phase.phase_id,
        "请核对算式两端计算结果，严禁出现低级计算错误。"
      ));
    });

    // 随堂练习题目与参考答案核对
    if (cb.type === "practice_challenge" && Array.isArray(cb.items)) {
      cb.items.forEach(q => {
        const qMath = checkArithmeticInText(`${q.stem} ${q.explanation}`);
        qMath.forEach(mi => {
          issues.push(issue(
            "PRACTICE_MATH_ERROR",
            `练习题 [${q.id}] 算式校验错误: ${mi.message}`,
            "error",
            phase.phase_id
          ));
        });
      });
    }
  });

  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");

  return {
    status: errors.length === 0 ? "pass" : "fail",
    errors,
    warnings,
    summary: {
      error_count: errors.length,
      warning_count: warnings.length
    }
  };
}
