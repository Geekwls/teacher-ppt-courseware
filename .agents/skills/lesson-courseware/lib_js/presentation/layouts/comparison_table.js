// -*- coding: utf-8 -*-
/** 对比表版式: 表格整体揭示, 可选总结提示横幅。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "comparison_table";
export const required = { ids: ["txt_cmp_title", "tbl_comparison"] };

export function assemble(plan) {
  const elements = [
    makeElement("txt_cmp_title", "title", { text: plan.title }),
    makeElement("tbl_comparison", "comparison_table", {
      headers: plan.headers || [],
      rows: plan.rows || []
    })
  ];
  const timeline = [
    makeTimelineStep(0, "show", "txt_cmp_title"),
    makeTimelineStep(1, "reveal", "tbl_comparison")
  ];

  if (plan.summary_tip) {
    elements.push(makeElement("banner_cmp_tip", "conclusion_banner", { text: plan.summary_tip }));
    timeline.push(makeTimelineStep(2, "reveal", "banner_cmp_tip"));
  }

  return { elements, timeline };
}
