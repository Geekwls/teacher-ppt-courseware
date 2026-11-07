// -*- coding: utf-8 -*-
/**
 * 内容块类型 → 版式映射解析 (block_layout_map.js)
 *
 * 事实源: references/strategies/block-layout-map.yaml
 * 解析优先级: content_block.layout 显式 > units[unitKey] > subjects[subject] > default。
 * 映射到的版式必须是 layout_registry 已注册版式, 加载即校验 (fail-closed)。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as yaml from "js-yaml";
import { LAYOUT_IDS } from "../presentation/layout_registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.resolve(__dirname, "..", "..", "references", "strategies", "block-layout-map.yaml");

let cachedMap = null;

function validateEntry(entry, at) {
  const normalized = typeof entry === "string"
    ? { layout: entry, spec: null }
    : (entry && typeof entry === "object"
        ? { layout: entry.layout, spec: entry.spec || null }
        : null);
  if (!normalized || !normalized.layout) {
    throw new Error(`[block_layout_map] ${at} 映射值必须是版式 id 字符串或 {layout, spec} 对象`);
  }
  if (!LAYOUT_IDS.includes(normalized.layout)) {
    throw new Error(`[block_layout_map] ${at} 指向未注册版式 [${normalized.layout}], 可用: ${LAYOUT_IDS.join(", ")}`);
  }
  return normalized;
}

function loadBlockLayoutMap() {
  if (cachedMap) return cachedMap;
  if (!fs.existsSync(MAP_PATH)) {
    throw new Error(`[block_layout_map] 映射表不存在: ${MAP_PATH}`);
  }
  const doc = yaml.load(fs.readFileSync(MAP_PATH, "utf-8"));
  if (!doc || typeof doc !== "object" || !doc.default || typeof doc.default !== "object") {
    throw new Error(`[block_layout_map] 映射表缺少 default 段: ${MAP_PATH}`);
  }
  const out = { default: {}, subjects: {}, units: {}, styles: {} };

  for (const [blockType, entry] of Object.entries(doc.default)) {
    out.default[blockType] = validateEntry(entry, `default.${blockType}`);
  }
  for (const [subject, entries] of Object.entries(doc.subjects || {})) {
    out.subjects[subject] = {};
    for (const [blockType, entry] of Object.entries(entries || {})) {
      out.subjects[subject][blockType] = validateEntry(entry, `subjects.${subject}.${blockType}`);
    }
  }
  for (const [styleId, entries] of Object.entries(doc.styles || {})) {
    out.styles[styleId] = {};
    for (const [blockType, entry] of Object.entries(entries || {})) {
      out.styles[styleId][blockType] = validateEntry(entry, `styles.${styleId}.${blockType}`);
    }
  }
  for (const [unitKey, entries] of Object.entries(doc.units || {})) {
    out.units[unitKey] = {};
    for (const [blockType, entry] of Object.entries(entries || {})) {
      out.units[unitKey][blockType] = validateEntry(entry, `units.${unitKey}.${blockType}`);
    }
  }

  cachedMap = out;
  return cachedMap;
}

/** 单元键: {subject}-g{grade}-t{1|2}-u{unit 补零两位}, 如 math-g3-t1-u04 */
export function unitKeyOf(meta = {}) {
  const termNum = String(meta.term || "term-1").endsWith("2") ? 2 : 1;
  const unit = meta.unit === undefined || meta.unit === null ? "?" : String(meta.unit).padStart(2, "0");
  return `${meta.subject || "math"}-g${meta.grade ?? "?"}-t${termNum}-u${unit}`;
}

/**
 * 纯函数查表: 供 resolveBlockLayout 与单测复用, 优先级 units > subjects > default。
 * @returns {{ layout: string, spec: string|null }} 未命中返回 null
 */
/**
 * 纯函数查表: 供 resolveBlockLayout 与单测复用。
 * 优先级: units > subjects > styles > default; 返回带 level 标记的归一化条目。
 * @returns {{ layout: string, spec: string|null, level: string }|null} 未命中返回 null
 */
export function resolveFromMap(map, { meta = {}, cb = {}, style = "" } = {}) {
  const blockType = cb.type;
  const unitKey = unitKeyOf(meta);
  const hit = [
    ["units", map.units?.[unitKey]?.[blockType]],
    ["subjects", map.subjects?.[meta.subject]?.[blockType]],
    ["styles", map.styles?.[style]?.[blockType]],
    ["default", map.default?.[blockType]]
  ].find(([, entry]) => entry !== undefined && entry !== null);
  if (!hit) return null;
  const [level, entry] = hit;
  // 兼容原始映射 (测试/外部构造): 字符串与 {layout, spec} 两种写法都归一化
  return typeof entry === "string"
    ? { layout: entry, spec: null, level }
    : { layout: entry.layout, spec: entry.spec || null, level };
}

/**
 * 解析某内容块应使用的版式。
 * @param {object} input
 *   - meta: 教学设计 meta
 *   - cb:   content_block
 *   - style: 最终生效的风格包 id (来自场景预设/style 解析), 用于 styles 层覆盖
 * @returns {{ layout: string|null, spec: string|null, explicit: boolean, level: string|null }}
 *   layout 为 null 表示映射表与显式指定都未覆盖 (调用方按历史行为跳过)。
 */
export function resolveBlockLayout({ meta = {}, cb = {}, style = "" } = {}) {
  if (cb.layout) {
    if (!LAYOUT_IDS.includes(cb.layout)) {
      throw new Error(`[block_layout_map] content_block.layout [${cb.layout}] 不是已注册版式, 可用: ${LAYOUT_IDS.join(", ")}`);
    }
    return { layout: cb.layout, spec: cb.layout_spec_name || null, explicit: true, level: "explicit" };
  }

  const map = loadBlockLayoutMap();
  const entry = resolveFromMap(map, { meta, cb, style });
  if (!entry) return { layout: null, spec: null, explicit: false, level: null };
  return { ...entry, explicit: false };
}
