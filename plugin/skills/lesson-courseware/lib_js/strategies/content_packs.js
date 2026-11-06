// -*- coding: utf-8 -*-
/**
 * 学科内容包加载器 (strategies/content_packs.js)
 *
 * 兜底板书/作业/拆页提示属于教学内容资产, 统一存放在
 * references/strategies/content-packs.yaml, 规划层按学科深合并读取。
 * 代码里不再出现成段的学科文案。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_PATH = path.resolve(__dirname, "..", "..", "references", "strategies", "content-packs.yaml");

let cached = null;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(value) && isPlainObject(base[key])
      ? deepMerge(base[key], value)
      : value;
  }
  return out;
}

export function loadContentPacks() {
  if (cached) return cached;
  if (!fs.existsSync(PACK_PATH)) {
    throw new Error(`[content_packs] 内容包不存在: ${PACK_PATH}`);
  }
  const doc = yaml.load(fs.readFileSync(PACK_PATH, "utf-8"));
  if (!isPlainObject(doc) || !isPlainObject(doc.default)) {
    throw new Error("[content_packs] 内容包缺少 default 段");
  }
  cached = doc;
  return cached;
}

export function contentPackFor(subject) {
  const packs = loadContentPacks();
  return deepMerge(packs.default, packs.subjects?.[subject] || {});
}
