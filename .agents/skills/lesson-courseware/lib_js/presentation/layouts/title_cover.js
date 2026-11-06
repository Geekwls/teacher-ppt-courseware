// -*- coding: utf-8 -*-
/** 封面版式: 课题 + 学段/学科/单元副标题。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "title_cover";
export const required = { ids: ["cover_title"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("cover_title", "title", {
        text: plan.title,
        subtitle: plan.subtitle
      })
    ],
    timeline: [makeTimelineStep(0, "show", "cover_title")]
  };
}
