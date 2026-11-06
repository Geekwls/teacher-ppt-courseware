// -*- coding: utf-8 -*-
/** 例题分步版式: 题目常驻, 解题步骤与答语依次揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "example_step_by_step";
export const required = { ids: ["txt_ex_title", "card_ex_problem", "card_ex_steps"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("txt_ex_title", "title", { text: plan.title }),
      makeElement("card_ex_problem", "text_card", {
        title: plan.problem_title,
        body: plan.problem_body
      }),
      makeElement("card_ex_steps", "card_list", {
        items: plan.steps || []
      }),
      makeElement("ans_ex_feedback", "answer_feedback", {
        text: plan.answer ? `答：${plan.answer.replace(/^答[:：]?\s*/, "")}` : ""
      })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_ex_title"),
      makeTimelineStep(0, "show", "card_ex_problem"),
      makeTimelineStep(1, "reveal", "card_ex_steps"),
      makeTimelineStep(2, "reveal", "ans_ex_feedback")
    ]
  };
}
