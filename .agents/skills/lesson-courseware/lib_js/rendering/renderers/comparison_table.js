// -*- coding: utf-8 -*-
/** 对比表页渲染器 (委托 new_page_renderers)。 */

import { renderComparisonTable } from "../new_page_renderers.js";

export function render(slide, s, ctx) {
  renderComparisonTable(slide, ctx.pptx, ctx.t, s, ctx.cardShadow, ctx.fontFamily);
}
