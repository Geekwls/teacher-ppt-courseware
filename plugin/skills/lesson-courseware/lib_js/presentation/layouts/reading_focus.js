// -*- coding: utf-8 -*-
/** 阅读品读版式: 原文卡常驻, 设问与核心句按需揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "reading_focus";
export const required = { ids: ["txt_read_title", "card_reading_text"] };

export function assemble(plan) {
  const elements = [
    makeElement("txt_read_title", "title", { text: plan.title }),
    makeElement("card_reading_text", "text_card", {
      title: plan.context_title || "【课文精读】",
      body: plan.context_body || "",
      reading_guide: plan.reading_guide || null
    })
  ];
  const timeline = [
    makeTimelineStep(0, "show", "txt_read_title"),
    makeTimelineStep(0, "show", "card_reading_text")
  ];

  const hasQuestions = plan.questions && plan.questions.length > 0;
  if (hasQuestions) {
    elements.push(makeElement("card_questions", "card_list", { items: plan.questions }));
    timeline.push(makeTimelineStep(1, "reveal", "card_questions"));
  }
  if (plan.conclusion_text) {
    elements.push(makeElement("banner_key_phrase", "conclusion_banner", { text: plan.conclusion_text }));
    timeline.push(makeTimelineStep(hasQuestions ? 2 : 1, "reveal", "banner_key_phrase"));
  }

  return { elements, timeline };
}
