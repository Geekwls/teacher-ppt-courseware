// -*- coding: utf-8 -*-
/**
 * 课型骨架注册表 (lesson_skeleton.js)
 *
 * 解决的问题:
 * 在引入本模块之前, lesson_type 只是一个"标签" —— 写在 meta 里, 校验器认, 但页序规划完全不看。
 * 新授课、练习课、复习课生成出来是同一副骨架 (都是"情境导入 + 探究"), 老师只能拿到不符合
 * 自己课型的结构。本模块把课型变成"结构约束":
 *
 * 1. PHASE_ROLES       —— 环节语义角色: 把 phase 归一成 warmup / exploration / practice 等标准角色;
 * 2. LESSON_SKELETONS  —— 每种课型的教学法骨架: 必备环节、可选环节、收尾页;
 * 3. resolvePhaseRole  —— 角色识别 (phase_id 关键字优先, content_block.type 兜底);
 * 4. diagnoseSkeleton  —— 完备性诊断: 缺哪个必备环节、顺序是否偏离, 输出可读报告;
 * 5. missingPhaseStubs —— 缺失必备环节的占位描述, 由 PagePlanner 落成"待补充"页。
 *
 * 设计原则:
 * - 只做"诊断 + 占位", 不擅自重排老师的教学序列 —— 教学顺序是教师的专业判断;
 * - 骨架只约束"有没有", 不约束"怎么写" —— 具体内容仍然来自 LessonPlan, 系统不编造教材事实;
 * - 5 种课型全部覆盖 schema enum, 不再出现 experiment_inquiry 静默回落成新授课。
 */

/**
 * 环节语义角色表。
 * blockTypes: content_block.type 到角色的确定性映射 (契约给出的强信号);
 * phaseKeywords: phase_id 关键字 (作者显式命名的弱信号, 优先级高于 blockTypes, 因为
 *   同一 type "practice_challenge" 在练习课里可能是基础练习, 也可能是变式练习)。
 */
export const PHASE_ROLES = {
  warmup: {
    label: "情境导入",
    blockTypes: ["contextual_problem"],
    phaseKeywords: /warm|intro|lead_?in|situation/,
    hint: "用生活情境或旧知引出本节核心问题，1~2 句话点题即可"
  },
  recall: {
    label: "复习唤醒",
    blockTypes: [],
    phaseKeywords: /recall|review|wake|activate/,
    hint: "回顾上节课或本单元已学方法，为练习做知识准备"
  },
  vocabulary: {
    label: "字词识记",
    blockTypes: ["vocabulary_focus"],
    phaseKeywords: /vocab|word_study|pinyin/,
    hint: "聚焦本课生字新词、多音字与易读错的字"
  },
  writing: {
    label: "书写指导",
    blockTypes: ["character_writing"],
    phaseKeywords: /writing|tianzige|handwriting/,
    hint: "田字格范写，讲清笔顺、间架结构与易错笔画"
  },
  exploration: {
    label: "核心探究",
    blockTypes: ["mathematical_reasoning"],
    phaseKeywords: /explor|explore|inquiry|reasoning|structure/,
    hint: "围绕核心问题展开算理推演或文本细读，是本节课的重心"
  },
  reading: {
    label: "文本品读",
    blockTypes: ["text_reading"],
    phaseKeywords: /reading|paragra|passage|close_read/,
    hint: "截取关键段落，带学生朗读、圈画、品味语言"
  },
  experiment: {
    label: "实验操作",
    blockTypes: [],
    phaseKeywords: /experiment|observ|hands_?on|lab/,
    hint: "明确实验材料、操作步骤与观察要点，先预测再验证"
  },
  example: {
    label: "例题示范",
    blockTypes: ["worked_example"],
    phaseKeywords: /example|worked|sample/,
    hint: "完整示范一道典型题的规范解法，边讲边标出关键步骤"
  },
  misconception: {
    label: "易错辨析",
    blockTypes: ["misconception_analysis"],
    phaseKeywords: /misconception|pitfall|wrong|error_warn/,
    hint: "呈现典型错例，让学生先判断再归因，最后给出正确做法"
  },
  basic_practice: {
    label: "基础练习",
    blockTypes: ["practice_challenge"],
    phaseKeywords: /basic_practice|basic|foundation/,
    hint: "与例题同构的基础题，确保全班都能动手完成"
  },
  variant_practice: {
    label: "变式练习",
    blockTypes: ["practice_challenge"],
    phaseKeywords: /variant|transfer|extension_practice|advanced_practice/,
    hint: "改变条件或情境的变式题，检验方法是否真正迁移"
  },
  practice: {
    label: "当堂练习",
    blockTypes: ["practice_challenge"],
    phaseKeywords: /practice|exercise|consolidat/,
    hint: "当堂独立完成的巩固题，教师巡视收集典型问题"
  },
  error_analysis: {
    label: "错因诊断",
    blockTypes: [],
    phaseKeywords: /error_analysis|error_fix|correct_error|diagnos/,
    hint: "汇总学生练习中的真实错误，按错因归类讲评"
  },
  network: {
    label: "知识网络",
    blockTypes: [],
    phaseKeywords: /network|mind_?map|structure_map|knowledge_map/,
    hint: "用结构图把本单元知识点串成网络，讲清彼此关联"
  },
  topic_drill: {
    label: "专题精练",
    blockTypes: [],
    phaseKeywords: /drill|topic|special_train/,
    hint: "按专题分组精练，每组练完立刻归纳该类型的通法"
  },
  summary: {
    label: "课堂小结",
    blockTypes: ["rule_summary"],
    phaseKeywords: /summary|wrap|closing|conclusion/,
    hint: "回扣学习目标，提炼方法与易错点，形成可带走的一句话"
  }
};

/** 角色识别顺序: 长关键字在前, 避免 "basic_practice" 被 "practice" 抢先命中 */
const ROLE_KEYWORD_ORDER = [
  "basic_practice",
  "variant_practice",
  "error_analysis",
  "topic_drill",
  "recall",
  "network",
  "vocabulary",
  "writing",
  "misconception",
  "example",
  "experiment",
  "reading",
  "exploration",
  "practice",
  "summary",
  "warmup"
];

/**
 * 课型骨架表。
 * phases[].role      对应 PHASE_ROLES
 * phases[].required  必备环节: 缺失时补占位页并在报告里明示
 * phases[].repeatable 允许出现多次 (如语文连读两段、练习课多组基础题)
 * phases[].aliases   等价角色: 语文课用"文本品读"承担探究职能, 英语课用"对话操练"同理,
 *                    不能因为没写 mathematical_reasoning 就判定缺"核心探究"
 * closers            收尾页: homework 分层作业 / board 板书结构
 */
export const LESSON_SKELETONS = {
  concept_learning: {
    name: "新授课",
    intent: "情境导入 → 核心探究 → 例题示范 → 易错辨析 → 当堂练习 → 课堂小结",
    phases: [
      { role: "warmup", required: true },
      { role: "exploration", required: true, repeatable: true, aliases: ["reading", "vocabulary", "writing", "experiment"] },
      { role: "example", required: false },
      { role: "misconception", required: false },
      { role: "practice", required: true },
      { role: "summary", required: true }
    ],
    closers: []
  },
  practice_consolidation: {
    name: "练习巩固课",
    intent: "复习唤醒 → 基础练习 → 变式练习 → 错因诊断 → 课堂小结 → 分层作业",
    phases: [
      { role: "recall", required: true },
      { role: "basic_practice", required: true, repeatable: true },
      { role: "variant_practice", required: true, repeatable: true },
      { role: "error_analysis", required: false },
      { role: "summary", required: true }
    ],
    closers: ["homework"]
  },
  unit_review: {
    name: "单元复习课",
    intent: "知识网络 → 专题精练 → 错因诊断 → 课堂小结 → 板书结构 → 分层作业",
    phases: [
      { role: "network", required: true },
      { role: "topic_drill", required: true, repeatable: true },
      { role: "error_analysis", required: false },
      { role: "summary", required: true }
    ],
    closers: ["board", "homework"]
  },
  experiment_inquiry: {
    name: "实验探究课",
    intent: "问题情境 → 实验操作 → 结论归纳 → 应用迁移 → 课堂小结 → 分层作业",
    phases: [
      { role: "warmup", required: true },
      { role: "experiment", required: true, repeatable: true },
      { role: "exploration", required: false, aliases: ["reading"] },
      { role: "practice", required: true },
      { role: "summary", required: true }
    ],
    closers: ["homework"]
  },
  reading_comprehension: {
    name: "阅读指导课",
    intent: "情境导入 → 字词梳理 → 文本品读 → 研读思辨 → 当堂练习 → 课堂小结",
    phases: [
      { role: "warmup", required: true },
      { role: "vocabulary", required: false },
      { role: "reading", required: true, repeatable: true, aliases: ["exploration"] },
      { role: "misconception", required: false },
      { role: "practice", required: true },
      { role: "summary", required: true }
    ],
    closers: []
  }
};

export const LESSON_SKELETON_IDS = Object.keys(LESSON_SKELETONS);

/**
 * 识别单个教学环节的语义角色。
 * 先看 phase_id 关键字 (作者显式命名), 再看 content_block.type (契约强信号)。
 * @returns {string|null} 角色 ID, 无法识别返回 null
 */
export function resolvePhaseRole(phase = {}) {
  const phaseId = String(phase.phase_id || "").toLowerCase();
  for (const role of ROLE_KEYWORD_ORDER) {
    const kw = PHASE_ROLES[role].phaseKeywords;
    if (kw && kw.test(phaseId)) return role;
  }

  const blockType = phase.content_block?.type;
  if (blockType) {
    for (const [role, meta] of Object.entries(PHASE_ROLES)) {
      if (Array.isArray(meta.blockTypes) && meta.blockTypes.includes(blockType)) return role;
    }
  }
  return null;
}

export function getSkeleton(lessonType) {
  return LESSON_SKELETONS[lessonType] || LESSON_SKELETONS.concept_learning;
}

/**
 * 骨架完备性诊断。
 * @param {object} lessonPlan LessonPlan AST
 * @returns {object} 诊断报告 (不含页面副作用, 纯查询)
 */
export function diagnoseSkeleton(lessonPlan = {}) {
  const lessonType = lessonPlan.meta?.lesson_type || "concept_learning";
  const skeleton = getSkeleton(lessonType);
  const sequence = Array.isArray(lessonPlan.teaching_sequence) ? lessonPlan.teaching_sequence : [];

  const matched = [];
  const unmapped = [];

  sequence.forEach((phase, index) => {
    const role = resolvePhaseRole(phase);
    if (!role) {
      unmapped.push({ phase_id: phase.phase_id, phase_name: phase.phase_name, index });
      return;
    }
    matched.push({
      phase_id: phase.phase_id,
      phase_name: phase.phase_name,
      role,
      role_label: PHASE_ROLES[role]?.label || role,
      index
    });
  });

  // 角色 → 骨架槽位索引 (等价角色指向同一槽位: 语文"文本品读"占的就是"核心探究"这一格)
  const roleIndexMap = new Map();
  skeleton.phases.forEach((p, i) => {
    roleIndexMap.set(p.role, i);
    (p.aliases || []).forEach(a => {
      if (!roleIndexMap.has(a)) roleIndexMap.set(a, i);
    });
  });

  const coveredSlots = new Set(
    matched.map(m => roleIndexMap.get(m.role)).filter(v => v !== undefined)
  );

  const missing = skeleton.phases
    .filter((p, i) => p.required && !coveredSlots.has(i))
    .map(p => ({
      role: p.role,
      label: PHASE_ROLES[p.role]?.label || p.role,
      hint: PHASE_ROLES[p.role]?.hint || "",
      required: true
    }));

  const outOfOrder = [];
  let lastRole = null;
  let lastSlot = -1;
  for (const m of matched) {
    const order = roleIndexMap.get(m.role);
    if (order === undefined) continue; // 骨架外角色 (如练习课的独立书写环节) 不参与顺序判定
    if (order < lastSlot) {
      outOfOrder.push({
        phase_id: m.phase_id,
        role: m.role,
        role_label: m.role_label,
        after_role: lastRole,
        after_role_label: PHASE_ROLES[lastRole]?.label || lastRole,
        note: `「${m.role_label}」出现在「${PHASE_ROLES[lastRole]?.label || lastRole}」之后，与${skeleton.name}骨架的顺序不一致`
      });
    }
    lastSlot = Math.max(lastSlot, order);
    lastRole = m.role;
  }

  const offSkeletonRoles = matched
    .filter(m => !roleIndexMap.has(m.role))
    .map(m => m.role);
  const uniqueOffSkeleton = [...new Set(offSkeletonRoles)];

  return {
    lesson_type: lessonType,
    lesson_type_name: skeleton.name,
    intent: skeleton.intent,
    complete: missing.length === 0,
    /**
     * 片段式设计: 缺口比已覆盖的槽位还多。
     * 典型场景是老师只想生成某个环节的片段课件 (如"只要这段品读")，
     * 此时硬补齐会往 5 页里塞 3 页"待补充"，反而毁了这份课件 —— 只诊断, 不补页。
     */
    fragmented: missing.length > coveredSlots.size,
    matched,
    missing,
    outOfOrder,
    unmapped,
    off_skeleton_roles: uniqueOffSkeleton.map(role => ({
      role,
      label: PHASE_ROLES[role]?.label || role
    })),
    closers: skeleton.closers.slice()
  };
}

/**
 * 针对缺失的必备环节, 计算"应插入到第几个环节之后"。
 *
 * 策略: 找骨架中该角色之前最近的、已在教学设计里出现的角色作为锚点, 插在锚点的最后一处之后。
 * 找不到前驱锚点就找后继锚点插在其前, 都没有则追加到末尾。
 * 这样既补齐结构, 又不打乱老师已写好的教学顺序。
 *
 * @param {object} report diagnoseSkeleton 的产物
 * @returns {Array<{role,label,hint,insertAfterPhaseId}>}
 */
export function missingPhaseStubs(report) {
  if (!report || !Array.isArray(report.missing) || report.missing.length === 0) return [];

  const skeleton = getSkeleton(report.lesson_type);
  // 等价角色归到同一槽位: 语文"文本品读"就是"核心探究"那一格, 定位锚点时必须按槽位算
  const slotOf = role => skeleton.phases.findIndex(
    p => p.role === role || (Array.isArray(p.aliases) && p.aliases.includes(role))
  );

  // 可变副本: 随着占位环节被决定插入, 后续缺失项要能看到它, 保证多个缺口相对顺序正确
  const working = report.matched
    .map(m => ({ ...m, slot: slotOf(m.role) }))
    .filter(m => m.slot >= 0);

  const stubs = [];
  for (const miss of report.missing) {
    const missSlot = slotOf(miss.role);

    let anchor = null;
    for (let i = missSlot - 1; i >= 0; i--) {
      const hits = working.filter(w => w.slot === i);
      if (hits.length) {
        anchor = hits[hits.length - 1];
        break;
      }
    }

    let insertBeforePhaseId = null;
    if (!anchor) {
      for (let i = missSlot + 1; i < skeleton.phases.length; i++) {
        const hit = working.find(w => w.slot === i);
        if (hit) {
          insertBeforePhaseId = hit.phase_id;
          break;
        }
      }
    }

    const stub = {
      role: miss.role,
      label: miss.label,
      hint: miss.hint,
      insertAfterPhaseId: anchor ? anchor.phase_id : null,
      insertBeforePhaseId
    };
    stubs.push(stub);
    // 把占位当作已存在, 供后续缺失项定位 (保持骨架相对顺序)
    working.push({
      phase_id: `__stub_${miss.role}__`,
      role: miss.role,
      role_label: miss.label,
      slot: missSlot,
      index: anchor ? anchor.index + 0.5 : -0.5
    });
  }
  return stubs;
}

/**
 * 人类可读的骨架摘要, 供 CLI 输出与文档引用。
 */
export function formatSkeletonLine(report) {
  if (!report) return "";
  const parts = report.matched.map(m => m.role_label);
  const missing = report.missing.map(m => `缺·${m.label}`);
  const body = [...parts, ...missing].join(" → ");
  return `${report.lesson_type_name}骨架: ${body}${report.complete ? " (完备)" : " (有缺口)"}`;
}
