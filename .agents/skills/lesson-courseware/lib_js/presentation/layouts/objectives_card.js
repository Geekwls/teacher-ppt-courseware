// -*- coding: utf-8 -*-
/** 学习目标版式: 目标卡列表, 第二拍整体揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "objectives_card";
export const required = { ids: ["txt_obj_title", "card_obj_list"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("txt_obj_title", "title", { text: plan.title }),
      makeElement("card_obj_list", "card_list", { items: plan.items || [] })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_obj_title"),
      makeTimelineStep(1, "reveal", "card_obj_list")
    ]
  };
}
