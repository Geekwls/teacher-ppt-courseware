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

// 数域扫描时跳过的「非教学数值」字段: 标识符、元数据、坐标、媒体路径、时长
const NUMBER_SCAN_SKIP_KEYS = new Set([
  "schema_version", "lesson_id", "phase_id", "objective_ref", "source_point_id",
  "point_id", "textbook_page", "page_refs", "_no", "duration_sec", "duration",
  "duration_minutes", "term", "unit", "grade", "lesson_type", "subject",
  "x", "y", "w", "h", "width", "height", "fontSize", "page", "kind", "type",
  "model_type", "show_result", "show_answers", "interaction_mode",
  "path", "link", "url", "reveal_mode", "reveal_steps"
]);

/**
 * 知识库词条归一化: 词条常带括注与书名号修饰, 如
 * "整十数乘整十数（三年级下册）" / "「增加了几倍」的表述" / "旧版篇目《赠刘景文》（『擎雨盖』等）"。
 * 课件正文不会写出括注, 原样子串匹配会 100% 漏检, 因此生成多个候选变体参与匹配。
 */
function excludedTermVariants(term) {
  const raw = String(term || "").trim();
  if (!raw) return [];
  const noBracket = raw
    .replace(/[（(][^（）()]*[）)]/g, "")
    .replace(/\s+/g, "")
    .trim();
  const noQuote = noBracket.replace(/[「」『』“”"]/g, "").trim();
  return Array.from(new Set([raw, noBracket, noQuote])).filter(Boolean);
}

/** 教学禁区防误杀匹配: 区分词法边界，避免排除"分数"误杀"百分数"等复合词 */
export function isScopeExcludedHit(text, term) {
  if (!text || !term) return false;

  return excludedTermVariants(term).some(variant => {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let prefixNeg = "";
    if (variant === "分数") {
      prefixNeg = "(?<!百)";
    } else if (variant === "除法") {
      prefixNeg = "(?<!消|免)";
    } else if (variant === "角") {
      prefixNeg = "(?<!视|主|配|豆|三|拐)";
    }

    const isAscii = /^[A-Za-z0-9_-]+$/.test(variant);
    const pattern = isAscii
      ? new RegExp(`\\b${escaped}\\b`, "i")
      : new RegExp(`${prefixNeg}${escaped}`, "u");

    return pattern.test(text);
  });
}

/** 递归收集教学数值 (移植自旧管线 deck_schema.js, 全字段覆盖而非只查等号结果) */
function collectNumbers(node, out, key = "") {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (NUMBER_SCAN_SKIP_KEYS.has(key)) return;
  if (typeof node === "number") {
    if (Number.isFinite(node)) out.push(Math.floor(node));
    return;
  }
  if (typeof node === "string") {
    // 标识符字符串 (math-g3-t1-u04-p01 / phase_01 / obj_2 等) 不参与数域扫描
    if (/^(?:s\d+|unit-?\d+|l\d+|obj[\s_-]|phase[\s_-]|math-|chi-|eng-|cw-)/i.test(node)) return;
    const matches = node.match(/\d+/g);
    if (matches) for (const m of matches) out.push(parseInt(m, 10));
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectNumbers(v, out, key);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) collectNumbers(v, out, k);
  }
}

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

        let targetPoint = null;
        if (kpDoc && Array.isArray(kpDoc.points)) {
          targetPoint = kpDoc.points.find(p => p.point_id === meta.source_point_id);
          if (!targetPoint) {
            issues.push(issue(
              "POINT_ID_INVALID",
              `source_point_id [${meta.source_point_id}] 不存在于本单元知识库白名单中`,
              "error",
              null,
              `可选白名单: ${kpDoc.points.map(p => p.point_id).join(", ")}`
            ));
          } else {
            // 检查教学禁区: 呈现内容 error 一票否决; 讲稿 teacher_guidance 按 warning 提示(避免计划性提醒被误杀)
            const excluded = targetPoint.teaching_boundary?.scope_excluded || [];
            if (excluded.length > 0) {
              const collectTexts = node => {
                const out = [];
                (function walk(n) {
                  if (typeof n === "string") {
                    out.push(n);
                  } else if (Array.isArray(n)) {
                    n.forEach(walk);
                  } else if (n && typeof n === "object") {
                    for (const [k, v] of Object.entries(n)) {
                      if (!NUMBER_SCAN_SKIP_KEYS.has(k)) walk(v);
                    }
                  }
                })(node);
                return out.join("\n");
              };

              (data.teaching_sequence || []).forEach(phase => {
                const bodyText = collectTexts(phase.content_block || {});
                const guidanceText = typeof phase.teacher_guidance === "string" ? phase.teacher_guidance : "";

                excluded.forEach(exc => {
                  if (isScopeExcludedHit(bodyText, exc)) {
                    issues.push(issue(
                      "SCOPE_EXCLUDED_VIOLATION",
                      `课件内容触碰教材禁区 [${exc}]`,
                      "error",
                      phase.phase_id,
                      `知识点明确排除: ${exc}，请勿超纲教学。`
                    ));
                  } else if (isScopeExcludedHit(guidanceText, exc)) {
                    issues.push(issue(
                      "SCOPE_EXCLUDED_IN_GUIDANCE",
                      `讲稿提及教材禁区 [${exc}]`,
                      "warning",
                      phase.phase_id,
                      `该表述若为“本课不涉及”式的排除性提醒可忽略; 若确要讲授需改为本单元范围内。`
                    ));
                  }
                });
              });
            }
          }
        }

        // 数域上限检查: 递归覆盖 content_block 全部教学字段(算理步骤/例题/易错/板书/练习/模型参数),
        // 讲稿 teacher_guidance 含页码与步骤编号, 单独按 warning 处理, 避免误阻断正常创作。
        // 注: 知识库 metadata.yaml 或 targetPoint 均可声明 numeric_upper_bound。
        const rawUpperBound = unitMeta?.numeric_upper_bound ??
          unitMeta?.teaching_boundary?.numeric_upper_bound ??
          targetPoint?.teaching_boundary?.numeric_upper_bound;
        if (meta.subject === "math" && rawUpperBound) {
          const maxBound = Number(rawUpperBound);
          (data.teaching_sequence || []).forEach(phase => {
            const reported = new Set();
            const scan = (node, severity) => {
              const nums = [];
              collectNumbers(node, nums);
              const over = Array.from(new Set(nums.filter(n => n > maxBound)));
              over.forEach(val => {
                if (reported.has(val)) return;
                reported.add(val);
                issues.push(issue(
                  "NUMERIC_UPPER_BOUND_EXCEEDED",
                  `数值 ${val} 超出本单元数域上限 (${maxBound})`,
                  severity,
                  phase.phase_id,
                  "请将口算数字收敛在本学段教学范围之内。"
                ));
              });
            };
            scan(phase.content_block, "error");
            if (phase.teacher_guidance) scan({ teacher_guidance: phase.teacher_guidance }, "warning");
          });
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
