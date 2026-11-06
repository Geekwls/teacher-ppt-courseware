// -*- coding: utf-8 -*-
/** 小结版式: 要点卡整体揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "summary_card";
export const required = { ids: ["txt_sum_title", "card_sum_list"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("txt_sum_title", "title", { text: plan.title }),
      makeElement("card_sum_list", "card_list", { items: plan.items || [] })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_sum_title"),
      makeTimelineStep(1, "reveal", "card_sum_list")
    ]
  };
}
