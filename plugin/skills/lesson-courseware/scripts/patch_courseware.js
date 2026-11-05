#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 课件增量修订与局部更新 CLI (patch_courseware.js)
 *
 * 核心设计:
 * 教师提出课件修改意见时(如"把第2题改成...""修改第3自然段的设问""修改教师讲稿"),
 * 不手改 PPTX, 而是针对 LessonPlan AST 进行定向打补丁 (Patch),
 * 并通过一键流水线自动重新规划与渲染, 保持其他页面与时间线不发生漂移。
 *
 * 用法:
 *   node patch_courseware.js --input <lesson-plan.json> --patch <patch.json> [--outdir <dir>] [--name <basename>]
 *   node patch_courseware.js --input <lesson-plan.json> --phase <phase_id> --notes "新讲稿"
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

function parseArgs() {
  const args = process.argv.slice(2);
  let inputPath = "";
  let patchPath = "";
  let phaseId = "";
  let newNotes = "";
  let outdir = "output";
  let outputBaseName = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === "--patch" && args[i + 1]) {
      patchPath = args[i + 1];
      i++;
    } else if (args[i] === "--phase" && args[i + 1]) {
      phaseId = args[i + 1];
      i++;
    } else if (args[i] === "--notes" && args[i + 1]) {
      newNotes = args[i + 1];
      i++;
    } else if (args[i] === "--outdir" && args[i + 1]) {
      outdir = args[i + 1];
      i++;
    } else if (args[i] === "--name" && args[i + 1]) {
      outputBaseName = args[i + 1];
      i++;
    }
  }

  if (!inputPath || (!patchPath && (!phaseId || !newNotes))) {
    console.error("用法: node patch_courseware.js --input <lesson-plan.json> --patch <patch.json> [--outdir <dir>]");
    console.error("  或: node patch_courseware.js --input <lesson-plan.json> --phase <phase_id> --notes <new_notes>");
    process.exit(1);
  }

  return { inputPath, patchPath, phaseId, newNotes, outdir, outputBaseName };
}

function applyPatch(lessonPlan, patch) {
  const changes = [];

  // 1. 更新元数据或目标
  if (patch.meta) {
    Object.assign(lessonPlan.meta, patch.meta);
    changes.push("更新课程元数据 meta");
  }

  // 2. 更新教学环节
  if (Array.isArray(patch.update_phases)) {
    for (const u of patch.update_phases) {
      const idx = lessonPlan.teaching_sequence.findIndex(p => p.phase_id === u.phase_id);
      if (idx >= 0) {
        if (u.content_block) {
          lessonPlan.teaching_sequence[idx].content_block = {
            ...lessonPlan.teaching_sequence[idx].content_block,
            ...u.content_block
          };
          changes.push(`更新环节 [${u.phase_id}] 的内容块 (content_block)`);
        }
        if (u.teacher_guidance) {
          lessonPlan.teaching_sequence[idx].teacher_guidance = u.teacher_guidance;
          changes.push(`更新环节 [${u.phase_id}] 的教师讲稿 (teacher_guidance)`);
        }
        if (u.student_action) {
          lessonPlan.teaching_sequence[idx].student_action = u.student_action;
          changes.push(`更新环节 [${u.phase_id}] 的学生活动 (student_action)`);
        }
      } else {
        console.warn(`[patch] 警告: 未找到环节 ID: ${u.phase_id}`);
      }
    }
  }

  // 3. 记录修订历史
  if (!lessonPlan.revision_history) {
    lessonPlan.revision_history = [];
  }
  lessonPlan.revision_history.push({
    revised_at: new Date().toISOString(),
    summary: patch.summary || changes.join("; ") || "局部内容修订"
  });

  return changes;
}

function main() {
  const { inputPath, patchPath, phaseId, newNotes, outdir, outputBaseName } = parseArgs();

  if (!fs.existsSync(inputPath)) {
    console.error(`错误: 教学设计文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const lessonPlan = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  let patch = {};

  if (patchPath) {
    if (!fs.existsSync(patchPath)) {
      console.error(`错误: 补丁文件不存在: ${patchPath}`);
      process.exit(1);
    }
    patch = JSON.parse(fs.readFileSync(patchPath, "utf-8"));
  } else if (phaseId && newNotes) {
    patch = {
      summary: `修改环节 [${phaseId}] 讲稿`,
      update_phases: [{ phase_id: phaseId, teacher_guidance: newNotes }]
    };
  }

  console.log("================================================================");
  console.log("✏️ 启动课件增量修订 (Patching Courseware)");
  console.log("================================================================");
  console.log(`[1/3] 解析补丁并应用到: ${inputPath}`);

  const changes = applyPatch(lessonPlan, patch);
  changes.forEach((c, idx) => {
    console.log(`   ${idx + 1}. ${c}`);
  });

  // 写回或另存为更新版
  fs.writeFileSync(inputPath, JSON.stringify(lessonPlan, null, 2));
  console.log(`      ✓ 教学设计源件已增量保存: ${inputPath}`);

  // 触发流水线自动重构
  console.log("[2/3] 自动驱动一键流水线重新规划与严格体检...");
  const builderPath = path.join(path.dirname(new URL(import.meta.url).pathname), "build_courseware.js");
  const buildArgs = [builderPath, "--input", inputPath, "--outdir", outdir, "--strict"];
  if (outputBaseName) {
    buildArgs.push("--name", outputBaseName);
  }

  try {
    const out = execFileSync("node", buildArgs, { encoding: "utf-8" });
    console.log(out.trim());
    console.log("================================================================");
    console.log("🎉 课件增量修订成功完成! 仅局部修改，全局排版零漂移！");
    console.log("================================================================");
  } catch (err) {
    console.error("❌ 修订后流水线构建失败:", err.stdout || err.message);
    process.exit(1);
  }
}

main();
