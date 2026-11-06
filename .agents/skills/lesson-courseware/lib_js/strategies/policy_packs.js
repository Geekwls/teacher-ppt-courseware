// -*- coding: utf-8 -*-
/**
 * 策略偏好包加载与合并 (policy_packs.js)
 *
 * 事实源: references/strategies/policy-packs.yaml
 * 合并优先级: 显式 userPreferences > lessons[lesson_id] > units[unitKey] > meta 默认。
 * 白名单外的键加载即报错 (fail-closed), 防止拼错的偏好被静默忽略。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as yaml from "js-yaml";
import { unitKeyOf } from "./block_layout_map.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_PATH = path.resolve(__dirname, "..", "..", "references", "strategies", "policy-packs.yaml");

export const POLICY_PACK_ALLOWED_KEYS = [
  "style",
  "preset",
  "layout_variant",
  "layout_variants",
  "skeleton_fill"
];

let cachedPacks = null;

function fail(message) {
  throw new Error(`[policy_packs] ${message}`);
}

/** 校验并归一化一个偏好包条目 (未知键/类型错误立即抛错) */
export function validatePolicyPackEntry(entry, at) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`${at} 必须是对象`);
  }
  const out = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!POLICY_PACK_ALLOWED_KEYS.includes(key)) {
      fail(`${at} 含未知偏好键 [${key}], 允许: ${POLICY_PACK_ALLOWED_KEYS.join(", ")}`);
    }
    switch (key) {
      case "style":
      case "preset":
      case "layout_variant":
        if (typeof value !== "string" || !value.trim()) fail(`${at}.${key} 必须是非空字符串`);
        out[key] = value.trim();
        break;
      case "layout_variants":
        if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${at}.${key} 必须是对象`);
        for (const [layout, variant] of Object.entries(value)) {
          if (typeof variant !== "string") fail(`${at}.${key}.${layout} 必须是字符串`);
        }
        out[key] = { ...value };
        break;
      case "skeleton_fill":
        if (typeof value !== "boolean") fail(`${at}.${key} 必须是布尔值`);
        out[key] = value;
        break;
      default:
        fail(`${at} 含未知偏好键 [${key}]`);
    }
  }
  return out;
}

/** 合并单元包与课时包: 课时覆盖单元, layout_variants 按页型深合并; 双空包返回 {} */
export function mergePolicyPacks(unitPack = {}, lessonPack = {}) {
  const out = { ...unitPack, ...lessonPack };
  const variants = {
    ...(unitPack.layout_variants || {}),
    ...(lessonPack.layout_variants || {})
  };
  if (Object.keys(variants).length > 0 || unitPack.layout_variants || lessonPack.layout_variants) {
    out.layout_variants = variants;
  }
  return out;
}

function loadPolicyPacks() {
  if (cachedPacks) return cachedPacks;
  if (!fs.existsSync(PACK_PATH)) {
    fail(`偏好包不存在: ${PACK_PATH}`);
  }
  const doc = yaml.load(fs.readFileSync(PACK_PATH, "utf-8"));
  if (!doc || typeof doc !== "object") fail(`偏好包必须是 YAML 对象: ${PACK_PATH}`);

  const out = { units: {}, lessons: {} };
  for (const [unitKey, entry] of Object.entries(doc.units || {})) {
    out.units[unitKey] = validatePolicyPackEntry(entry, `units.${unitKey}`);
  }
  for (const [lessonId, entry] of Object.entries(doc.lessons || {})) {
    out.lessons[lessonId] = validatePolicyPackEntry(entry, `lessons.${lessonId}`);
  }
  cachedPacks = out;
  return cachedPacks;
}

/**
 * 解析某课时生效的偏好包 (单元 + 课时合并结果)。
 * 空包返回 {}, 调用方以 "显式 > 包 > meta" 的次序兜底。
 */
export function resolvePolicyPack(meta = {}, lessonId = "") {
  const packs = loadPolicyPacks();
  const unitPack = packs.units[unitKeyOf(meta)] || {};
  const lessonPack = (lessonId && packs.lessons[lessonId]) || {};
  return mergePolicyPacks(unitPack, lessonPack);
}
