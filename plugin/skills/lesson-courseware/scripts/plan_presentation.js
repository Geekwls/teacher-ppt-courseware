#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 课件自动规划 CLI: LessonPlan -> Presentation AST (plan_presentation.js)
 *
 * 用法:
 *   node plan_presentation.js --input <lesson-plan.json> --output <presentation.json>
 */

import fs from "fs";
import { planPresentationFromLesson } from "../lib_js/presentation/lesson_to_presentation.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let inputPath = "";
  let outputPath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    }
  }

  if (!inputPath || !outputPath) {
    console.error("用法: node plan_presentation.js --input <lesson-plan.json> --output <presentation.json>");
    process.exit(1);
  }

  return { inputPath, outputPath };
}

function main() {
  const { inputPath, outputPath } = parseArgs();
  if (!fs.existsSync(inputPath)) {
    console.error(`错误: 文件不存在: ${inputPath}`);
    process.exit(1);
  }

  let lessonPlan;
  try {
    lessonPlan = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  } catch (err) {
    console.error(`错误: JSON 解析失败: ${err.message}`);
    process.exit(1);
  }

  const presAst = planPresentationFromLesson(lessonPlan);
  fs.writeFileSync(outputPath, JSON.stringify(presAst, null, 2));
  console.log(`[plan_presentation] 规划完成! 已从 LessonPlan 自动生成 Presentation AST (${presAst.slides.length} 页): ${outputPath}`);
}

main();
