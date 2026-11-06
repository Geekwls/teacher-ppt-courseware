// -*- coding: utf-8 -*-
/**
 * 版式注册表 (layout_registry.js) —— 版式知识的唯一事实源
 *
 * 每个版式一个模块, 声明:
 *   - id:        AST 契约中的 layout 枚举值
 *   - required:  门禁必须校验的必需元素 (ids/types)
 *   - assemble:  SlidePlan -> { elements, timeline } 的纯函数
 *
 * presentation.schema.json、presentation_validator.js、lesson_to_presentation.js
 * 全部从这里派生; 新增版式只需新增一个模块并在此登记, 契约测试会自动比对枚举。
 */

import * as title_cover from "./layouts/title_cover.js";
import * as objectives_card from "./layouts/objectives_card.js";
import * as context_problem from "./layouts/context_problem.js";
import * as model_left_reasoning_right from "./layouts/model_left_reasoning_right.js";
import * as example_step_by_step from "./layouts/example_step_by_step.js";
import * as misconception_split from "./layouts/misconception_split.js";
import * as character_practice from "./layouts/character_practice.js";
import * as reading_focus from "./layouts/reading_focus.js";
import * as practice_list from "./layouts/practice_list.js";
import * as answer_reveal_list from "./layouts/answer_reveal_list.js";
import * as summary_card from "./layouts/summary_card.js";
import * as phase_placeholder from "./layouts/phase_placeholder.js";
import * as board_design from "./layouts/board_design.js";
import * as homework_card from "./layouts/homework_card.js";
import * as activity_instruction from "./layouts/activity_instruction.js";
import * as comparison_table from "./layouts/comparison_table.js";
import * as knowledge_tree from "./layouts/knowledge_tree.js";
import * as end_cover from "./layouts/end_cover.js";

const MODULES = {
  title_cover,
  objectives_card,
  context_problem,
  model_left_reasoning_right,
  example_step_by_step,
  misconception_split,
  character_practice,
  reading_focus,
  practice_list,
  answer_reveal_list,
  summary_card,
  phase_placeholder,
  board_design,
  homework_card,
  activity_instruction,
  comparison_table,
  knowledge_tree,
  end_cover
};

export const LAYOUT_IDS = Object.keys(MODULES);

export const LAYOUTS = Object.fromEntries(
  LAYOUT_IDS.map(id => [id, {
    id,
    required: MODULES[id].required || { ids: [], types: [] },
    assemble: MODULES[id].assemble
  }])
);

/** AST 中允许出现的图元类型 (与 presentation.schema.json 的 type 枚举同构) */
export const ELEMENT_TYPES = [
  "title",
  "subtitle",
  "text_card",
  "equation",
  "figure_number_line",
  "figure_tianzige",
  "figure_animation",
  "card_list",
  "conclusion_banner",
  "practice_list",
  "answer_feedback",
  "tier_list",
  "activity_card",
  "comparison_table",
  "tree_graph"
];

/** AST 中允许出现的时间线动作 */
export const ACTIONS = ["show", "reveal", "hide"];

export function assembleSlide(plan) {
  const layout = LAYOUTS[plan.layout];
  if (!layout) {
    throw new Error(`未知版式: ${plan.layout}`);
  }
  return layout.assemble(plan);
}
