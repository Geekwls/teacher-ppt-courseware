// -*- coding: utf-8 -*-
/**
 * 课件表现编排引擎 (lesson_to_presentation.js)
 *
 * 核心架构:
 * 1. 调用 PagePlanner 获得经由多维策略仲裁后的 SlidePlan 大纲;
 * 2. 纯确定性装配每一个 Slide 的 elements 数组与显式 timeline;
 * 3. 严格输出符合 presentation.schema.json (v1.0.0) 的标准 AST。
 */

import { planSlidesFromLesson } from "./page_planner.js";

function makeElement(id, type, properties) {
  return { id, type, properties };
}

function makeTimelineStep(step, action, target) {
  return { step, action, target };
}

export function planPresentationFromLesson(lessonPlan, options = {}) {
  const { strategyContext, slidePlans, skeletonReport } = planSlidesFromLesson(lessonPlan, options);

  const slides = slidePlans.map(plan => {
    const elements = [];
    const timeline = [];

    switch (plan.layout) {
      case "title_cover": {
        elements.push(makeElement("cover_title", "title", {
          text: plan.title,
          subtitle: plan.subtitle
        }));
        timeline.push(makeTimelineStep(0, "show", "cover_title"));
        break;
      }

      case "objectives_card": {
        elements.push(makeElement("txt_obj_title", "title", { text: plan.title }));
        elements.push(makeElement("card_obj_list", "card_list", { items: plan.items || [] }));
        timeline.push(makeTimelineStep(0, "show", "txt_obj_title"));
        timeline.push(makeTimelineStep(1, "reveal", "card_obj_list"));
        break;
      }

      case "context_problem": {
        elements.push(makeElement("txt_warmup_title", "title", { text: plan.title }));
        elements.push(makeElement("card_context", "text_card", {
          title: plan.context_title,
          body: plan.context_body
        }));
        elements.push(makeElement("eq_warmup", "equation", {
          expression: plan.equation
        }));
        timeline.push(makeTimelineStep(0, "show", "txt_warmup_title"));
        timeline.push(makeTimelineStep(0, "show", "card_context"));
        timeline.push(makeTimelineStep(1, "reveal", "eq_warmup"));
        break;
      }

      case "model_left_reasoning_right": {
        // 声明式算理动画模型: 透传为 figure_animation 图元, 由渲染层的动态媒体子引擎接管
        if (plan.figure_animation) {
          elements.push(makeElement("txt_exp_title", "title", { text: plan.title }));
          elements.push(makeElement("anim_math_model", "figure_animation", {
            ...plan.figure_animation
          }));
          elements.push(makeElement("card_reasoning", "card_list", {
            items: plan.reasoning_items || []
          }));
          if (plan.conclusion_text) {
            elements.push(makeElement("banner_conclusion", "conclusion_banner", {
              text: plan.conclusion_text
            }));
          }
          timeline.push(makeTimelineStep(0, "show", "txt_exp_title"));
          timeline.push(makeTimelineStep(0, "show", "anim_math_model"));
          timeline.push(makeTimelineStep(1, "reveal", "card_reasoning"));
          if (plan.conclusion_text) {
            timeline.push(makeTimelineStep(2, "reveal", "banner_conclusion"));
          }
          break;
        }

        const nlProps = plan.figure_number_line || { start: 0, end: 60, step: 20, arcs: [] };
        const normalizedArcs = (nlProps.arcs || []).map((arc, aIdx) => ({
          id: arc.id || `arc_${aIdx + 1}`,
          from: arc.from,
          to: arc.to,
          label: arc.label || (arc.to > arc.from ? `+${arc.to - arc.from}` : `${arc.to - arc.from}`)
        }));

        elements.push(makeElement("txt_exp_title", "title", { text: plan.title }));
        elements.push(makeElement("nl_math_model", "figure_number_line", {
          start: nlProps.start ?? 0,
          end: nlProps.end ?? 60,
          step: nlProps.step ?? 20,
          unit: "元",
          marks: [nlProps.start, ...normalizedArcs.map(a => a.to)],
          arcs: normalizedArcs
        }));
        elements.push(makeElement("card_reasoning", "card_list", {
          items: plan.reasoning_items || []
        }));
        if (plan.conclusion_text) {
          elements.push(makeElement("banner_conclusion", "conclusion_banner", {
            text: plan.conclusion_text
          }));
        }

        timeline.push(makeTimelineStep(0, "show", "txt_exp_title"));
        timeline.push(makeTimelineStep(0, "show", "nl_math_model.axis"));
        normalizedArcs.forEach((arc, aIdx) => {
          timeline.push(makeTimelineStep(aIdx + 1, "reveal", `nl_math_model.${arc.id}`));
        });
        const arcCount = normalizedArcs.length;
        timeline.push(makeTimelineStep(arcCount + 1, "reveal", "card_reasoning"));
        if (plan.conclusion_text) {
          timeline.push(makeTimelineStep(arcCount + 2, "reveal", "banner_conclusion"));
        }
        break;
      }

      case "example_step_by_step": {
        elements.push(makeElement("txt_ex_title", "title", { text: plan.title }));
        elements.push(makeElement("card_ex_problem", "text_card", {
          title: plan.problem_title,
          body: plan.problem_body
        }));
        elements.push(makeElement("card_ex_steps", "card_list", {
          items: plan.steps || []
        }));
        elements.push(makeElement("ans_ex_feedback", "answer_feedback", {
          text: plan.answer ? `答：${plan.answer.replace(/^答[:：]?\s*/, "")}` : ""
        }));

        timeline.push(makeTimelineStep(0, "show", "txt_ex_title"));
        timeline.push(makeTimelineStep(0, "show", "card_ex_problem"));
        timeline.push(makeTimelineStep(1, "reveal", "card_ex_steps"));
        timeline.push(makeTimelineStep(2, "reveal", "ans_ex_feedback"));
        break;
      }

      case "misconception_split": {
        elements.push(makeElement("txt_misc_title", "title", { text: plan.title }));
        elements.push(makeElement("card_wrong", "text_card", {
          title: "【典型错例】",
          body: plan.wrong_case
        }));
        elements.push(makeElement("card_cause", "text_card", {
          title: "【病因诊断】",
          body: plan.cause_analysis
        }));
        elements.push(makeElement("card_correct", "conclusion_banner", {
          text: `✓ 正解：${plan.correct_method}`
        }));

        timeline.push(makeTimelineStep(0, "show", "txt_misc_title"));
        timeline.push(makeTimelineStep(0, "show", "card_wrong"));
        timeline.push(makeTimelineStep(1, "reveal", "card_cause"));
        timeline.push(makeTimelineStep(2, "reveal", "card_correct"));
        break;
      }

      case "character_practice": {
        const figProps = plan.figure_tianzige || { kind: "tianzige", chars: [], pinyin: [] };
        elements.push(makeElement("txt_write_title", "title", { text: plan.title }));
        elements.push(makeElement("fig_tianzige", "figure_tianzige", figProps));
        elements.push(makeElement("card_rules", "card_list", { items: plan.rules || [] }));
        elements.push(makeElement("card_tip", "conclusion_banner", { text: plan.guidance_tip || "认真描红临写。" }));

        timeline.push(makeTimelineStep(0, "show", "txt_write_title"));
        timeline.push(makeTimelineStep(0, "show", "fig_tianzige"));
        timeline.push(makeTimelineStep(1, "reveal", "card_rules"));
        timeline.push(makeTimelineStep(2, "reveal", "card_tip"));
        break;
      }

      case "reading_focus": {
        elements.push(makeElement("txt_read_title", "title", { text: plan.title }));
        elements.push(makeElement("card_reading_text", "text_card", {
          title: plan.context_title || "【课文精读】",
          body: plan.context_body || ""
        }));
        if (plan.questions && plan.questions.length > 0) {
          elements.push(makeElement("card_questions", "card_list", { items: plan.questions }));
        }
        if (plan.conclusion_text) {
          elements.push(makeElement("banner_key_phrase", "conclusion_banner", { text: plan.conclusion_text }));
        }

        timeline.push(makeTimelineStep(0, "show", "txt_read_title"));
        timeline.push(makeTimelineStep(0, "show", "card_reading_text"));
        if (plan.questions && plan.questions.length > 0) {
          timeline.push(makeTimelineStep(1, "reveal", "card_questions"));
        }
        if (plan.conclusion_text) {
          timeline.push(makeTimelineStep(plan.questions && plan.questions.length > 0 ? 2 : 1, "reveal", "banner_key_phrase"));
        }
        break;
      }

      case "practice_list": {
        elements.push(makeElement("txt_pr_title", "title", { text: plan.title }));
        elements.push(makeElement("card_questions", "practice_list", {
          questions: plan.questions || []
        }));
        timeline.push(makeTimelineStep(0, "show", "txt_pr_title"));
        timeline.push(makeTimelineStep(0, "show", "card_questions"));
        break;
      }

      case "answer_reveal_list": {
        elements.push(makeElement("txt_ans_title", "title", { text: plan.title }));
        timeline.push(makeTimelineStep(0, "show", "txt_ans_title"));

        const ansItems = plan.answer_items || [];
        // 1. 全部题干设为 step 0 (常驻)
        ansItems.forEach(it => {
          elements.push(makeElement(it.id, "answer_feedback", {
            question_num: it.question_num,
            stem: it.stem,
            explanation: it.explanation
          }));
          timeline.push(makeTimelineStep(0, "show", `${it.id}.stem`));
        });

        // 2. 全部答案设为 step 1 ~ N (逐步揭晓)
        ansItems.forEach((it, idx) => {
          timeline.push(makeTimelineStep(idx + 1, "reveal", `${it.id}.explanation`));
        });
        break;
      }

      case "summary_card": {
        elements.push(makeElement("txt_sum_title", "title", { text: plan.title }));
        elements.push(makeElement("card_sum_list", "card_list", { items: plan.items || [] }));
        timeline.push(makeTimelineStep(0, "show", "txt_sum_title"));
        timeline.push(makeTimelineStep(1, "reveal", "card_sum_list"));
        break;
      }

      case "phase_placeholder": {
        // 课型骨架必备环节缺失时的提示页: 全部常驻显示, 不做分步 (它不是教学内容)
        elements.push(makeElement("txt_ph_title", "title", { text: plan.title }));
        elements.push(makeElement("card_ph_hint", "card_list", { items: plan.items || [] }));
        timeline.push(makeTimelineStep(0, "show", "txt_ph_title"));
        timeline.push(makeTimelineStep(0, "show", "card_ph_hint"));
        break;
      }

      case "board_design": {
        const branches = plan.board_branches || [];
        elements.push(makeElement("txt_board_title", "title", { text: plan.title }));
        elements.push(makeElement("card_board_topic", "text_card", {
          title: "【课题】",
          body: plan.board_topic || ""
        }));
        branches.forEach((b, idx) => {
          elements.push(makeElement(`card_board_${idx}`, "card_list", {
            head: b.head,
            items: b.items || []
          }));
        });
        if (plan.board_footer) {
          elements.push(makeElement("banner_board_footer", "conclusion_banner", { text: plan.board_footer }));
        }

        timeline.push(makeTimelineStep(0, "show", "txt_board_title"));
        timeline.push(makeTimelineStep(0, "show", "card_board_topic"));
        branches.forEach((b, idx) => {
          timeline.push(makeTimelineStep(idx + 1, "reveal", `card_board_${idx}`));
        });
        if (plan.board_footer) {
          timeline.push(makeTimelineStep(branches.length + 1, "reveal", "banner_board_footer"));
        }
        break;
      }

      case "homework_card": {
        elements.push(makeElement("txt_hw_title", "title", { text: plan.title }));
        elements.push(makeElement("card_hw_tiers", "tier_list", { tiers: plan.homework_tiers || [] }));
        timeline.push(makeTimelineStep(0, "show", "txt_hw_title"));
        timeline.push(makeTimelineStep(1, "reveal", "card_hw_tiers"));
        break;
      }

      case "end_cover": {
        elements.push(makeElement("end_title", "title", {
          text: plan.title,
          subtitle: plan.subtitle
        }));
        timeline.push(makeTimelineStep(0, "show", "end_title"));
        break;
      }

      default:
        break;
    }

    return {
      slide_id: plan.slide_id,
      phase_ref: plan.phase_ref,
      layout: plan.layout,
      elements,
      timeline,
      notes: plan.notes || "请同学们认真学习。"
    };
  });

  return {
    schema_version: "1.0.0",
    deck_meta: {
      source_lesson_id: lessonPlan.lesson_id || "lesson_unknown",
      theme: strategyContext.preferences.theme,
      style: strategyContext.preferences.style,
      aspect_ratio: strategyContext.preferences.aspect_ratio,
      // 课型骨架回执: 供 CLI 打印缺口、供后续教案迭代对齐
      skeleton: skeletonReport
        ? {
            lesson_type: skeletonReport.lesson_type,
            lesson_type_name: skeletonReport.lesson_type_name,
            intent: skeletonReport.intent,
            complete: skeletonReport.complete,
            fragmented: skeletonReport.fragmented,
            missing: skeletonReport.missing.map(m => m.label || m.role),
            filled: skeletonReport.filled.map(f => f.label || f.role),
            off_skeleton_roles: skeletonReport.off_skeleton_roles.map(r => r.label || r.role),
            out_of_order: skeletonReport.outOfOrder.map(o => o.phase_id),
            closers: skeletonReport.closers
          }
        : null
    },
    slides
  };
}
