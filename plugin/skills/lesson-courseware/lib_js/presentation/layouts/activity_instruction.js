// -*- coding: utf-8 -*-
/** 活动指令版式: 活动类型/时长/任务/提示统一装进活动卡。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "activity_instruction";
export const required = { ids: ["txt_act_title", "card_activity"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("txt_act_title", "title", { text: plan.title }),
      makeElement("card_activity", "activity_card", {
        activity_type: plan.activity_type,
        duration: plan.duration,
        tasks: plan.tasks || [],
        prompt: plan.prompt
      })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_act_title"),
      makeTimelineStep(1, "reveal", "card_activity")
    ]
  };
}
