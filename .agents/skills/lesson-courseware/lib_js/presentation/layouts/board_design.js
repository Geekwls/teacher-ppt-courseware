// -*- coding: utf-8 -*-
/** 板书设计版式: 课题条 + 1~3 个分支卡 + 可选页脚, 分支逐拍揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "board_design";
export const required = { ids: ["txt_board_title", "card_board_topic"] };

export function assemble(plan) {
  const branches = plan.board_branches || [];
  const elements = [
    makeElement("txt_board_title", "title", { text: plan.title }),
    makeElement("card_board_topic", "text_card", {
      title: "【课题】",
      body: plan.board_topic || ""
    })
  ];
  branches.forEach((b, idx) => {
    elements.push(makeElement(`card_board_${idx}`, "card_list", {
      head: b.head || b.heading,
      items: b.items || []
    }));
  });

  const timeline = [
    makeTimelineStep(0, "show", "txt_board_title"),
    makeTimelineStep(0, "show", "card_board_topic")
  ];
  branches.forEach((b, idx) => {
    timeline.push(makeTimelineStep(idx + 1, "reveal", `card_board_${idx}`));
  });

  if (plan.board_footer) {
    elements.push(makeElement("banner_board_footer", "conclusion_banner", { text: plan.board_footer }));
    timeline.push(makeTimelineStep(branches.length + 1, "reveal", "banner_board_footer"));
  }

  return { elements, timeline };
}
