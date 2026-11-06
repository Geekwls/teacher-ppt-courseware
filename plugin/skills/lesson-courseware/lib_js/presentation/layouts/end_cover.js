// -*- coding: utf-8 -*-
/** 封底版式: 下课寄语与学科副标题。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "end_cover";
export const required = { ids: ["end_title"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("end_title", "title", {
        text: plan.title,
        subtitle: plan.subtitle
      })
    ],
    timeline: [makeTimelineStep(0, "show", "end_title")]
  };
}
