// -*- coding: utf-8 -*-
/** 知识树页渲染器 (委托 new_page_renderers)。 */

import { renderKnowledgeTree } from "../new_page_renderers.js";

export function render(slide, s, ctx) {
  renderKnowledgeTree(slide, ctx.pptx, ctx.t, s, ctx.cardShadow, ctx.fontFamily);
}
