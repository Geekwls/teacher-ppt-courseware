// -*- coding: utf-8 -*-
/**
 * 教学质量规则加载器 (quality/rules.js)
 *
 * 规则数据在 references/strategies/quality-rules.yaml:
 *   - typos:                错别字/笔误
 *   - scope_exclusions:     禁区词边界例外 (防误杀)
 *   - number_scan:          数域扫描跳过键与标识符前缀
 *
 * 加载一次并缓存; 缺失或结构不合法时 fail-closed (抛错), 不允许静默放行。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.resolve(__dirname, "..", "..", "references", "strategies", "quality-rules.yaml");

let cachedDoc = null;
let cachedScan = null;
let cachedScope = null;

function assert(condition, message) {
  if (!condition) throw new Error(`[quality_rules] ${message}`);
}

export function loadQualityRules() {
  if (cachedDoc) return cachedDoc;
  assert(fs.existsSync(RULES_PATH), `规则包不存在: ${RULES_PATH}`);
  const doc = yaml.load(fs.readFileSync(RULES_PATH, "utf-8"));
  assert(doc && typeof doc === "object", "规则包必须是 YAML 对象");
  assert(Array.isArray(doc.typos), "typos 必须是数组");
  assert(Array.isArray(doc.scope_exclusions), "scope_exclusions 必须是数组");
  assert(doc.number_scan && typeof doc.number_scan === "object", "number_scan 必须存在");
  assert(Array.isArray(doc.number_scan.skip_keys), "number_scan.skip_keys 必须是数组");
  assert(Array.isArray(doc.number_scan.skip_id_patterns), "number_scan.skip_id_patterns 必须是数组");

  for (const rule of doc.typos) {
    assert(rule.wrong && rule.right, `typos 条目缺少 wrong/right: ${JSON.stringify(rule)}`);
  }
  for (const rule of doc.scope_exclusions) {
    assert(rule.term, `scope_exclusions 条目缺少 term: ${JSON.stringify(rule)}`);
  }

  cachedDoc = doc;
  return cachedDoc;
}

export function getNumberScanPolicy() {
  if (cachedScan) return cachedScan;
  const doc = loadQualityRules();
  const skipKeys = new Set(doc.number_scan.skip_keys);
  let idPatterns;
  try {
    idPatterns = doc.number_scan.skip_id_patterns.map(pattern => new RegExp(pattern, "i"));
  } catch (err) {
    throw new Error(`[quality_rules] skip_id_patterns 存在非法正则: ${err.message}`);
  }
  cachedScan = { skipKeys, idPatterns };
  return cachedScan;
}

/** term -> not_preceded_by[]; 供禁区词边界防误杀使用 */
export function getScopeExceptions() {
  if (cachedScope) return cachedScope;
  const doc = loadQualityRules();
  cachedScope = new Map(
    doc.scope_exclusions.map(rule => [rule.term, Array.isArray(rule.not_preceded_by) ? rule.not_preceded_by : []])
  );
  return cachedScope;
}

export function getTypoRules() {
  return loadQualityRules().typos;
}
