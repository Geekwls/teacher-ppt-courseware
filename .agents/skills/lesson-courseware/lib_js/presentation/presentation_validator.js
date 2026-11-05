// -*- coding: utf-8 -*-
/**
 * 课件表现抽象语法树校验器 (presentation_validator.js)
 *
 * 核心职责 (结构、元素与时间线合法性门禁):
 * 1. 契约 Schema 规范校验: schema_version, deck_meta, slides;
 * 2. ID 唯一性与闭环:
 *    - slide_id 全局唯一;
 *    - 每一页内 element.id 唯一;
 * 3. 图元参数完整性:
 *    - figure_number_line 必须具备 start/end/step 与合法的 arcs;
 * 4. 显式 Timeline 引用合法性 (核心防线):
 *    - target 必须精准指向本页存在的元素 ID 或已注册的子图元 ID;
 *    - action 必须为受控的动作枚举 (show / reveal / hide);
 *    - step 必须从 0 开始单调递增;
 * 5. 教师讲稿完备性: notes 字段必填且具有教学内容。
 */

function issue(code, message, severity = "error", slideId = null, hint = null) {
  const item = { code, message, severity };
  if (slideId) item.slide_id = slideId;
  if (hint) item.hint = hint;
  return item;
}

const SUPPORTED_LAYOUTS = new Set([
  "title_cover",
  "objectives_card",
  "context_problem",
  "model_left_reasoning_right",
  "example_step_by_step",
  "misconception_split",
  "practice_list",
  "answer_reveal_list",
  "reading_focus",
  "character_practice",
  "summary_card",
  "board_design",
  "homework_card",
  "activity_instruction",
  "comparison_table",
  "knowledge_tree",
  "phase_placeholder",
  "end_cover"
]);

const SUPPORTED_ELEMENT_TYPES = new Set([
  "title",
  "subtitle",
  "text_card",
  "equation",
  "figure_number_line",
  "figure_tianzige",
  "figure_animation",
  "card_list",
  "tier_list",
  "activity_card",
  "comparison_table",
  "tree_graph",
  "conclusion_banner",
  "practice_list",
  "answer_feedback"
]);

const SUPPORTED_ACTIONS = new Set(["show", "reveal", "hide"]);

export function validatePresentation(data) {
  const issues = [];

  if (!data || typeof data !== "object") {
    return {
      status: "fail",
      errors: [issue("INVALID_JSON", "Presentation AST 必须是有效的 JSON 对象")],
      warnings: [],
      summary: { error_count: 1, warning_count: 0 }
    };
  }

  // 1. Schema 基础
  if (!data.schema_version || !/^1\.\d+\.\d+$/.test(String(data.schema_version))) {
    issues.push(issue("SCHEMA_VERSION_INVALID", "必须指定合法的 schema_version (如 1.0.0)"));
  }
  if (!data.deck_meta || typeof data.deck_meta !== "object") {
    issues.push(issue("DECK_META_REQUIRED", "必须包含 deck_meta 元数据对象"));
  }

  const slides = Array.isArray(data.slides) ? data.slides : [];
  if (slides.length === 0) {
    issues.push(issue("SLIDES_EMPTY", "课件至少包含 1 页幻灯片 (slides)"));
  }

  const slideIds = new Set();

  slides.forEach((slide, sIdx) => {
    const sId = slide.slide_id;
    if (!sId) {
      issues.push(issue("SLIDE_ID_REQUIRED", `第 ${sIdx + 1} 页缺少 slide_id`, "error"));
      return;
    }
    if (slideIds.has(sId)) {
      issues.push(issue("SLIDE_ID_DUPLICATE", `检测到重复的 slide_id: [${sId}]`, "error", sId));
    }
    slideIds.add(sId);

    // 布局支持检查
    if (!SUPPORTED_LAYOUTS.has(slide.layout)) {
      issues.push(issue(
        "LAYOUT_UNSUPPORTED",
        `页面 [${sId}] 使用了未知或不支持的布局: ${slide.layout}`,
        "error",
        sId,
        `支持的布局枚举: ${[...SUPPORTED_LAYOUTS].join(", ")}`
      ));
    }

    // 教师讲稿检查
    if (!slide.notes || String(slide.notes).trim().length < 5) {
      issues.push(issue("SPEAKER_NOTES_MISSING", `页面 [${sId}] 缺少充分的教师授课讲稿 (notes)`, "error", sId));
    }

    // 元素与子图元 ID 收集
    const validTargets = new Set();
    const elemIds = new Set();
    const elements = Array.isArray(slide.elements) ? slide.elements : [];

    elements.forEach((elem, eIdx) => {
      const eId = elem.id;
      if (!eId) {
        issues.push(issue("ELEMENT_ID_REQUIRED", `页面 [${sId}] 第 ${eIdx + 1} 个元素缺少 id`, "error", sId));
        return;
      }
      if (elemIds.has(eId)) {
        issues.push(issue("ELEMENT_ID_DUPLICATE", `页面 [${sId}] 内出现重复的 element.id: [${eId}]`, "error", sId));
      }
      elemIds.add(eId);
      validTargets.add(eId);

      // 图元类型检查
      if (!SUPPORTED_ELEMENT_TYPES.has(elem.type)) {
        issues.push(issue("ELEMENT_TYPE_UNKNOWN", `未知元素类型 [${elem.type}]`, "error", sId));
      }

      // 数轴子图元 ID 注册 (如 nl_01.axis, nl_01.arc_1)
      if (elem.type === "figure_number_line") {
        validTargets.add(`${eId}.axis`);
        const arcs = elem.properties?.arcs || [];
        arcs.forEach((arc, aIdx) => {
          const arcId = arc.id || `arc_${aIdx + 1}`;
          validTargets.add(`${eId}.${arcId}`);
        });
      }

      // 答案卡片子图元 ID 注册 (如 ans_1.stem, ans_1.explanation)
      if (elem.type === "answer_feedback") {
        validTargets.add(`${eId}.stem`);
        validTargets.add(`${eId}.explanation`);
      }
    });

    // Timeline 时间线校验
    const timeline = Array.isArray(slide.timeline) ? slide.timeline : [];
    let lastStep = -1;

    timeline.forEach((stepItem, tIdx) => {
      if (typeof stepItem.step !== "number" || stepItem.step < 0) {
        issues.push(issue("TIMELINE_STEP_INVALID", `页面 [${sId}] timeline 第 ${tIdx + 1} 项 step 必须为非负整数`, "error", sId));
      } else if (stepItem.step < lastStep) {
        issues.push(issue("TIMELINE_STEP_NON_MONOTONIC", `页面 [${sId}] timeline step 顺序混乱: ${stepItem.step} < ${lastStep}`, "error", sId));
      }
      lastStep = Math.max(lastStep, stepItem.step || 0);

      if (!SUPPORTED_ACTIONS.has(stepItem.action)) {
        issues.push(issue(
          "TIMELINE_ACTION_UNSUPPORTED",
          `页面 [${sId}] 动画动作不支持: [${stepItem.action}]`,
          "error",
          sId,
          `允许动作: ${[...SUPPORTED_ACTIONS].join(", ")}`
        ));
      }

      if (!stepItem.target) {
        issues.push(issue("TIMELINE_TARGET_REQUIRED", `页面 [${sId}] timeline 项缺少 target`, "error", sId));
      } else if (!validTargets.has(stepItem.target)) {
        issues.push(issue(
          "TIMELINE_TARGET_NOT_FOUND",
          `页面 [${sId}] timeline 引用的 target [${stepItem.target}] 在本页元素中未定义`,
          "error",
          sId,
          `本页可用 targets: ${[...validTargets].join(", ")}`
        ));
      }
    });
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
