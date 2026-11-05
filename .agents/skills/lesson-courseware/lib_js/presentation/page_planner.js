// -*- coding: utf-8 -*-
/**
 * 课件页面智能规划器 (page_planner.js)
 *
 * 核心职责:
 * 1. 协调教学环节与页面容量: 依据 StrategyResolver 提供的认知负荷评估，决定每个环节的页面数量;
 * 2. 算理超限自动拆页 (防止删减算理):
 *    当探究算理步骤过多时，自动拆分为「探究一·数形建模」与「探究二·算理升华」，杜绝文字溢出;
 * 3. 练习与答案协同拆页:
 *    当练习题量达到 2 题以上时，拆分为「课堂自主作答页」与「逐题诊断参考答案页」;
 * 4. 产出标准 SlidePlan 数组，供 PresentationPlanner 装配。
 */

import { resolveStrategyContext } from "../strategies/strategy_resolver.js";

export function planSlidesFromLesson(lessonPlan, userPreferences = {}) {
  if (!lessonPlan || typeof lessonPlan !== "object") {
    throw new Error("无效的 LessonPlan 对象");
  }

  const meta = lessonPlan.meta || {};
  const objectives = lessonPlan.objectives || [];
  const sequence = lessonPlan.teaching_sequence || [];

  const strategyContext = resolveStrategyContext({
    subject: meta.subject,
    grade: meta.grade,
    lesson_type: meta.lesson_type,
    userPreferences
  });

  const slidePlans = [];
  let pageCounter = 1;

  function nextSlideId(prefix) {
    return `slide_${String(pageCounter++).padStart(2, "0")}_${prefix}`;
  }

  // 1. 封面
  slidePlans.push({
    slide_id: nextSlideId("cover"),
    phase_ref: "meta_cover",
    layout: "title_cover",
    title: meta.topic || "课时教学",
    subtitle: `${meta.grade}年级${meta.term === "term-1" ? "上册" : "下册"}${meta.subject === "math" ? "数学" : meta.subject}第${meta.unit}单元 · 课时 1`,
    notes: `同学们好！今天我们一起学习${meta.topic}。`
  });

  // 2. 学习目标
  slidePlans.push({
    slide_id: nextSlideId("objectives"),
    phase_ref: "meta_objectives",
    layout: "objectives_card",
    title: "学习目标",
    items: objectives.map((o, idx) => `${idx + 1}. ${o.statement}`),
    notes: `本节课的核心学习目标：${objectives.map(o => o.statement).join("；")}。请大家明确学习方向。`
  });

  // 3. 动态规划教学环节
  sequence.forEach(phase => {
    const cb = phase.content_block || {};
    const rawGuidance = String(phase.teacher_guidance || "").trim();
    const guidance = rawGuidance.length >= 5
      ? rawGuidance
      : "请同学们认真观察大屏幕，跟随老师的思路积极思考。";
    const decision = strategyContext.evaluateCapacityAndSplit(cb);

    // 场景 A: 探究步骤膨胀，触发跨页拆分
    if (decision.needSplit && decision.splitMode === "model_and_reasoning_sequence") {
      const nlProps = cb.model_payload || cb.visual_model || { start: 0, end: 60, step: 20, arcs: [] };

      // 拆分子页 1: 直观建模
      slidePlans.push({
        slide_id: nextSlideId("exploration_model"),
        phase_ref: phase.phase_id,
        layout: "model_left_reasoning_right",
        title: `${phase.phase_name} (一) · 数形建模`,
        figure_number_line: nlProps,
        reasoning_items: [
          "① 观察数轴从 0 开始跳跃",
          "② 每次增加一个相同的计数单位",
          "③ 记录跳跃终点位置"
        ],
        conclusion_text: "★ 发现：相同加数相加，在数轴上表现为相同步长的连续跳跃。",
        notes: `${guidance}（第1部分：重点引导学生观察数轴的跳跃规律）`
      });

      // 拆分子页 2: 算理升华与算法总结
      slidePlans.push({
        slide_id: nextSlideId("exploration_reasoning"),
        phase_ref: phase.phase_id,
        layout: "summary_card",
        title: `${phase.phase_name} (二) · 算理升华`,
        items: cb.reasoning_steps || [
          "想：20 是 2 个十",
          "2 个十 × 3 = 6 个十",
          "6 个十就是 60"
        ],
        conclusion_text: cb.core_rule || cb.conclusion || "",
        notes: `${guidance}（第2部分：重点从数轴直观升华到计数单位运算法则）`
      });
      return;
    }

    // 场景 B: 练习题量较多，触发题目页与答案页拆分
    if (decision.needSplit && decision.splitMode === "practice_and_answer_dual_page") {
      const items = cb.items || [];
      // 题目页 (全常驻)
      slidePlans.push({
        slide_id: nextSlideId("practice"),
        phase_ref: phase.phase_id,
        layout: "practice_list",
        title: phase.phase_name,
        questions: items.map((it, idx) => {
          const numSymbol = ["❶", "❷", "❸", "❹", "❺"][idx] || `(${idx + 1})`;
          return `${numSymbol} ${it.stem || ""}`;
        }),
        notes: "请同学们拿出练习本独立完成题目，稍后进入答案核对与思路诊断环节。"
      });

      // 答案诊断页 (逐题揭晓)
      slidePlans.push({
        slide_id: nextSlideId("answer"),
        phase_ref: phase.phase_id,
        layout: "answer_reveal_list",
        title: `${phase.phase_name} · 参考答案与诊断`,
        answer_items: items.map((it, idx) => {
          const numSymbol = ["❶", "❷", "❸", "❹", "❺"][idx] || `(${idx + 1})`;
          return {
            id: `ans_item_${idx + 1}`,
            question_num: numSymbol,
            stem: it.stem || "",
            explanation: `★ 参考答案：${it.answer || ""} (${it.explanation || ""})`
          };
        }),
        notes: guidance
      });
      return;
    }

    // 场景 C: 长文本品读与多设问，触发原文品读与设问深究拆页 (保障大字号与深度思维)
    if (decision.needSplit && decision.splitMode === "text_reading_and_questions_dual_page") {
      const excerpt = cb.paragraph_excerpt || "";
      const qs = cb.focus_questions || [];

      // 拆分子页 1: 原文沉浸品读 (大字号、充足行距)
      slidePlans.push({
        slide_id: nextSlideId("reading_text"),
        phase_ref: phase.phase_id,
        layout: "reading_focus",
        title: `${phase.phase_name} · 原文品读`,
        context_title: "【原文精读】",
        context_body: excerpt,
        questions: [],
        conclusion_text: cb.key_phrase || "",
        notes: `${guidance}（第1部分：指导学生有感情地朗读原文，沉浸感受语言文字的意境美与节奏感）`
      });

      // 拆分子页 2: 文本设问与深层探究 (设问卡片 + 核心写作手法/主旨横幅)
      slidePlans.push({
        slide_id: nextSlideId("reading_questions"),
        phase_ref: phase.phase_id,
        layout: "reading_focus",
        title: `${phase.phase_name} · 研读思考与探究`,
        context_title: "【研读思考】",
        context_body: "结合上页原文重点语句，深入探究下列核心问题并交流分享：",
        questions: qs,
        conclusion_text: cb.core_rule || cb.key_phrase || "★ 写作启示：观察景物要调动多重感官，融情入景。",
        notes: `${guidance}（第2部分：结合设问引导学生深入探究修辞特色、感官协同与内在行文逻辑）`
      });
      return;
    }

    // 场景 D: 标准单页容纳
    switch (cb.type) {
      case "contextual_problem":
        slidePlans.push({
          slide_id: nextSlideId("warmup"),
          phase_ref: phase.phase_id,
          layout: "context_problem",
          title: phase.phase_name,
          context_title: "【情境呈现】",
          context_body: `${cb.scenario || ""} ${cb.question || ""}`,
          equation: cb.equation || cb.core_expression || "",
          notes: guidance
        });
        break;

      case "vocabulary_focus":
        slidePlans.push({
          slide_id: nextSlideId("vocab"),
          phase_ref: phase.phase_id,
          layout: "reading_focus",
          title: phase.phase_name,
          context_title: "【重点字词与多音字】",
          context_body: (cb.words || []).map(w => `${w.word} (${w.pinyin}) ── ${w.focus}`).join("\n"),
          conclusion_text: cb.core_rule || "",
          notes: guidance
        });
        break;

      case "character_writing":
        slidePlans.push({
          slide_id: nextSlideId("writing"),
          phase_ref: phase.phase_id,
          layout: "character_practice",
          title: phase.phase_name,
          figure_tianzige: cb.figure || { kind: "tianzige", chars: [], pinyin: [] },
          rules: cb.writing_rules || [],
          guidance_tip: cb.guidance_tip || "认真描红，工整书写。",
          notes: guidance
        });
        break;

      case "text_reading":
        slidePlans.push({
          slide_id: nextSlideId("reading"),
          phase_ref: phase.phase_id,
          layout: "reading_focus",
          title: phase.phase_name,
          context_title: "【课文精读】",
          context_body: cb.paragraph_excerpt || "",
          questions: cb.focus_questions || [],
          conclusion_text: cb.key_phrase || "",
          notes: guidance
        });
        break;

      case "mathematical_reasoning":
        slidePlans.push({
          slide_id: nextSlideId("exploration"),
          phase_ref: phase.phase_id,
          layout: "model_left_reasoning_right",
          title: phase.phase_name,
          figure_number_line: cb.model_payload || cb.visual_model,
          reasoning_items: cb.reasoning_steps || [],
          conclusion_text: `★ 核心规律：${cb.core_rule || cb.conclusion || ""}`,
          notes: guidance
        });
        break;

      case "worked_example":
        slidePlans.push({
          slide_id: nextSlideId("example"),
          phase_ref: phase.phase_id,
          layout: "example_step_by_step",
          title: phase.phase_name,
          problem_title: "【教材例题】",
          problem_body: cb.problem || "",
          steps: cb.solution_steps || [],
          answer: cb.answer || "",
          notes: guidance
        });
        break;

      case "misconception_analysis":
        slidePlans.push({
          slide_id: nextSlideId("misconception"),
          phase_ref: phase.phase_id,
          layout: "misconception_split",
          title: phase.phase_name,
          wrong_case: cb.wrong_case || "",
          cause_analysis: cb.cause_analysis || "",
          correct_method: cb.correct_method || "",
          notes: guidance
        });
        break;

      case "rule_summary":
        slidePlans.push({
          slide_id: nextSlideId("summary"),
          phase_ref: phase.phase_id,
          layout: "summary_card",
          title: phase.phase_name,
          items: cb.summary_points || [],
          notes: guidance
        });
        break;

      default:
        break;
    }
  });

  // 4. 封底
  slidePlans.push({
    slide_id: nextSlideId("end"),
    phase_ref: "meta_end",
    layout: "end_cover",
    title: "同学们，下课！",
    subtitle: "认真练习，熟能生巧",
    notes: "今天的课就上到这里，同学们下课，再见！"
  });

  return {
    strategyContext,
    slidePlans
  };
}
