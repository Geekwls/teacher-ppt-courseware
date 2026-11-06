// -*- coding: utf-8 -*-
/** 课堂练习页渲染器 (委托 new_page_renderers)。 */

import { renderPracticeList } from "../new_page_renderers.js";

export function render(slide, s, ctx) {
  renderPracticeList(slide, ctx.pptx, ctx.t, s, ctx.cardShadow, ctx.fontFamily);
}
