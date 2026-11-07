// -*- coding: utf-8 -*-
/**
 * 页面装配器注册表 (plan_builders.js)
 *
 * 每个内容块类型 (content_block.type) 一个装配器, 产出 SlidePlan 的内容字段
 * (不含 slide_id/phase_ref/layout/notes —— 由 page_planner 统一附加)。
 * 版式由 block-layout-map.yaml / 显式 content_block.layout 决定, 与装配器解耦:
 * 单元级把某类型重映射到别的版式时, 字段照样产出, 由目标版式渲染。
 */

import { resolveLayoutVariant } from "../rendering/layout_variants.js";

export const PLAN_BUILDERS = {
  contextual_problem: ({ cb, phase }) => ({
    key: "warmup",
    title: phase.phase_name,
    context_title: "【情境呈现】",
    context_body: `${cb.scenario || ""} ${cb.question || ""}`,
    equation: cb.equation || cb.core_expression || "",
    // 配图位 (B3): 仅当教学设计显式声明时透传, 避免无图课件被塞入占位元素
    ...(cb.image_path || cb.image || cb.image_alt
      ? { image_path: cb.image_path || cb.image || "", image_alt: cb.image_alt || phase.phase_name }
      : {})
  }),

  vocabulary_focus: ({ cb, phase }) => {
    const recognizeChars = Array.isArray(cb.recognize_chars) ? cb.recognize_chars.filter(Boolean) : [];
    const wordLines = (cb.words || []).map(w => `${w.word} (${w.pinyin}) ── ${w.focus}`);
    // 识字表单独成行, 让"认识N个生字"的目标在页面上有落点
    if (recognizeChars.length) {
      wordLines.push(`会认字（${recognizeChars.length}个）：${recognizeChars.join(" ")}`);
    }
    return {
      key: "vocab",
      title: phase.phase_name,
      context_title: "【重点字词与易错字形】",
      context_body: wordLines.join("\n"),
      conclusion_text: cb.core_rule || ""
    };
  },

  character_writing: ({ cb, phase }) => ({
    key: "writing",
    title: phase.phase_name,
    figure_tianzige: cb.figure || { kind: "tianzige", chars: [], pinyin: [] },
    rules: cb.writing_rules || [],
    guidance_tip: cb.guidance_tip || "认真描红，工整书写。"
  }),

  text_reading: ({ cb, phase }) => ({
    key: "reading",
    title: phase.phase_name,
    context_title: "【课文精读】",
    context_body: cb.paragraph_excerpt || "",
    reading_guide: cb.reading_guide || null,
    questions: cb.focus_questions || [],
    conclusion_text: cb.key_phrase || "",
    image_path: cb.image_path || cb.image || "",
    image_alt: cb.image_alt || phase.phase_name
  }),

  mathematical_reasoning: ({ cb, phase }) => {
    const model = cb.model_payload || cb.visual_model;
    // 声明式算理动画 (kind: "animation") 走动态媒体子引擎;
    // 数轴模型走 figure_number_line 图元。
    return model && model.kind === "animation"
      ? {
          key: "exploration",
          title: phase.phase_name,
          figure_animation: model,
          reasoning_items: cb.reasoning_steps || [],
          conclusion_text: `★ 核心规律：${cb.core_rule || cb.conclusion || ""}`
        }
      : {
          key: "exploration",
          title: phase.phase_name,
          figure_number_line: model,
          reasoning_items: cb.reasoning_steps || [],
          conclusion_text: `★ 核心规律：${cb.core_rule || cb.conclusion || ""}`
        };
  },

  worked_example: ({ cb, phase }) => ({
    key: "example",
    title: phase.phase_name,
    problem_title: "【教材例题】",
    problem_body: cb.problem || "",
    steps: cb.solution_steps || [],
    answer: cb.answer || ""
  }),

  misconception_analysis: ({ cb, phase }) => ({
    key: "misconception",
    title: phase.phase_name,
    wrong_case: cb.wrong_case || "",
    cause_analysis: cb.cause_analysis || "",
    correct_method: cb.correct_method || ""
  }),

  rule_summary: ({ cb, phase, meta, scenePreset, layout }) => ({
    key: "summary",
    layout_variant: resolveLayoutVariant(layout, {
      explicitVariant: meta.layout_variants?.summary_card || cb.layout_variant,
      presetVariants: scenePreset.variants,
      itemCount: (cb.summary_points || []).length
    }),
    title: phase.phase_name,
    items: cb.summary_points || []
  }),

  activity_instruction: ({ cb, phase }) => ({
    key: "activity",
    title: phase.phase_name,
    activity_type: cb.activity_type || "小组合作",
    duration: cb.duration || "4分钟",
    tasks: cb.tasks || cb.steps || ["组内轮流表达自己的思路", "记录关键发现与不同解法", "推选代表准备全班分享"],
    prompt: cb.prompt || cb.requirements || "表达清晰，倾听专注，相互补充。"
  }),

  comparison_table: ({ cb, phase }) => ({
    key: "compare",
    title: phase.phase_name,
    headers: cb.headers || ["对比维度", "常见误区 / 对照项", "标准做法 / 核心规律"],
    rows: cb.rows || [
      ["关键特征", cb.left_feature || "易混点", cb.right_feature || "正解点"]
    ],
    summary_tip: cb.summary_tip || cb.conclusion || "对比辨析，抓住本质特征"
  }),

  knowledge_tree: ({ cb, phase, meta }) => ({
    key: "tree",
    title: phase.phase_name,
    root_topic: cb.root_topic || meta.topic || "本单元核心知识",
    branches: cb.branches || (cb.nodes || []).map(n => ({
      name: n.name || n.title,
      leaves: n.leaves || n.items || []
    }))
  }),

  board_design: ({ cb, phase, meta }) => ({
    key: "board",
    title: phase.phase_name || "板书设计",
    board_topic: cb.center_topic || cb.title || meta.topic || "本课知识",
    board_branches: cb.columns || cb.branches || []
  }),

  layered_homework: ({ cb, phase }) => {
    const tiers = [];
    if (cb.required) tiers.push({ tier: "必做", desc: cb.required });
    if (cb.optional) tiers.push({ tier: "选做", desc: cb.optional });
    if (cb.challenge) tiers.push({ tier: "挑战", desc: cb.challenge });
    if (!tiers.length && Array.isArray(cb.tiers)) {
      tiers.push(...cb.tiers);
    }
    return {
      key: "homework",
      title: phase.phase_name || "分层课后作业",
      homework_tiers: tiers
    };
  }
};
