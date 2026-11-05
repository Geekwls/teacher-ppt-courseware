#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 课件表现 (Presentation AST) 独立校验 CLI (validate_presentation.js)
 *
 * 用法:
 *   node validate_presentation.js --input <presentation.json>
 * 退出码: 0=通过; 1=存在 error
 */

import fs from "fs";
import { validatePresentation } from "../lib_js/presentation/presentation_validator.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let inputPath = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    }
  }
  if (!inputPath) {
    console.error("用法: node validate_presentation.js --input <presentation.json>");
    process.exit(1);
  }
  return { inputPath };
}

function main() {
  const { inputPath } = parseArgs();
  if (!fs.existsSync(inputPath)) {
    console.error(`错误: 文件不存在: ${inputPath}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  } catch (err) {
    console.error(`错误: 无法解析 JSON: ${err.message}`);
    process.exit(1);
  }

  const result = validatePresentation(data);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "pass" ? 0 : 1);
}

main();
