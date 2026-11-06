// -*- coding: utf-8 -*-
/** 写字练习版式: 田字格范字常驻, 书写要领与提示依次揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "character_practice";
export const required = { ids: ["txt_write_title", "fig_tianzige"] };

export function assemble(plan) {
  const figProps = plan.figure_tianzige || { kind: "tianzige", chars: [], pinyin: [] };
  return {
    elements: [
      makeElement("txt_write_title", "title", { text: plan.title }),
      makeElement("fig_tianzige", "figure_tianzige", figProps),
      makeElement("card_rules", "card_list", { items: plan.rules || [] }),
      makeElement("card_tip", "conclusion_banner", { text: plan.guidance_tip || "认真描红临写。" })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_write_title"),
      makeTimelineStep(0, "show", "fig_tianzige"),
      makeTimelineStep(1, "reveal", "card_rules"),
      makeTimelineStep(2, "reveal", "card_tip")
    ]
  };
}
