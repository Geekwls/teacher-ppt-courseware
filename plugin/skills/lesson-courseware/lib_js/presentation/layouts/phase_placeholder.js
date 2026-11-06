// -*- coding: utf-8 -*-
/** 骨架缺口占位版式: 全部常驻, 不做分步 (它不是教学内容)。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "phase_placeholder";
export const required = { ids: ["txt_ph_title", "card_ph_hint"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("txt_ph_title", "title", { text: plan.title }),
      makeElement("card_ph_hint", "card_list", { items: plan.items || [] })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_ph_title"),
      makeTimelineStep(0, "show", "card_ph_hint")
    ]
  };
}
