// -*- coding: utf-8 -*-
/** 学习目标页渲染器 (委托 new_page_renderers)。 */

import { renderObjectivesCard } from "../new_page_renderers.js";

export function render(slide, s, ctx) {
  renderObjectivesCard(slide, ctx.pptx, ctx.t, s, ctx.cardShadow, ctx.fontFamily);
}
