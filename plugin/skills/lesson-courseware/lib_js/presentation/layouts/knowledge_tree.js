// -*- coding: utf-8 -*-
/** 知识树版式: 根主题 + 分支/叶节点, 整图揭示。 */

import { makeElement, makeTimelineStep } from "./common.js";

export const id = "knowledge_tree";
export const required = { ids: ["txt_tree_title", "graph_tree"] };

export function assemble(plan) {
  return {
    elements: [
      makeElement("txt_tree_title", "title", { text: plan.title }),
      makeElement("graph_tree", "tree_graph", {
        root_topic: plan.root_topic,
        branches: plan.branches || []
      })
    ],
    timeline: [
      makeTimelineStep(0, "show", "txt_tree_title"),
      makeTimelineStep(1, "reveal", "graph_tree")
    ]
  };
}
