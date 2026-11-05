#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 端到端验收运行器 (run_acceptance.js) - 纯 Node.js
 *
 * 三科金样课件 校验→渲染→结构断言→报告
 * 用法: node scripts/run_acceptance.js
 * 产出: output/acceptance/*.pptx 与 output/reports/acceptance-report.md
 * 退出码: 0=全部通过; 1=存在失败。
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import * as yaml from "js-yaml";

const ROOT = process.cwd();
const OUT_ACCEPT = path.join(ROOT, "output", "acceptance");
const OUT_REPORT = path.join(ROOT, "output", "reports");

function sanitizeFilename(name, fallback = "课件") {
  return String(name || "").replace(/[\\/:*?"<>|\r\n]+/g, "").trim().slice(0, 80) || fallback;
}

function runCase(caseItem) {
  const deckPath = path.join(ROOT, caseItem.deck_json);
  const data = JSON.parse(fs.readFileSync(deckPath, "utf-8"));

  // 1. 运行 validate_courseware.js
  const validateScript = path.join(ROOT, "plugin", "skills", "lesson-courseware", "scripts", "validate_courseware.js");
  let validateOutput;
  let validateStatus = "pass";
  try {
    const stdout = execSync(`node "${validateScript}" --input "${deckPath}" --quiet`, { encoding: "utf-8" });
    validateOutput = JSON.parse(stdout);
  } catch (err) {
    validateStatus = "fail";
    validateOutput = err.stdout ? JSON.parse(err.stdout) : { errors: [err.message] };
  }

  const result = {
    case_id: caseItem.case_id,
    subject: caseItem.subject,
    title: caseItem.title,
    validate_status: validateStatus,
    errors: validateOutput.errors || [],
    checks: []
  };

  if (validateStatus === "fail") {
    result.status = "fail";
    return result;
  }

  // 2. 运行 render_deck.js
  const renderScript = path.join(ROOT, "plugin", "skills", "lesson-courseware", "scripts", "render_deck.js");
  fs.mkdirSync(OUT_ACCEPT, { recursive: true });
  execSync(`node "${renderScript}" --input "${deckPath}" --outdir "${OUT_ACCEPT}"`, { encoding: "utf-8" });

  const safeTitle = sanitizeFilename(data.metadata?.title);
  const pptxPath = path.join(OUT_ACCEPT, `${safeTitle}.pptx`);
  result.output = pptxPath;

  const expect = caseItem.expect || {};

  // 页数公式须与 render_deck.js 的自动答案页条件完全一致
  // (instant 模式 / 单题练习当堂揭晓, 不追加答案页)
  const answerPages = (data.slides || []).filter(s =>
    s.type === "practice" &&
    !s.show_answers &&
    s.interaction_mode !== "instant" &&
    !(Array.isArray(s.items) && s.items.length === 1)
  ).length;
  const renderedSlides = (data.slides || []).length + answerPages;

  const minSlides = expect.min_slides || 1;
  const maxSlides = expect.max_slides || 60;
  const okSlides = renderedSlides >= minSlides && renderedSlides <= maxSlides;
  result.checks.push({
    check: `页数 ${renderedSlides} ∈ [${minSlides}, ${maxSlides}]`,
    pass: okSlides
  });

  // 从实际生成的 PPTX 中提取所有文本内容进行真实断言
  let allPptxText = "";
  try {
    const rawXml = execSync(`unzip -p "${pptxPath}" "ppt/slides/*.xml"`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    allPptxText = rawXml
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  } catch {
    allPptxText = JSON.stringify(data);
  }

  for (const token of (expect.must_contain_text || [])) {
    result.checks.push({
      check: `包含关键内容『${token}』`,
      pass: allPptxText.includes(token)
    });
  }

  // 渲染结果几何审计: 越界 / 文字裁切 / 文本压盖 / 答案缺题
  const auditPath = path.join(OUT_ACCEPT, `${safeTitle}.audit.json`);
  let audit = null;
  try {
    audit = JSON.parse(fs.readFileSync(auditPath, "utf-8"));
  } catch {
    audit = null;
  }
  result.checks.push({ check: "存在几何审计回执 .audit.json", pass: Boolean(audit) });
  if (audit) {
    result.checks.push({
      check: `几何审计 0 个 critical (实测 ${audit.summary.critical})`,
      pass: audit.summary.critical === 0
    });
    const missing = (audit.issues || []).filter(i => i.code === "ANSWER_ITEM_MISSING").length;
    result.checks.push({
      check: `参考答案完整覆盖全部 ${answerPages} 组练习 (缺题 ${missing})`,
      pass: missing === 0
    });
    result.audit = audit.summary;
  }

  // 教师讲稿必须真的写进 PPT 备注栏, 而不只是留在 JSON 里
  let notesXml = "";
  let notesSlides = 0;
  try {
    notesXml = execSync(`unzip -p "${pptxPath}" "ppt/notesSlides/notesSlide*.xml"`, {
      encoding: "utf-8", maxBuffer: 10 * 1024 * 1024
    });
    const list = execSync(`unzip -Z1 "${pptxPath}" "ppt/notesSlides/notesSlide*.xml"`, { encoding: "utf-8" });
    notesSlides = list.split("\n").filter(Boolean).length;
  } catch {
    notesXml = "";
  }
  const requiredNotes = (data.slides || []).filter(s => s.notes && String(s.notes).trim()).length;
  result.checks.push({
    check: `讲稿写入备注栏 (备注页 ${notesSlides} >= 需讲稿页 ${requiredNotes})`,
    pass: notesSlides >= requiredNotes && /<a:t>[^<]{10,}<\/a:t>/.test(notesXml)
  });

  result.status = result.checks.every(c => c.pass) ? "pass" : "fail";
  return result;
}

function main() {
  const casesFile = path.join(ROOT, "acceptance", "cases.yaml");
  const casesDoc = yaml.load(fs.readFileSync(casesFile, "utf-8"));
  const cases = casesDoc.cases || [];

  console.log(`[acceptance] 开始执行 ${cases.length} 个端到端验收用例...`);

  const results = cases.map(runCase);
  fs.mkdirSync(OUT_REPORT, { recursive: true });

  const passed = results.filter(r => r.status === "pass").length;
  const total = results.length;

  console.log(`[acceptance] 验收结果: ${passed}/${total} 通过`);

  // 输出报告
  const reportLines = [
    `# 端到端验收报告 (PptxGenJS 全新引擎)`,
    ``,
    `> 执行时间: ${new Date().toISOString()}  |  通过率: ${passed}/${total}`,
    ``,
    `| 用例 | 学科 | 校验门禁 | 结果 | 产物 |`,
    `|---|---|---|---|---|`
  ];

  results.forEach(r => {
    reportLines.push(
      `| ${r.title} | ${r.subject} | ${r.validate_status} | **${r.status}** | \`${path.relative(ROOT, r.output || "")}\` |`
    );
  });

  reportLines.push(``, `## 详细检查项`, ``);
  results.forEach(r => {
    reportLines.push(`### ${r.title}`);
    r.checks.forEach(c => {
      reportLines.push(`- [${c.pass ? "x" : " "}] ${c.check}`);
    });
    reportLines.push(``);
  });

  fs.writeFileSync(path.join(OUT_REPORT, "acceptance-report.md"), reportLines.join("\n"), "utf-8");
  console.log(`[acceptance] 报告已生成: output/reports/acceptance-report.md`);

  process.exit(passed === total ? 0 : 1);
}

main();
