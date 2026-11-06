// -*- coding: utf-8 -*-
/** 情境导入版式: 情境卡常驻, 算式/核心表达第二拍揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "context_problem";
export const required = { ids: ["txt_warmup_title", "card_context"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("txt_warmup_title", "title", { text: plan.title }),
      makeElement("card_context", "text_card", {
        title: plan.context_title,
        body: plan.context_body
      }),
      makeElement("eq_warmup", "equation", {
        expression: plan.equation
      })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_warmup_title"),
      makeTimelineStep(0, "show", "card_context"),
      makeTimelineStep(1, "reveal", "eq_warmup")
    ]
  };
}
