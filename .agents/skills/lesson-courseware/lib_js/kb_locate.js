// -*- coding: utf-8 -*-
/**
 * 知识库定位工具 (kb_locate.js)
 *
 * 解析顺序 (取第一个命中者, 命中判定: 目录内含 manifest.json 且含 curriculum/):
 *   1. 环境变量 COURSEWARE_KNOWLEDGE_DIR
 *   2. skill 自带布局: <plugin>/skills/lesson-courseware/lib_js → <plugin>/knowledge
 *   3. 向上逐级找 <root>/plugin/knowledge 或 <root>/knowledge
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MARKER_FILES = ["manifest.json", "curriculum"];

function isKb(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return false;
  try {
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) return false;
    return MARKER_FILES.every(m => fs.existsSync(path.join(targetPath, m)));
  } catch {
    return false;
  }
}

export function findKbRoot() {
  const env = process.env.COURSEWARE_KNOWLEDGE_DIR;
  if (env) {
    // 显式指定却无效时不再静默回退到别处: 否则教师以为在用 A 版知识库,
    // 实际校验的是 B 版, 门禁会带着错误的白名单放行(fail-closed 要求)。
    return isKb(env) ? path.resolve(env) : null;
  }

  // 默认 skill 目录相对知识库位置: ../../../knowledge
  const bundled = path.resolve(__dirname, "..", "..", "..", "knowledge");
  if (isKb(bundled)) {
    return bundled;
  }

  // 逐级向上查找
  for (const base of [__dirname, process.cwd()]) {
    let root = base;
    for (let i = 0; i < 6; i++) {
      for (const cand of [
        path.join(root, "plugin", "knowledge"),
        path.join(root, "knowledge")
      ]) {
        if (isKb(cand)) {
          return path.resolve(cand);
        }
      }
      const parent = path.dirname(root);
      if (parent === root) break;
      root = parent;
    }
  }

  return null;
}
