// -*- coding: utf-8 -*-
/** 分层作业版式: 必做/选做/挑战三档整体揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "homework_card";
export const required = { ids: ["txt_hw_title", "card_hw_tiers"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("txt_hw_title", "title", { text: plan.title }),
      makeElement("card_hw_tiers", "tier_list", { tiers: plan.homework_tiers || [] })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_hw_title"),
      makeTimelineStep(1, "reveal", "card_hw_tiers")
    ]
  };
}
