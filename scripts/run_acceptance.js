#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 端到端验收运行器 (run_acceptance.js) - 新管线 (LessonPlan -> PPTX)
 *
 * 三科金样教学设计 -> build_courseware.js 一键流水线 -> 结构断言 -> 报告
 * 断言维度:
 *   1. 一键流水线退出码 0 (教学门禁 + 表现门禁 + 渲染 + 动效 + strict 几何门禁全通过);
 *   2. .pptx / .presentation.json / .audit.json 三件套产物齐备;
 *   3. 几何体检 0 Critical;
 *   4. 讲稿完备: 除封面/封底外每个内容页 notes 非空;
 *   5. 原生单击分步时序 orderValid 合规。
 * 用法: node scripts/run_acceptance.js
 * 产出: output/acceptance/<case_id>/ 三件套 与 output/reports/acceptance-report.md
 * 退出码: 0=全部通过; 1=存在失败。
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const GOLDEN_DIR = path.join(ROOT, "acceptance", "lesson_plans");
const OUT_ACCEPT = path.join(ROOT, "output", "acceptance");
const OUT_REPORT = path.join(ROOT, "output", "reports");
const BUILD_SCRIPT = path.join(
  ROOT, "plugin", "skills", "lesson-courseware", "scripts", "build_courseware.js"
);

const CONTENT_PAGE_SKIP_NOTES = new Set(["title_cover", "end_cover"]);

function listGoldenCases() {
  if (!fs.existsSync(GOLDEN_DIR)) return [];
  return fs.readdirSync(GOLDEN_DIR)
    .filter(f => f.endsWith(".json"))
    .sort()
    .map(f => {
      const filePath = path.join(GOLDEN_DIR, f);
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        case_id: f.replace(/\.json$/, ""),
        file: f,
        filePath,
        subject: data.meta?.subject || "unknown",
        grade: data.meta?.grade || "?",
        title: data.meta?.topic || data.meta?.title || f
      };
    });
}

function runCase(caseItem) {
  const outdir = path.join(OUT_ACCEPT, caseItem.case_id);
  fs.mkdirSync(outdir, { recursive: true });

  const result = {
    case_id: caseItem.case_id,
    subject: caseItem.subject,
    grade: caseItem.grade,
    title: caseItem.title,
    build_status: "pass",
    checks: []
  };

  // 1. 一键流水线 (含 strict 几何门禁, 退出码非 0 即失败)
  let buildOutput = "";
  try {
    buildOutput = execSync(
      `node "${BUILD_SCRIPT}" --input "${caseItem.filePath}" --outdir "${outdir}" --strict`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
  } catch (err) {
    result.build_status = "fail";
    result.build_output = (err.stdout || "") + (err.stderr || "");
    result.checks.push({ name: "一键流水线 (build_courseware --strict)", pass: false });
    return result;
  }
  result.build_output = buildOutput;
  result.checks.push({ name: "一键流水线 (build_courseware --strict)", pass: true });

  // 2. 三件套产物齐备
  const files = fs.existsSync(outdir) ? fs.readdirSync(outdir) : [];
  const pptxFile = files.find(f => f.endsWith(".pptx"));
  const presFile = files.find(f => f.endsWith(".presentation.json"));
  const auditFile = files.find(f => f.endsWith(".audit.json"));
  result.checks.push({
    name: "交付三件套 (.pptx/.presentation.json/.audit.json)",
    pass: Boolean(pptxFile && presFile && auditFile)
  });
  if (!pptxFile || !auditFile || !presFile) return result;

  // 3. 几何体检 0 Critical
  let audit;
  let pres;
  try {
    audit = JSON.parse(fs.readFileSync(path.join(outdir, auditFile), "utf-8"));
    pres = JSON.parse(fs.readFileSync(path.join(outdir, presFile), "utf-8"));
  } catch (e) {
    result.checks.push({ name: "审计/表现 JSON 可解析", pass: false, detail: e.message });
    return result;
  }
  const critical = audit?.summary?.critical ?? -1;
  const warning = audit?.summary?.warning ?? -1;
  result.checks.push({
    name: "几何体检 0 Critical",
    pass: critical === 0,
    detail: `critical=${critical}, warning=${warning}`
  });

  // 4. 讲稿完备: 内容页 notes 非空
  const slides = pres?.slides || [];
  const missingNotes = slides.filter(s =>
    !CONTENT_PAGE_SKIP_NOTES.has(s.layout) &&
    (!s.notes || String(s.notes).trim().length < 5)
  );
  result.checks.push({
    name: "内容页讲稿 (notes) 完备",
    pass: missingNotes.length === 0,
    detail: missingNotes.length === 0
      ? `${slides.length} 页全覆盖`
      : `缺讲稿: ${missingNotes.map(s => s.slide_id || s.layout).join(", ")}`
  });

  // 5. 原生分步时序合规
  const reveal = audit?.reveal || {};
  result.checks.push({
    name: "单击分步时序 (orderValid)",
    pass: reveal.orderValid !== false,
    detail: `${reveal.withTiming || 0} 页含分步 / 共 ${reveal.stepsTotal || 0} 步`
  });

  // 附加信息
  result.pages = slides.length;
  result.geometry = { critical, warning };
  result.reveal = { pages: reveal.withTiming || 0, steps: reveal.stepsTotal || 0 };
  return result;
}

function writeReport(results) {
  fs.mkdirSync(OUT_REPORT, { recursive: true });
  const lines = [];
  lines.push("# 端到端验收报告 (新管线 LessonPlan -> PPTX)");
  lines.push("");
  lines.push(`- 运行时间: ${new Date().toISOString()}`);
  lines.push(`- 金样目录: acceptance/lesson_plans/`);
  lines.push(`- 流水线: build_courseware.js --strict (教学门禁 → 容量规划 → 表现门禁 → 确定性渲染 → 动效注入 → 几何体检)`);
  lines.push("");
  lines.push("| 用例 | 学科 | 年级 | 页数 | 分步 | 几何 | 讲稿 | 时序 | 结果 |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const geo = r.geometry ? `${r.geometry.critical}C/${r.geometry.warning}W` : "-";
    const reveal = r.reveal ? `${r.reveal.steps}步` : "-";
    const notes = r.checks.find(c => c.name.includes("讲稿"));
    const timing = r.checks.find(c => c.name.includes("时序"));
    const ok = r.build_status === "pass" && r.checks.every(c => c.pass);
    lines.push(`| ${r.case_id} | ${r.subject} | ${r.grade} | ${r.pages ?? "-"} | ${reveal} | ${geo} | ${notes?.pass ? "✓" : "✗"} | ${timing?.pass ? "✓" : "✗"} | ${ok ? "✅ 通过" : "❌ 失败"} |`);
  }
  lines.push("");
  const failed = results.filter(r => r.build_status !== "pass" || !r.checks.every(c => c.pass));
  if (failed.length === 0) {
    lines.push("**结论: 全部金样通过端到端验收。**");
  } else {
    lines.push("**结论: 存在失败用例, 详情如下:**");
    for (const r of failed) {
      lines.push("");
      lines.push(`### ${r.case_id}`);
      for (const c of r.checks) {
        lines.push(`- ${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
      }
      if (r.build_output && r.build_status === "fail") {
        lines.push("");
        lines.push("```");
        lines.push(String(r.build_output).slice(0, 2000));
        lines.push("```");
      }
    }
  }
  fs.writeFileSync(path.join(OUT_REPORT, "acceptance-report.md"), lines.join("\n"));
}

function main() {
  const cases = listGoldenCases();
  if (cases.length === 0) {
    console.error("未找到金样教学设计: acceptance/lesson_plans/*.json");
    process.exit(1);
  }
  console.log(`=== 新管线端到端验收: ${cases.length} 个金样 ===\n`);
  const results = [];
  for (const c of cases) {
    console.log(`▶ [${c.subject}] ${c.title} (grade ${c.grade}) ...`);
    const r = runCase(c);
    results.push(r);
    const ok = r.build_status === "pass" && r.checks.every(x => x.pass);
    console.log(`  ${ok ? "✅ 通过" : "❌ 失败"}`);
    for (const chk of r.checks) {
      console.log(`    ${chk.pass ? "✓" : "✗"} ${chk.name}${chk.detail ? ` — ${chk.detail}` : ""}`);
    }
    console.log("");
  }
  writeReport(results);
  const failedCount = results.filter(r => r.build_status !== "pass" || !r.checks.every(c => c.pass)).length;
  console.log(`报告已写入: ${path.join(OUT_REPORT, "acceptance-report.md")}`);
  console.log(`总计: ${results.length} 用例 / ${results.length - failedCount} 通过 / ${failedCount} 失败`);
  process.exit(failedCount > 0 ? 1 : 0);
}

main();
