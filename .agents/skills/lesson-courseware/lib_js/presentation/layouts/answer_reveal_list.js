// -*- coding: utf-8 -*-
/**
 * 参考答案版式: 全部题干常驻, 答案按题号逐拍揭晓。
 * 题干与答案共用同一个 answer_feedback 元素, timeline 指向子图元。
 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "answer_reveal_list";
export const required = { ids: ["txt_ans_title"] };

export function assemble(plan) {
  const elements = [
    makeElement("txt_ans_title", "title", { text: plan.title })
  ];
  const timeline = [makeTimelineStep(0, "show", "txt_ans_title")];

  const ansItems = plan.answer_items || [];
  // 1. 全部题干设为 step 0 (常驻)
  ansItems.forEach(it => {
    elements.push(makeElement(it.id, "answer_feedback", {
      question_num: it.question_num,
      stem: it.stem,
      explanation: it.explanation
    }));
    timeline.push(makeTimelineStep(0, "show", `${it.id}.stem`));
  });

  // 2. 全部答案设为 step 1 ~ N (逐步揭晓)
  ansItems.forEach((it, idx) => {
    timeline.push(makeTimelineStep(idx + 1, "reveal", `${it.id}.explanation`));
  });

  return { elements, timeline };
}
