// -*- coding: utf-8 -*-
/** 易错辨析版式: 错例/病因常驻, 正解最后揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "misconception_split";
export const required = { ids: ["txt_misc_title", "card_wrong", "card_cause"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("txt_misc_title", "title", { text: plan.title }),
      makeElement("card_wrong", "text_card", {
        title: "【典型错例】",
        body: plan.wrong_case
      }),
      makeElement("card_cause", "text_card", {
        title: "【病因诊断】",
        body: plan.cause_analysis
      }),
      makeElement("card_correct", "conclusion_banner", {
        text: `✓ 正解：${plan.correct_method}`
      })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_misc_title"),
      makeTimelineStep(0, "show", "card_wrong"),
      makeTimelineStep(1, "reveal", "card_cause"),
      makeTimelineStep(2, "reveal", "card_correct")
    ]
  };
}
