// -*- coding: utf-8 -*-
/** 情境导入版式: 情境卡常驻, 算式/核心表达第二拍揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "context_problem";
export const required = { ids: ["txt_warmup_title", "card_context"] };

export function assemble(plan) {
  const elements = [
    makeElement("txt_warmup_title", "title", { text: plan.title }),
    makeElement("card_context", "text_card", {
      title: plan.context_title,
      body: plan.context_body
    }),
    makeElement("eq_warmup", "equation", {
      expression: plan.equation
    })
  ];
  const timeline = [
    makeTimelineStep(0, "show", "txt_warmup_title"),
    makeTimelineStep(0, "show", "card_context")
  ];

  // 配图位 (B3): 教学设计声明 image_path/image_alt 时生成图元;
  // 无真实图片文件时渲染器降级为虚线占位卡, alt 文案上屏提示替换。
  // 图元与情境卡同为 step 0 常驻, 必须插在算式揭示 (step 1) 之前保持时序单调。
  if (plan.image_path || plan.image_alt) {
    elements.push(makeElement("fig_ctx_image", "figure_image", {
      path: plan.image_path || "",
      alt: plan.image_alt || ""
    }));
    timeline.push(makeTimelineStep(0, "show", "fig_ctx_image"));
  }

  timeline.push(makeTimelineStep(1, "reveal", "eq_warmup"));

  return { elements, timeline };
}
