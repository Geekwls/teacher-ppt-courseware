// -*- coding: utf-8 -*-
/**
 * 课件 JSON 契约数据模型与确定性检查 (deck_schema.js) - 基于 Ajv
 *
 * 分层:
 *   Tier 1  结构: 信封 Schema + 逐页必填字段 + 图元参数 + 讲稿备注
 *   Tier 2  归属: 知识点白名单(仅可引用本单元 point_id) + 课时归属
 *   Tier 3  溯源: 数域上界拦截(数学) + 教材页码范围核验
 */

import Ajv from "ajv";
import { validateSlideMathSemantics } from "./math_solver.js";

export const ENVELOPE_SCHEMA = {
  type: "object",
  required: ["deck_id", "metadata", "curriculum_evidence", "slides"],
  additionalProperties: false,
  properties: {
    deck_id: {
      type: "string",
      pattern: "^cw-(math|chinese|english)-g[1-6]-t[12]-u\\d+-(l\\d+|lall)$"
    },
    metadata: {
      type: "object",
      required: ["title", "subject", "grade", "term", "unit_id", "unit_name"],
      additionalProperties: false,
      properties: {
        title: { type: "string", minLength: 2, maxLength: 60 },
        subtitle: { type: "string", maxLength: 80 },
        subject: { enum: ["math", "chinese", "english"] },
        grade: { type: "integer", minimum: 1, maximum: 6 },
        term: { enum: ["term-1", "term-2"] },
        unit_id: { type: "string", pattern: "^unit-0?\\d+$" },
        unit_name: { type: "string" },
        lesson_id: { type: "string" },
        lesson_name: { type: "string" },
        class_period_label: { type: "string" },
        teacher_name: { type: "string" },
        school: { type: "string" },
        style: { enum: ["standard", "innovative"] }
      }
    },
    curriculum_evidence: {
      type: "object",
      required: ["curriculum_status", "evidence_summary"],
      additionalProperties: false,
      properties: {
        referenced_knowledge_points: { type: "array", items: { type: "string" } },
        lesson_ref: { type: "string" },
        curriculum_status: { enum: ["verified", "partial", "unverified", "missing"] },
        evidence_summary: { type: "string", minLength: 4 },
        page_refs: { type: "array", items: { type: ["string", "integer"] } }
      }
    },
    slides: {
      type: "array",
      minItems: 6,
      maxItems: 40,
      items: { $ref: "#/$defs/slide" }
    }
  },
  // 页面级字段白名单: 防止 Agent 自创字段后「校验通过但渲染静默忽略」
  $defs: {
    slide: {
      type: "object",
      required: ["type"],
      additionalProperties: false,
      properties: {
        type: { type: "string" },
        slide_id: { type: "string" },
        title: { type: "string" },
        subtitle: { type: "string" },
        meta_line: { type: "string" },
        message: { type: "string" },
        notes: { type: "string" },
        items: {
          type: "array",
          // 目标/导入/小结/作业页是纯字符串条目; 练习页是对象条目
          items: { anyOf: [{ type: "string" }, { $ref: "#/$defs/practiceItem" }] }
        },
        steps: { type: "array", items: { type: "string" } },
        callout: { type: "string" },
        problem: { type: "string" },
        solution_steps: { type: "array", items: { type: "string" } },
        answer: { type: "string" },
        wrong: { type: "string" },
        reason: { type: "string" },
        correct: { type: "string" },
        content: { type: "string" },
        show_answers: { type: "boolean" },
        interaction_mode: { type: "string" },
        // 课堂放映「播放步骤」: 默认 auto 自动推断; off 整页关闭; steps 指定该页合并成几步
        reveal_mode: { enum: ["auto", "off"] },
        reveal_steps: { type: "integer", minimum: 1, maximum: 8 },
        source: { $ref: "#/$defs/source" },
        figure: { $ref: "#/$defs/figure" }
      }
    },
    source: {
      type: "object",
      additionalProperties: false,
      properties: {
        point_id: { type: "string" },
        textbook_page: { type: ["string", "integer"] }
      }
    },
    practiceItem: {
      type: "object",
      additionalProperties: false,
      properties: {
        _no: { type: "integer" },
        stem: { type: "string" },
        answer: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        explanation: { type: "string" },
        analysis: { type: "string" },
        notes: { type: "string" },
        source: { $ref: "#/$defs/source" }
      }
    },
    figure: {
      type: "object",
      required: ["kind"],
      properties: { kind: { type: "string" } }
    }
  }
};

export const SLIDE_REQUIREMENTS = {
  cover: { required: ["title"], notes_required: false },
  objectives: { required: ["items"], notes_required: true },
  warmup: { required: ["items"], notes_required: true },
  concept: { required: ["steps"], notes_required: true },
  example: { required: ["problem", "solution_steps", "answer"], notes_required: true },
  misconception: { required: ["wrong", "reason", "correct"], notes_required: true },
  practice: { required: ["items"], notes_required: true },
  summary: { required: ["items"], notes_required: true },
  board: { required: ["content"], notes_required: false },
  homework: { required: ["items"], notes_required: true },
  end: { required: [], notes_required: false }
};

export const SLIDE_TYPES = new Set(Object.keys(SLIDE_REQUIREMENTS));
export const PRACTICE_ITEM_REQUIRED = ["stem", "answer"];

export const FIGURE_REQUIREMENTS = {
  vertical_calc: {
    required: ["operand_a", "operand_b", "operator"],
    optional: ["result", "show_result", "carries"],
    operators: ["+", "-", "×", "x", "*", "÷", "/"]
  },
  number_line: {
    required: ["start", "end", "step"],
    optional: ["marks", "label", "arcs"]
  },
  tianzige: {
    required: ["chars"],
    optional: ["pinyin"],
    max_items: 6
  },
  pinyin_line: {
    required: ["pairs"],
    pair_required: ["pinyin", "char"],
    max_pairs: 12
  },
  word_card: {
    required: ["cards"],
    card_required: ["word"],
    card_optional: ["phonetic", "meaning"],
    max_cards: 8
  },
  dialog_bubble: {
    required: ["lines"],
    line_required: ["speaker", "text"],
    max_lines: 8
  },
  place_value: {
    required: ["digits"],
    optional: ["label", "counters"],
    digit_keys: ["thousands", "hundreds", "tens", "ones"]
  },
  table: {
    required: ["headers", "rows"],
    optional: ["label"],
    max_rows: 8
  },
  media: {
    required: [],
    optional: ["path", "type", "title", "duration", "link", "url", "prompt", "cover"]
  },
  image: {
    required: ["path"],
    optional: ["alt", "caption"]
  },
  animation: {
    required: ["animation_type", "parameters"],
    optional: ["title", "duration_sec", "prompt", "conclusion", "path", "type", "cover"]
  }
};

export const FIGURE_KINDS = new Set(Object.keys(FIGURE_REQUIREMENTS));

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validateEnvelope = ajv.compile(ENVELOPE_SCHEMA);

function issue(code, message, severity = "error", slideId = null, hint = null) {
  const out = { code, severity, message };
  if (slideId) out.slide_id = slideId;
  if (hint) out.hint = hint;
  return out;
}

function extractNumbers(obj) {
  const out = [];
  if (typeof obj === "boolean") return out;
  if (typeof obj === "number") {
    out.push(Math.floor(obj));
  } else if (typeof obj === "string") {
    const matches = obj.match(/\d+/g);
    if (matches) {
      for (const m of matches) out.push(parseInt(m, 10));
    }
  } else if (Array.isArray(obj)) {
    for (const v of obj) out.push(...extractNumbers(v));
  } else if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) out.push(...extractNumbers(v));
  }
  return out;
}

// 数域扫描时跳过的「非教学数值」字段: 页码、布局坐标、媒体路径、标识符
const NUMBER_SCAN_SKIP_KEYS = new Set([
  "slide_id", "textbook_page", "page_refs", "_no", "duration_sec", "duration",
  "x", "y", "w", "h", "width", "height", "fontSize", "page", "kind", "type",
  "show_result", "show_answers", "interaction_mode", "path", "link", "url",
  "reveal_mode", "reveal_steps"
]);

function collectNumbers(node, out, key = "") {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (NUMBER_SCAN_SKIP_KEYS.has(key)) return;
  if (typeof node === "number") {
    if (Number.isFinite(node)) out.push(Math.floor(node));
    return;
  }
  if (typeof node === "string") {
    if (/^(?:s\d+|unit-?\d+|l\d+|math-|chi-|eng-|cw-)/i.test(node)) return;
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

// 卷面可见文本 (不含 notes 讲稿、source 溯源、slide_id 等技术字段)
function visibleTextOf(slide) {
  const VISIBLE_KEYS = [
    "title", "subtitle", "meta_line", "message", "items", "steps", "callout",
    "problem", "solution_steps", "answer", "wrong", "reason", "correct",
    "content", "figure"
  ];
  const parts = [];
  const walk = v => {
    if (typeof v === "string" || typeof v === "number") parts.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const k of VISIBLE_KEYS) {
    if (slide[k] !== undefined) walk(slide[k]);
  }
  return parts.join(" ");
}

function redlineKeywords(rule) {
  const text = String(rule || "")
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/^(?:不(?:涉及|要求|扩展|讲解|做|教|求)|暂不|严禁|不得|避免)[：:]?\s*/, "")
    .replace(/[，,；;].*$/, "")
    .replace(/\s+/g, "");
  const out = [];
  if (text.length >= 3) out.push(text);
  const core = text.replace(/^(?:任何|所有|涉及|超过|连续|两个或两个以上|带有|含有)/, "");
  if (core.length >= 4 && core !== text) out.push(core);
  return [...new Set(out)];
}

export function checkStructure(data) {
  const issues = [];

  // 1. 信封校验
  const valid = validateEnvelope(data);
  if (!valid && validateEnvelope.errors) {
    for (const err of validateEnvelope.errors) {
      const pathStr = err.instancePath || "<root>";
      let sid = null;
      if (pathStr.startsWith("/slides/")) {
        const parts = pathStr.split("/");
        const idx = parseInt(parts[2], 10);
        if (!isNaN(idx) && data.slides && data.slides[idx]) {
          sid = data.slides[idx].slide_id;
        }
      }
      issues.push(issue("SCHEMA_VIOLATION", `${pathStr}: ${err.message}`, "error", sid, "对照 references/courseware-json.md 修正结构。"));
    }
  }

  // 2. 逐页结构检查
  const slides = data?.slides;
  if (!Array.isArray(slides)) return issues;

  const seenIds = new Set();
  const seenContent = new Set();
  let nContent = 0;

  slides.forEach((slide, i) => {
    const sid = slide.slide_id || `slides[${i}]`;
    const stype = slide.type;

    if (!stype || !SLIDE_TYPES.has(stype)) {
      issues.push(issue("UNKNOWN_SLIDE_TYPE", `未知幻灯片类型: '${stype}'`, "error", sid, `合法类型: ${Array.from(SLIDE_TYPES).sort()}`));
      return;
    }

    const req = SLIDE_REQUIREMENTS[stype].required;
    for (const field of req) {
      const v = slide[field];
      if (v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length)) {
        issues.push(issue("MISSING_FIELD", `${stype} 缺少必填字段 '${field}'`, "error", sid));
      }
    }

    if (SLIDE_REQUIREMENTS[stype].notes_required && (!slide.notes || !String(slide.notes).trim())) {
      issues.push(issue("MISSING_NOTES", `${stype} 页缺少教师讲稿 notes`, "error", sid, "notes 渲染进 PPT 备注栏,是教师授课台词,不允许为空。"));
    } else if (SLIDE_REQUIREMENTS[stype].notes_required && String(slide.notes).trim().length < 20) {
      issues.push(issue("NOTES_TOO_SHORT", `${stype} 页讲稿仅 ${String(slide.notes).trim().length} 字, 不足以支撑授课`, "warning", sid, "讲稿应包含本页的教学动作、提问或追问路径。"));
    }

    // 整页内容重复 (复制粘贴 / 模型重复生成), slide_id 去重抓不到这种情况
    const contentSig = JSON.stringify([
      stype, slide.title, slide.items, slide.steps, slide.problem,
      slide.solution_steps, slide.content, slide.message, slide.wrong, slide.correct
    ]);
    if (seenContent.has(contentSig)) {
      issues.push(issue("DUPLICATE_SLIDE_CONTENT", `页面内容与前面某页完全相同: ${slide.title || stype}`, "warning", sid, "检查是否误复制了整页内容。"));
    }
    seenContent.add(contentSig);

    if (slide.slide_id) {
      if (seenIds.has(slide.slide_id)) {
        issues.push(issue("DUPLICATE_SLIDE_ID", `slide_id 重复: ${slide.slide_id}`, "error", sid));
      }
      seenIds.add(slide.slide_id);
    }

    if (slide.figure) {
      issues.push(...checkFigure(slide.figure, sid));
    }

    if (stype === "practice") {
      (slide.items || []).forEach((item, j) => {
        for (const field of PRACTICE_ITEM_REQUIRED) {
          if (!item || !item[field]) {
            issues.push(issue("PRACTICE_ITEM_INCOMPLETE", `练习第${j + 1}题缺少 '${field}'(答案渲染到答案页,卷面页不显示)`, "error", sid));
          }
        }
        if (item.options !== undefined && (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 6)) {
          issues.push(issue("PRACTICE_OPTIONS_INVALID", `练习第${j + 1}题 options 须为 2~6 项列表`, "error", sid));
        }
        // 选择题答案必须落在给定选项里
        if (Array.isArray(item.options) && item.answer) {
          const letter = String(item.answer).trim().charAt(0).toUpperCase();
          const letters = item.options.map(o => String(o).trim().charAt(0).toUpperCase());
          if (/^[A-F]$/.test(letter) && !letters.includes(letter)) {
            issues.push(issue("ANSWER_NOT_IN_OPTIONS", `练习第${j + 1}题答案为 '${letter}', 但选项中没有该选项`, "error", sid));
          }
        }
      });
    }

    if (["objectives", "concept", "example", "misconception", "practice", "summary", "homework", "warmup"].includes(stype)) {
      nContent++;
    }
  });

  if (nContent < 4) {
    issues.push(issue("TOO_FEW_CONTENT_SLIDES", `实质内容页仅 ${nContent} 页(<4), 一课时课件应至少包含目标/导入/新知/练习/小结`, "error", null, "参考 references/workflow.md 的标准课件结构。"));
  }

  return issues;
}

function checkFigure(fig, sid) {
  const issues = [];
  if (!fig || typeof fig !== "object") {
    return [issue("FIGURE_INVALID", "figure 须为对象", "error", sid)];
  }

  const kind = fig.kind;
  const spec = FIGURE_REQUIREMENTS[kind];
  if (!spec) {
    return [issue("UNKNOWN_FIGURE_KIND", `未知图元类型: '${kind}'`, "error", sid, `合法类型: ${Array.from(FIGURE_KINDS).sort()}`)];
  }

  for (const field of spec.required) {
    if (fig[field] === undefined || fig[field] === null || fig[field] === "" || (Array.isArray(fig[field]) && !fig[field].length)) {
      issues.push(issue("FIGURE_MISSING_FIELD", `图元 ${kind} 缺少参数 '${field}'`, "error", sid));
    }
  }

  if (kind === "vertical_calc" && !spec.operators.includes(String(fig.operator))) {
    issues.push(issue("FIGURE_BAD_OPERATOR", `竖式运算符须为 ${spec.operators}`, "error", sid));
  }

  if (kind === "tianzige") {
    const chars = fig.chars || [];
    if (Array.isArray(chars) && chars.length > spec.max_items) {
      issues.push(issue("FIGURE_TOO_MANY", `田字格一次最多 ${spec.max_items} 字`, "error", sid));
    }
    const py = fig.pinyin;
    if (py && Array.isArray(py) && py.length !== chars.length) {
      issues.push(issue("FIGURE_MISMATCH", "tianzige 的 pinyin 数量须与 chars 一致", "error", sid));
    }
  }

  if (kind === "pinyin_line") {
    const pairs = fig.pairs || [];
    if (pairs.length > spec.max_pairs) {
      issues.push(issue("FIGURE_TOO_MANY", `拼音行一次最多 ${spec.max_pairs} 对`, "error", sid));
    }
    pairs.forEach((pr, j) => {
      for (const field of spec.pair_required) {
        if (!pr[field]) {
          issues.push(issue("FIGURE_MISSING_FIELD", `拼音行第${j + 1}对缺少 '${field}'`, "error", sid));
        }
      }
    });
  }

  if (kind === "word_card") {
    const cards = fig.cards || [];
    if (cards.length > spec.max_cards) {
      issues.push(issue("FIGURE_TOO_MANY", `词卡一次最多 ${spec.max_cards} 张`, "error", sid));
    }
    cards.forEach((c, j) => {
      if (!c.word) {
        issues.push(issue("FIGURE_MISSING_FIELD", `词卡第${j + 1}张缺少 'word'`, "error", sid));
      }
    });
  }

  if (kind === "dialog_bubble") {
    const lines = fig.lines || [];
    if (lines.length > spec.max_lines) {
      issues.push(issue("FIGURE_TOO_MANY", `对话气泡一次最多 ${spec.max_lines} 句`, "error", sid));
    }
    lines.forEach((ln, j) => {
      for (const field of spec.line_required) {
        if (!ln[field]) {
          issues.push(issue("FIGURE_MISSING_FIELD", `对话第${j + 1}句缺少 '${field}'`, "error", sid));
        }
      }
    });
  }

  if (kind === "place_value") {
    const digits = fig.digits || {};
    for (const k of Object.keys(digits)) {
      if (!spec.digit_keys.includes(k)) {
        issues.push(issue("FIGURE_BAD_KEY", `place_value.digits 非法键 '${k}', 合法: ${spec.digit_keys}`, "error", sid));
      }
    }
  }

  // 动态媒体子引擎尚未接入主渲染链路; 没有真实媒体时只能出静态要点卡, 如实告知
  if (kind === "media" || kind === "animation") {
    if (!fig.path && !fig.link && !fig.url) {
      issues.push(issue("DYNAMIC_MEDIA_NOT_LINKED",
        `${kind} 图元未指定 path/link, 将渲染为静态演示要点卡而非视频`,
        "warning", sid, "如需动态演示, 请先生成 mp4 并填写 path, 或提供可点击的 link。"));
    }
  }

  if (kind === "table") {
    const rows = fig.rows || [];
    const headers = fig.headers || [];
    rows.forEach((r, j) => {
      if (Array.isArray(r) && headers.length && r.length !== headers.length) {
        issues.push(issue("FIGURE_MISMATCH", `表格第${j + 1}行列数(${r.length})与表头(${headers.length})不一致`, "error", sid));
      }
    });
    if (rows.length > spec.max_rows) {
      issues.push(issue("FIGURE_TOO_MANY", `表格最多 ${spec.max_rows} 行`, "error", sid));
    }
  }

  return issues;
}

export function checkSemantics(data, unitMeta = null, knowledgePointIds = null, lessonIds = null, points = null) {
  const issues = [];
  const meta = data?.metadata || {};
  const evidence = data?.curriculum_evidence || {};

  // 1. 知识点白名单检查
  const referenced = evidence.referenced_knowledge_points || [];
  if (knowledgePointIds) {
    const unknown = referenced.filter(p => !knowledgePointIds.has(p));
    if (unknown.length) {
      issues.push(issue("KP_NOT_IN_UNIT", `curriculum_evidence 引用了不属于本单元的知识点: ${JSON.stringify(unknown)}`, "error", null, "只能引用 query_curriculum.js 返回的 point_id。"));
    }
  }

  const slideKpRefs = [];
  (data.slides || []).forEach(slide => {
    const src = slide.source || {};
    if (src.point_id) {
      slideKpRefs.push({ sid: slide.slide_id, pid: src.point_id });
    }
    if (slide.type === "practice") {
      (slide.items || []).forEach(item => {
        if (item?.source?.point_id) {
          slideKpRefs.push({ sid: slide.slide_id, pid: item.source.point_id });
        }
      });
    }
  });

  if (knowledgePointIds) {
    for (const { sid, pid } of slideKpRefs) {
      if (!knowledgePointIds.has(pid)) {
        issues.push(issue("KP_NOT_IN_UNIT", `幻灯片溯源知识点 ${pid} 不在本单元白名单内`, "error", sid));
      }
    }
  }

  // 2. 课时归属检查
  if (lessonIds && meta.lesson_id) {
    if (!lessonIds.has(String(meta.lesson_id))) {
      issues.push(issue("LESSON_NOT_IN_UNIT", `lesson_id '${meta.lesson_id}' 不属于本单元课时集合`, "error", null, "lesson_id 须取自素材包 lessons_index。"));
    }
  }

  // 3. 数学数域上界拦截
  //    递归覆盖全部卷面字段(图元/算理步骤/例题/易错/板书/结论/练习), 不再只查 figure 与 practice;
  //    讲稿含页码与步骤编号, 单独按 warning 处理, 避免误阻断正常创作。
  const upper = unitMeta?.numeric_upper_bound;
  if (upper && meta.subject === "math") {
    const maxVal = parseInt(upper, 10);
    (data.slides || []).forEach(slide => {
      const sid = slide.slide_id;
      const { notes, ...visible } = slide;
      const nums = [];
      collectNumbers(visible, nums);
      const over = Array.from(new Set(nums.filter(n => n > maxVal)));
      if (over.length) {
        issues.push(issue("NUMBER_OVER_BOUND", `页面卷面出现超出本单元数域上界 ${upper} 的数: ${over.slice(0, 6)}`, "error", sid, "数学课件中的数不得超纲, 参考知识点 teaching_boundary.scope_allowed。"));
      }
      const noteNums = [];
      collectNumbers(notes, noteNums);
      const noteOver = Array.from(new Set(noteNums.filter(n => n > maxVal)));
      if (noteOver.length) {
        issues.push(issue("NUMBER_OVER_BOUND_IN_NOTES", `讲稿中出现疑似超纲数 ${noteOver.slice(0, 6)} (上界 ${upper})`, "warning", sid, "请核对讲稿中的数值是否超出本单元教学范围。"));
      }
    });
  }

  // 4. 教材页码范围核验
  const pageRange = unitMeta?.page_range;
  if (pageRange) {
    const m = String(pageRange).match(/P(\d+)-P(\d+)/);
    if (m) {
      const lo = parseInt(m[1], 10);
      const hi = parseInt(m[2], 10);
      (data.slides || []).forEach(slide => {
        const page = slide.source?.textbook_page;
        if (typeof page === "number" && (page < lo || page > hi)) {
          issues.push(issue("PAGE_OUT_OF_RANGE", `溯源页码 P${page} 超出单元页码范围 ${pageRange}`, "error", slide.slide_id));
        }
      });
    }
  }

  // 5. 学科边界红线拦截 (教学边界 scope_excluded 程序化硬校验)
  //    - 页面未写 source 时用全单元红线兜底, 杜绝「不写溯源就绕过」;
  //    - 只匹配卷面可见文本, 不把 notes / point_id / URL 里的技术字样算作违规;
  //    - 关键词保留完整短语(去括号示例与否定前缀), 不再粗暴截断成 3~12 字。
  if (Array.isArray(points) && points.length > 0) {
    const rulesByKp = new Map();
    const allRules = [];
    points.forEach(p => {
      const excluded = p?.teaching_boundary?.scope_excluded;
      if (Array.isArray(excluded) && excluded.length > 0) {
        rulesByKp.set(p.point_id, excluded);
        for (const rule of excluded) allRules.push({ pid: p.point_id, rule });
      }
    });

    if (allRules.length > 0) {
      (data.slides || []).forEach(slide => {
        const sid = slide.slide_id;
        const refKp = slide.source?.point_id;
        const rules = refKp && rulesByKp.has(refKp)
          ? rulesByKp.get(refKp).map(rule => ({ pid: refKp, rule }))
          : allRules;
        const slideText = visibleTextOf(slide);
        const reported = new Set();

        for (const { pid, rule } of rules) {
          for (const keyword of redlineKeywords(rule)) {
            if (keyword && slideText.includes(keyword) && !reported.has(keyword)) {
              reported.add(keyword);
              issues.push(issue("SCOPE_EXCLUDED_VIOLATION",
                `幻灯片卷面出现教学边界明确排除的内容: '${keyword}' (知识点 ${pid} 红线: ${rule})`,
                "error", sid, "请严格遵守教参 teaching_boundary.scope_excluded 边界红线。"));
            }
          }
        }
      });
    }
  }

  // 6. 数学算式与答案语义正确性校验 (拦截大模型算错或逻辑矛盾)
  if (meta.subject === "math") {
    (data.slides || []).forEach(slide => {
      const mathIssues = validateSlideMathSemantics(slide);
      mathIssues.forEach(mi => {
        issues.push(issue(
          mi.code,
          `数学教学语义错误: ${mi.message}`,
          "error",
          mi.slide_id,
          "请核对题干算式与参考答案，杜绝计算错误与命题矛盾。"
        ));
      });
    });
  }

  return issues;
}

export function validate(data, unitMeta = null, knowledgePointIds = null, lessonIds = null, points = null) {
  const issues = [
    ...checkStructure(data),
    ...checkSemantics(data, unitMeta, knowledgePointIds, lessonIds, points)
  ];
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  return { errors, warnings };
}
