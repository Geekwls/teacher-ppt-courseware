// -*- coding: utf-8 -*-
/**
 * 算理左图右文版式。
 *
 * 两种图元来源:
 * - figure_animation: 声明式算理动画, 由动态媒体子引擎接管;
 * - figure_number_line: 数轴图元, 弧线按 timeline 逐拍揭示。
 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "model_left_reasoning_right";
export const required = { ids: ["txt_exp_title", "card_reasoning"] };

export function assemble(plan) {
  // 声明式算理动画模型
  if (plan.figure_animation) {
    const elements = [
      makeElement("txt_exp_title", "title", { text: plan.title }),
      makeElement("anim_math_model", "figure_animation", {
        ...plan.figure_animation
      }),
      makeElement("card_reasoning", "card_list", {
        items: plan.reasoning_items || []
      })
    ];
    const timeline = [
      makeTimelineStep(0, "show", "txt_exp_title"),
      makeTimelineStep(0, "show", "anim_math_model"),
      makeTimelineStep(1, "reveal", "card_reasoning")
    ];
    if (plan.conclusion_text) {
      elements.push(makeElement("banner_conclusion", "conclusion_banner", {
        text: plan.conclusion_text
      }));
      timeline.push(makeTimelineStep(2, "reveal", "banner_conclusion"));
    }
    return { elements, timeline };
  }

  // 数轴模型: 归一化弧线并逐条揭示
  const nlProps = plan.figure_number_line || { start: 0, end: 60, step: 20, arcs: [] };
  const normalizedArcs = (nlProps.arcs || []).map((arc, aIdx) => ({
    id: arc.id || `arc_${aIdx + 1}`,
    from: arc.from,
    to: arc.to,
    label: arc.label || (arc.to > arc.from ? `+${arc.to - arc.from}` : `${arc.to - arc.from}`)
  }));

  const elements = [
    makeElement("txt_exp_title", "title", { text: plan.title }),
    makeElement("nl_math_model", "figure_number_line", {
      start: nlProps.start ?? 0,
      end: nlProps.end ?? 60,
      step: nlProps.step ?? 20,
      unit: "元",
      marks: [nlProps.start, ...normalizedArcs.map(a => a.to)],
      arcs: normalizedArcs
    }),
    makeElement("card_reasoning", "card_list", {
      items: plan.reasoning_items || []
    })
  ];

  const timeline = [
    makeTimelineStep(0, "show", "txt_exp_title"),
    makeTimelineStep(0, "show", "nl_math_model.axis")
  ];
  normalizedArcs.forEach((arc, aIdx) => {
    timeline.push(makeTimelineStep(aIdx + 1, "reveal", `nl_math_model.${arc.id}`));
  });
  const arcCount = normalizedArcs.length;
  timeline.push(makeTimelineStep(arcCount + 1, "reveal", "card_reasoning"));
  if (plan.conclusion_text) {
    elements.push(makeElement("banner_conclusion", "conclusion_banner", {
      text: plan.conclusion_text
    }));
    timeline.push(makeTimelineStep(arcCount + 2, "reveal", "banner_conclusion"));
  }

  return { elements, timeline };
}
