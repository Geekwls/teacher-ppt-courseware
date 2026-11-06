// -*- coding: utf-8 -*-
/**
 * 声明式组合版式 Spec 加载与校验 (composite_specs.js)
 *
 * 组合版式让"每个单元想要不一样的版面"成为数据问题:
 * spec 声明网格 + 槽位(图元类型/内容/跨度) + 揭示时序, 由通用 assembler/renderer 执行。
 * spec 可以内联在教学设计 content_block.layout_spec, 或作为命名 spec 存放在
 * references/layouts/composite-specs.yaml 供多个单元复用。
 *
 * 校验 fail-closed: spec 非法立即抛错, 绝不带病装配。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_PATH = path.resolve(__dirname, "..", "..", "references", "layouts", "composite-specs.yaml");

/** 组合版式可绘制的元素类型 (与 renderers/composite.js 的 painter 一一对应) */
export const COMPOSITE_ELEMENT_TYPES = [
  "title",
  "subtitle",
  "text_card",
  "equation",
  "card_list",
  "conclusion_banner",
  "figure_number_line",
  "figure_tianzige",
  "figure_animation"
];

/** 与 presentation/layout_registry.js 的 ACTIONS 保持一致 (避免循环导入, 契约测试守护同构) */
const ACTIONS = ["show", "reveal", "hide"];

const ZONE_ID_PATTERN = /^[a-z0-9_]+$/;

function fail(message) {
  throw new Error(`[composite_spec] ${message}`);
}

function isInt(value, min, max) {
  return Number.isInteger(value) && value >= min && (max === undefined || value <= max);
}

/**
 * 校验并归一化一个 spec 对象, 返回 { grid: {cols, gapX, gapY}, zones, timeline }。
 * @param {object} raw spec 原始对象
 * @param {string} source 错误信息中标注来源 (命名 spec id / inline)
 */
export function validateCompositeSpec(raw, source = "spec") {
  const label = `[${source}]`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail(`${label} spec 必须是对象`);
  }

  // 1. 网格
  const grid = raw.grid && typeof raw.grid === "object" ? raw.grid : {};
  const cols = grid.cols === undefined ? 2 : grid.cols;
  if (!isInt(cols, 1, 4)) fail(`${label} grid.cols 必须是 1~4 的整数`);
  const gapX = grid.gapX === undefined ? 0.3 : Number(grid.gapX);
  const gapY = grid.gapY === undefined ? 0.25 : Number(grid.gapY);
  if (!(gapX >= 0 && gapX <= 2) || !(gapY >= 0 && gapY <= 2)) {
    fail(`${label} grid.gapX/gapY 必须在 0~2 英寸之间`);
  }

  // 2. 槽位
  const zones = raw.zones;
  if (!Array.isArray(zones) || zones.length === 0) {
    fail(`${label} zones 必须是非空数组`);
  }
  if (zones.length > 12) fail(`${label} zones 单页不得超过 12 个槽位`);

  const zoneIds = new Set();
  const normalizedZones = zones.map((zone, idx) => {
    const at = `${label} zones[${idx}]`;
    if (!zone || typeof zone !== "object") fail(`${at} 必须是对象`);
    if (!COMPOSITE_ELEMENT_TYPES.includes(zone.type)) {
      fail(`${at} 元素类型 [${zone.type}] 不受组合版式支持, 可用: ${COMPOSITE_ELEMENT_TYPES.join(", ")}`);
    }
    const zoneId = zone.id === undefined ? `zone_${idx + 1}` : zone.id;
    if (typeof zoneId !== "string" || !ZONE_ID_PATTERN.test(zoneId)) {
      fail(`${at} id [${zoneId}] 必须匹配 ^[a-z0-9_]+$`);
    }
    if (zoneIds.has(zoneId)) fail(`${at} id [${zoneId}] 重复`);
    zoneIds.add(zoneId);
    const span = zone.span === undefined ? 1 : zone.span;
    if (!isInt(span, 1, cols)) fail(`${at} span 必须是 1~${cols} 的整数`);
    if (zone.properties !== undefined && (typeof zone.properties !== "object" || zone.properties === null || Array.isArray(zone.properties))) {
      fail(`${at} properties 必须是对象`);
    }
    return {
      id: zoneId,
      type: zone.type,
      span,
      properties: zone.properties ? JSON.parse(JSON.stringify(zone.properties)) : {}
    };
  });

  const totalSpan = normalizedZones.reduce((acc, z) => acc + z.span, 0);
  if (totalSpan < normalizedZones.length) fail(`${label} 槽位总数异常`);

  // 3. 揭示时序
  let timeline = raw.timeline;
  if (timeline !== undefined && timeline !== null) {
    if (!Array.isArray(timeline)) fail(`${label} timeline 必须是数组`);
    timeline = timeline.map((t, idx) => {
      const at = `${label} timeline[${idx}]`;
      if (!t || typeof t !== "object") fail(`${at} 必须是对象`);
      if (!isInt(t.step, 0)) fail(`${at} step 必须是非负整数`);
      if (!ACTIONS.includes(t.action)) fail(`${at} action [${t.action}] 不支持, 可用: ${ACTIONS.join(", ")}`);
      if (!zoneIds.has(t.target)) fail(`${at} target [${t.target}] 未在 zones 中定义`);
      return { step: t.step, action: t.action, target: t.target };
    });
    // 与表现门禁一致: step 单调不递减
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i].step < timeline[i - 1].step) {
        fail(`${label} timeline step 必须单调不递减`);
      }
    }
  } else {
    timeline = null; // 由 assembler 生成默认时序
  }

  return {
    grid: { cols, gapX, gapY },
    zones: normalizedZones,
    timeline
  };
}

let cachedSpecs = null;

function loadCompositeSpecs() {
  if (cachedSpecs) return cachedSpecs;
  if (!fs.existsSync(SPECS_PATH)) {
    fail(`命名 spec 库不存在: ${SPECS_PATH}`);
  }
  const doc = yaml.load(fs.readFileSync(SPECS_PATH, "utf-8"));
  if (!doc || typeof doc !== "object" || !doc.specs || typeof doc.specs !== "object") {
    fail(`命名 spec 库缺少 specs 段: ${SPECS_PATH}`);
  }
  const out = {};
  for (const [id, raw] of Object.entries(doc.specs)) {
    if (!ZONE_ID_PATTERN.test(id)) fail(`命名 spec id [${id}] 必须匹配 ^[a-z0-9_]+$`);
    out[id] = validateCompositeSpec(raw, `specs.${id}`);
    out[id].spec_id = id;
  }
  cachedSpecs = out;
  return cachedSpecs;
}

export function getCompositeSpec(id) {
  const specs = loadCompositeSpecs();
  if (!specs[id]) {
    fail(`未找到命名组合版式 [${id}], 可用: ${Object.keys(specs).join(", ") || "(空)"}`);
  }
  return JSON.parse(JSON.stringify(specs[id]));
}

export function listCompositeSpecIds() {
  return Object.keys(loadCompositeSpecs());
}

/**
 * 从 SlidePlan 解析 spec: 优先内联 layout_spec, 其次命名 layout_spec_name。
 */
export function resolveSpecForPlan(plan) {
  if (plan.layout_spec && typeof plan.layout_spec === "object") {
    const spec = validateCompositeSpec(plan.layout_spec, "inline layout_spec");
    spec.spec_id = plan.layout_spec_name || "inline";
    return spec;
  }
  const name = plan.layout_spec_name;
  if (!name) {
    fail("缺少版式声明: 需要 layout_spec (内联对象) 或 layout_spec_name (命名 spec)");
  }
  return getCompositeSpec(name);
}
