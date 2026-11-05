// -*- coding: utf-8 -*-
/**
 * 幻灯片动效后处理器 (deck_transition.js)
 *
 * 核心功能:
 * 1. 注入全屏放映平滑转场动效 (<p:transition>)，使每一页切换时均呈现柔和淡入淡出 (Fade)；
 * 2. 自动识别教学关键元素（如“★ 关键结论”、“答语卡片”、“✓ 正解框”），精准注入
 *    OpenXML 原生“单击进入淡入动效 (<p:timing>)”；
 * 3. 课堂放映时实现真正的“先探究推导、后点击揭晓结论/答案”的专业教学动效。
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

/**
 * 构造标准 OpenXML 单击淡入出现动画 (Click-to-Appear Timing)
 * 支持多步骤逐题/逐条单击步进触发 (Step-by-step Click Effect)
 */
function buildTimingXml(spids) {
  if (!spids || !spids.length) return "";

  let idCounter = 3;
  const pars = spids.map((spid) => {
    const pId = idCounter++;
    const cId = idCounter++;
    const effId = idCounter++;
    const bId = idCounter++;
    return `
      <p:par>
        <p:cTn id="${pId}" fill="hold">
          <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
          <p:childTnLst>
            <p:par>
              <p:cTn id="${cId}" fill="hold">
                <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                <p:childTnLst>
                  <p:par>
                    <p:cTn id="${effId}" presetID="1" presetClass="entr" presetSubtype="0" fill="hold" nodeType="clickEffect">
                      <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                      <p:childTnLst>
                        <p:animEffect transition="in" filter="fade">
                          <p:cBhvr>
                            <p:cTn id="${bId}" dur="500"/>
                            <p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>
                          </p:cBhvr>
                        </p:animEffect>
                      </p:childTnLst>
                    </p:cTn>
                  </p:par>
                </p:childTnLst>
              </p:cTn>
            </p:par>
          </p:childTnLst>
        </p:cTn>
      </p:par>
    `.trim();
  }).join("\n");

  const prevConds = spids.map(spid => `<p:cond evt="onPrev" delay="0"><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cond>`).join("");
  const nextConds = spids.map(spid => `<p:cond evt="onNext" delay="0"><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cond>`).join("");

  return `
    <p:timing>
      <p:tnLst>
        <p:par>
          <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
            <p:childTnLst>
              <p:seq concurrent="1" nextAc="seek">
                <p:cTn id="2" dur="indefinite" nodeType="mainSeq">
                  <p:childTnLst>
                    ${pars}
                  </p:childTnLst>
                </p:cTn>
                <p:prevCondLst>${prevConds}</p:prevCondLst>
                <p:nextCondLst>${nextConds}</p:nextCondLst>
              </p:seq>
            </p:childTnLst>
          </p:cTn>
        </p:par>
      </p:tnLst>
    </p:timing>
  `.replace(/\s+/g, " ").trim();
}

/**
 * 扫描 slide.xml，提取需要加进入动效的教学元素 shape id
 */
function findRevealShapeIds(xml) {
  const shapeRegex = /<p:sp>(.*?)<\/p:sp>/gs;
  const matchIds = [];
  let match;

  while ((match = shapeRegex.exec(xml)) !== null) {
    const spContent = match[1];

    // 1. 数学: 关键结论/核心规律/规律发现卡片 (避免误伤幻灯片标题)
    const isConclusion = /★\s*(?:核心规律|关键结论|规律发现|结论|规律)|(?:核心规律|关键结论|规律发现)\s*[:：]/.test(spContent);

    // 2. 例题规范答语卡片
    const isExampleAnswer = spContent.includes("答：") || spContent.includes("答:");

    // 3. 易错警示正解卡片
    const isMisconceptionCorrect = spContent.includes("✓ 正解") ||
                                   spContent.includes("✓正解") ||
                                   spContent.includes("【正解】") ||
                                   spContent.includes("正确解法");

    // 4. 参考答案页与即时练习: ★ 参考答案卡片、★ 即时解析卡片 (避免误伤页面标题)
    const isAnswer = /★\s*参考答案|参考答案\s*[:：]|★\s*即时解析|即时解析\s*[:：]|★\s*答案/.test(spContent);

    // 5. 英语情境对话: 第二说话人/答句气泡 (如 B: / Speaker 2: / 答语气泡)
    const isDialogReply = /<a:t>[^<]*(?:B[:：]|Speaker\s*2[:：]|Sarah[:：]|Mike[:：]|Chen\s*Jie[:：]|John[:：]|Amy[:：]|答语[:：])/i.test(spContent);

    if (isConclusion || isExampleAnswer || isMisconceptionCorrect || isAnswer || isDialogReply) {
      const idMatch = spContent.match(/<p:cNvPr id="(\d+)"/);
      if (idMatch) {
        matchIds.push(idMatch[1]);
      }
    }
  }

  return matchIds;
}

/**
 * 主处理函数: 注入转场与元素点击进入动效
 */
export function injectSlideTransitions(pptxPath, transitionType = "fade") {
  if (!fs.existsSync(pptxPath)) return;

  const tmpDir = path.join(os.tmpdir(), `deck_anim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. 解压 pptx
    execSync(`unzip -q "${pptxPath}" -d "${tmpDir}"`, { stdio: "pipe" });

    // 2. 遍历所有 slide*.xml
    const slidesDir = path.join(tmpDir, "ppt", "slides");
    if (!fs.existsSync(slidesDir)) return;

    const slideFiles = fs.readdirSync(slidesDir).filter(f => f.startsWith("slide") && f.endsWith(".xml"));

    let transTag = "<p:fade/>";
    if (transitionType === "push") transTag = '<p:push dir="l"/>';
    else if (transitionType === "wipe") transTag = '<p:wipe dir="r"/>';

    for (const sFile of slideFiles) {
      const sPath = path.join(slidesDir, sFile);
      let xml = fs.readFileSync(sPath, "utf-8");

      // A. 提取需要点击呈现的结论/答案 shape id
      const revealIds = findRevealShapeIds(xml);
      let timingXml = "";
      if (revealIds.length > 0 && !xml.includes("<p:timing>")) {
        timingXml = buildTimingXml(revealIds);
      }

      // B. 页面级转场标签
      const transBlock = `<p:transition spd="med" advClick="1">${transTag}</p:transition>`;

      // C. 安全组合注入到 </p:sld> 之前
      if (!xml.includes("<p:transition") && xml.includes("</p:sld>")) {
        const insertBlock = timingXml ? `${timingXml}${transBlock}</p:sld>` : `${transBlock}</p:sld>`;
        xml = xml.replace("</p:sld>", insertBlock);
        fs.writeFileSync(sPath, xml, "utf-8");
      } else if (timingXml && !xml.includes("<p:timing>")) {
        xml = xml.replace("<p:transition", `${timingXml}<p:transition`);
        fs.writeFileSync(sPath, xml, "utf-8");
      }
    }

    // 3. 重新压回原 pptx 文件 (覆盖)
    const absPptx = path.resolve(pptxPath);
    execSync(`cd "${tmpDir}" && zip -q -r "${absPptx}" * && cd -`, { stdio: "pipe" });
  } catch (err) {
    console.warn(`[deck_transition] 注入动效异常 (已跳过保持原件): ${err.message}`);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}
