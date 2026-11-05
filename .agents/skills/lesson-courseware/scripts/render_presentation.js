#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 课件表现 (Presentation AST) 独立渲染 CLI (render_presentation.js)
 *
 * 用法:
 *   node render_presentation.js --input <presentation.json> [--outdir <output_dir>] [--strict]
 * 退出码: 0=通过并成功交付; 1=存在 Critical 几何硬伤被拒绝交付
 */

import fs from "fs";
import { renderPresentation } from "../lib_js/rendering/presentation_renderer.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let inputPath = "";
  let outdir = "output/vertical_slice";
  let outputBaseName = "";
  let strict = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === "--outdir" && args[i + 1]) {
      outdir = args[i + 1];
      i++;
    } else if ((args[i] === "--name" || args[i] === "--basename") && args[i + 1]) {
      outputBaseName = args[i + 1];
      i++;
    } else if (args[i] === "--strict") {
      strict = true;
    }
  }

  if (!inputPath) {
    console.error("用法: node render_presentation.js --input <presentation.json> [--outdir <output_dir>] [--strict] [--name <basename>]");
    process.exit(1);
  }

  return { inputPath, outdir, strict, outputBaseName };
}

async function main() {
  const { inputPath, outdir, strict, outputBaseName } = parseArgs();
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

  console.log(`[render_presentation] 开始执行纯确定性 AST 渲染...`);
  try {
    const res = await renderPresentation(data, { outdir, strict, ...(outputBaseName ? { outputBaseName } : {}) });
    console.log(`[render_presentation] 渲染完成!`);
    console.log(`  - 课件文件: ${res.pptxPath}`);
    console.log(`  - 契约源件: ${res.jsonPath}`);
    console.log(`  - 几何审计: ${res.auditPath}`);
    console.log(`  - 几何体检: ${res.auditResult.summary.critical} critical / ${res.auditResult.summary.warning} warning`);
    console.log(`  - 播放步骤: ${res.animReport.withTiming} 页含分步 / 共 ${res.animReport.stepsTotal} 步 / 顺序合规: ${res.animReport.orderValid ? "是" : "否"}`);

    if (strict && res.auditResult.summary.critical > 0) {
      console.error(`[render_presentation] 严格模式触发: 发现 ${res.auditResult.summary.critical} 个 Critical 几何错误，拒绝交付!`);
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error(`[render_presentation] 渲染抛出未捕获异常: ${err.stack || err.message}`);
    process.exit(1);
  }
}

main();
