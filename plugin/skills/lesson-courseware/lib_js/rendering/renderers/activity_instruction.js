// -*- coding: utf-8 -*-
/** 活动指令页渲染器 (委托 new_page_renderers)。 */

import { renderActivityInstruction } from "../new_page_renderers.js";

export function render(slide, s, ctx) {
  renderActivityInstruction(slide, ctx.pptx, ctx.t, s, ctx.cardShadow, ctx.fontFamily);
}
