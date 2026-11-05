// -*- coding: utf-8 -*-
/**
 * 幻灯片动效后处理器 (deck_transition.js)
 *
 * 1. 注入全屏放映平滑转场 (<p:transition> Fade);
 * 2. 读取 reveal_steps.js 打在 <p:cNvPr name="REVEAL_<step>_<idx>"> 的分组标记,
 *    按步骤注入 OpenXML 原生「单击淡入出现」(<p:timing> clickEffect)。
 *    同一步内的所有形状一次点击同时出现, 课堂放映实现 1→2→3 逐步揭示;
 * 3. 无标记的文件(旧 PPTX / 第三方文件)回退到教学关键词识别, 保证兼容;
 * 4. 严格遵循 OOXML 元素顺序: p:transition 必须排在 p:timing 之前;
 * 5. 每个进入动画配 <p:set style.visibility=visible>, 确保对象在点击前保持隐藏
 *    (只写 animEffect 时, 部分播放器会把形状一直显示为可见, 动效等于没生效);
 * 6. 返回动效报告供渲染引擎写入 .audit.json 回执。
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { parseRevealName } from "./reveal_steps.js";

/**
 * 构造标准 OpenXML 单击淡入动画。
 * @param {string[][]} groups 每个元素是一步里要同时出现的 shape id 列表
 */
function buildTimingXml(groups) {
  if (!groups || !groups.length) return "";

  let idCounter = 3;
  const pars = groups.map(group => {
    const pId = idCounter++;
    const cId = idCounter++;
    const effId = idCounter++;

    // PowerPoint 标准写法: 每个形状先 <p:set> 置为可见, 再 <p:animEffect> 淡入
    const effects = group.map(spid => {
      const setId = idCounter++;
      const animId = idCounter++;
      return `<p:set>` +
        `<p:cBhvr><p:cTn id="${setId}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>` +
        `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
        `<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>` +
        `<p:to><p:strVal val="visible"/></p:to></p:set>` +
        `<p:animEffect transition="in" filter="fade"><p:cBhvr>` +
        `<p:cTn id="${animId}" dur="500"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
        `</p:cBhvr></p:animEffect>`;
    }).join("");

    return `<p:par><p:cTn id="${pId}" fill="hold">` +
      `<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>` +
      `<p:par><p:cTn id="${cId}" fill="hold">` +
      `<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
      `<p:par><p:cTn id="${effId}" presetID="1" presetClass="entr" presetSubtype="0" fill="hold" nodeType="clickEffect">` +
      `<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst>` +
      `</p:cTn></p:par></p:childTnLst></p:cTn></p:par>` +
      `</p:childTnLst></p:cTn></p:par>`;
  }).join("");

  // 上一步 / 下一步导航条件以每组首个形状为代表
  const reps = groups.map(g => g[0]);
  const prevConds = reps.map(spid => `<p:cond evt="onPrev" delay="0"><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cond>`).join("");
  const nextConds = reps.map(spid => `<p:cond evt="onNext" delay="0"><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cond>`).join("");

  return `<p:timing><p:tnLst><p:par>` +
    `<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `<p:seq concurrent="1" nextAc="seek">` +
    `<p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${pars}</p:childTnLst></p:cTn>` +
    `<p:prevCondLst>${prevConds}</p:prevCondLst><p:nextCondLst>${nextConds}</p:nextCondLst>` +
    `</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

/** 回退规则: 无 REVEAL 标记时, 按教学关键词识别需要最后揭晓的卡片 */
function findRevealShapeIds(xml) {
  const shapeRegex = /<p:sp>(.*?)<\/p:sp>/gs;
  const matchIds = [];
  let match;

  while ((match = shapeRegex.exec(xml)) !== null) {
    const spContent = match[1];
    const isConclusion = /★\s*(?:核心规律|关键结论|规律发现|结论|规律)|(?:核心规律|关键结论|规律发现)\s*[:：]/.test(spContent);
    const isExampleAnswer = spContent.includes("答：") || spContent.includes("答:");
    const isMisconceptionCorrect = spContent.includes("✓ 正解") || spContent.includes("✓正解") ||
      spContent.includes("【正解】") || spContent.includes("正确解法");
    const isAnswer = /★\s*参考答案|参考答案\s*[:：]|★\s*即时解析|即时解析\s*[:：]|★\s*答案/.test(spContent);
    const isDialogReply = /<a:t>[^<]*(?:B[:：]|Speaker\s*2[:：]|Sarah[:：]|Mike[:：]|Chen\s*Jie[:：]|John[:：]|Amy[:：]|答语[:：])/i.test(spContent);

    if (isConclusion || isExampleAnswer || isMisconceptionCorrect || isAnswer || isDialogReply) {
      const idMatch = spContent.match(/<p:cNvPr id="(\d+)"/);
      if (idMatch) matchIds.push(idMatch[1]);
    }
  }
  return matchIds;
}

/**
 * 提取本页的播放步骤分组。
 * 优先用渲染器打的 REVEAL 标记(按 step 编号排序); 否则回退到关键词规则。
 * @returns {string[][]} 每一步包含的 shape id
 */
function findRevealGroups(xml) {
  const byStep = new Map();
  // 直接抓 cNvPr 上的步骤名, 覆盖 p:sp / p:graphicFrame(表格图元) / p:pic 等全部容器;
  // nvGrpSpPr 里的 <p:cNvPr id="1" name=""/> 因前缀不匹配会被自动跳过。
  const re = /<p:cNvPr id="(\d+)" name="(REVEAL_[^"]*)"/g;
  let m;

  while ((m = re.exec(xml)) !== null) {
    const parsed = parseRevealName(m[2]);
    if (!parsed) continue;
    if (!byStep.has(parsed.step)) byStep.set(parsed.step, []);
    byStep.get(parsed.step).push(m[1]);
  }

  if (byStep.size > 0) {
    return [...byStep.keys()].sort((a, b) => a - b).map(k => byStep.get(k));
  }
  return findRevealShapeIds(xml).map(spid => [spid]);
}

/**
 * 主处理函数: 注入转场 + 分组单击动效, 并回读校验 OOXML 顺序。
 * @returns {{ pages:number, withTiming:number, stepsTotal:number, orderValid:boolean, perSlide:object[] }}
 */
export function injectSlideTransitions(pptxPath, transitionType = "fade") {
  const report = { pages: 0, withTiming: 0, stepsTotal: 0, orderValid: true, perSlide: [] };
  if (!fs.existsSync(pptxPath)) return report;

  const tmpDir = path.join(os.tmpdir(), `deck_anim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`unzip -q "${pptxPath}" -d "${tmpDir}"`, { stdio: "pipe" });

    const slidesDir = path.join(tmpDir, "ppt", "slides");
    if (!fs.existsSync(slidesDir)) return report;

    const slideFiles = fs.readdirSync(slidesDir)
      .filter(f => /^slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

    let transTag = "<p:fade/>";
    if (transitionType === "push") transTag = '<p:push dir="l"/>';
    else if (transitionType === "wipe") transTag = '<p:wipe dir="r"/>';

    for (const sFile of slideFiles) {
      const sPath = path.join(slidesDir, sFile);
      let xml = fs.readFileSync(sPath, "utf-8");

      const groups = findRevealGroups(xml);
      const timingXml = buildTimingXml(groups);
      const transBlock = `<p:transition spd="med" advClick="1">${transTag}</p:transition>`;
      const hasTransition = xml.includes("<p:transition");
      const hasTiming = xml.includes("<p:timing>");

      // OOXML CT_Slide 子元素顺序: cSld -> clrMapOvr -> transition -> timing -> extLst
      // 因此 transition 必须写在 timing 之前, 顺序反了 PowerPoint 会判文件需修复 / 忽略动画。
      if (timingXml && !hasTiming) {
        if (hasTransition) {
          if (xml.includes("</p:transition>")) {
            xml = xml.replace("</p:transition>", `</p:transition>${timingXml}`);
          } else {
            xml = xml.replace(/(<p:transition\b[^>]*\/>)/, `$1${timingXml}`);
          }
        } else {
          xml = xml.replace("</p:sld>", `${transBlock}${timingXml}</p:sld>`);
        }
      } else if (!hasTransition) {
        xml = xml.replace("</p:sld>", `${transBlock}</p:sld>`);
      }

      const iTrans = xml.indexOf("<p:transition");
      const iTiming = xml.indexOf("<p:timing>");
      const orderOk = iTrans === -1 || iTiming === -1 || iTrans < iTiming;
      if (!orderOk) report.orderValid = false;

      fs.writeFileSync(sPath, xml, "utf-8");
      report.perSlide.push({ slide: sFile, steps: groups.length, orderValid: orderOk });
      if (groups.length > 0) {
        report.withTiming++;
        report.stepsTotal += groups.length;
      }
    }

    report.pages = slideFiles.length;

    const absPptx = path.resolve(pptxPath);
    execSync(`cd "${tmpDir}" && zip -q -r "${absPptx}" * && cd -`, { stdio: "pipe" });
  } catch (err) {
    console.warn(`[deck_transition] 注入动效异常 (已跳过保持原件): ${err.message}`);
    report.orderValid = false;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }

  return report;
}
