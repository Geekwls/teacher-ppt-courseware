// -*- coding: utf-8 -*-
/**
 * 版式渲染器注册表 (rendering/renderers/index.js)
 *
 * 与 presentation/layout_registry.js 的 LAYOUT_IDS 一一对应:
 * 前者负责"装配成什么 AST", 这里负责"AST 怎么画"。
 * 新增版式 = 新增一个 layout 模块 + 一个 renderer 模块, 两处登记。
 */

import * as title_cover from "./title_cover.js";
import * as objectives_card from "./objectives_card.js";
import * as context_problem from "./context_problem.js";
import * as model_left_reasoning_right from "./model_left_reasoning_right.js";
import * as example_step_by_step from "./example_step_by_step.js";
import * as misconception_split from "./misconception_split.js";
import * as character_practice from "./character_practice.js";
import * as reading_focus from "./reading_focus.js";
import * as practice_list from "./practice_list.js";
import * as answer_reveal_list from "./answer_reveal_list.js";
import * as summary_card from "./summary_card.js";
import * as phase_placeholder from "./phase_placeholder.js";
import * as board_design from "./board_design.js";
import * as homework_card from "./homework_card.js";
import * as activity_instruction from "./activity_instruction.js";
import * as comparison_table from "./comparison_table.js";
import * as knowledge_tree from "./knowledge_tree.js";
import * as end_cover from "./end_cover.js";
import * as composite from "./composite.js";

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
  end_cover,
  composite
};

export const RENDER_LAYOUT_IDS = Object.keys(MODULES);

export const LAYOUT_RENDERERS = Object.fromEntries(
  RENDER_LAYOUT_IDS.map(id => [id, MODULES[id].render])
);

export function renderLayout(slide, s, ctx) {
  const renderer = LAYOUT_RENDERERS[s.layout];
  if (!renderer) {
    throw new Error(`未注册版式渲染器: ${s.layout}`);
  }
  renderer(slide, s, ctx);
}
