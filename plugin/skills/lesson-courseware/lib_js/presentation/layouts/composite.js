// -*- coding: utf-8 -*-
/**
 * 声明式组合版式装配器 (layouts/composite.js)
 *
 * 把命名/内联 spec 装配为标准 Presentation AST 页面:
 *   - 网格 + 槽位 -> elements, 槽位以 _zone 结构标注 (row/col/span/cols/gap), 绝不带像素;
 *     像素几何由 renderers/composite.js 依据安全区与 gap 计算, 保持"规划无坐标"纪律;
 *   - properties 字符串值支持 "$plan:字段路径" 引用 SlidePlan 字段 (缺失即失败);
 *   - figure_number_line 的 marks 缺省时由 arcs 自动推导;
 *   - timeline 取自 spec, 缺省全部槽位 step 0 常驻。
 */

import { resolveSpecForPlan } from "../composite_specs.js";

export const id = "composite";
export const required = { ids: ["txt_composite_title"], types: [], minElements: 2 };

/** 解析 "$plan:a.b" 形式的字符串引用; 其余值原样返回。
 *  空串是合法值 (如 image_path="" 表示用占位卡), 仅 undefined/null 视为缺失。 */
function resolvePlanRefs(value, plan, zoneId) {
  if (typeof value === "string") {
    if (!value.startsWith("$plan:")) return value;
    const fieldPath = value.slice("$plan:".length).trim();
    const resolved = fieldPath.split(".").reduce((node, key) => {
      if (node === null || node === undefined) return undefined;
      return node[key];
    }, plan);
    if (resolved === undefined || resolved === null) {
      throw new Error(`[composite] 槽位 ${zoneId} 的引用 ${value} 在 SlidePlan 上无值, 请补齐内容或调整 spec`);
    }
    return resolved;
  }
  if (Array.isArray(value)) {
    return value.map(v => resolvePlanRefs(v, plan, zoneId));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolvePlanRefs(v, plan, zoneId);
    return out;
  }
  return value;
}

export function assemble(plan) {
  const spec = resolveSpecForPlan(plan);
  const { grid, zones, timeline } = spec;

  const elements = [
    // 页标题: 交给 deck_builder 的统一页框绘制, composite renderer 不重复绘制
    { id: "txt_composite_title", type: "title", properties: { text: plan.title || "" } }
  ];

  let col = 0;
  let row = 0;
  const zoneIds = [];
  for (const zone of zones) {
    if (col + zone.span > grid.cols) {
      row += 1;
      col = 0;
    }
    const properties = resolvePlanRefs(zone.properties, plan, zone.id);
    // figure_number_line: marks 缺省时由 arcs 自动推导
    if (zone.type === "figure_number_line" && !properties.marks) {
      const arcs = Array.isArray(properties.arcs) ? properties.arcs : [];
      properties.marks = [properties.start, ...arcs.map(a => a.to)];
    }
    properties._zone = {
      row,
      col,
      span: zone.span,
      cols: grid.cols,
      gapX: grid.gapX,
      gapY: grid.gapY
    };
    elements.push({ id: zone.id, type: zone.type, properties });
    zoneIds.push(zone.id);
    col += zone.span;
  }

  const steps = timeline
    ? timeline.map(t => ({ ...t }))
    : [
        { step: 0, action: "show", target: "txt_composite_title" },
        ...zoneIds.map(zid => ({ step: 0, action: "show", target: zid }))
      ];
  if (timeline) {
    steps.unshift({ step: 0, action: "show", target: "txt_composite_title" });
  }

  return { elements, timeline: steps };
}
