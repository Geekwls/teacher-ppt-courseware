// -*- coding: utf-8 -*-
/**
 * 版式装配公共工具 (layouts/common.js)
 *
 * 每个版式模块只负责"SlidePlan -> elements + timeline"的纯数据转换,
 * 不感知像素、颜色与渲染器。元素 ID 是 AST 契约的一部分, 变更需同步快照。
 */

export function makeElement(id, type, properties) {
  return { id, type, properties };
}

export function makeTimelineStep(step, action, target) {
  return { step, action, target };
}
