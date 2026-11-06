// -*- coding: utf-8 -*-
/** 小结页渲染器 (委托 new_page_renderers)。 */

import { renderSummaryCard } from "../new_page_renderers.js";

export function render(slide, s, ctx) {
  renderSummaryCard(slide, ctx.pptx, ctx.t, s, ctx.cardShadow, ctx.fontFamily);
}
