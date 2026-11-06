// -*- coding: utf-8 -*-
/** 课堂练习版式: 题目列表常驻, 作答页不提前泄露答案。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "practice_list";
export const required = { ids: ["txt_pr_title", "card_questions"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("txt_pr_title", "title", { text: plan.title }),
      makeElement("card_questions", "practice_list", {
        questions: plan.questions || []
      })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_pr_title"),
      makeTimelineStep(0, "show", "card_questions")
    ]
  };
}
