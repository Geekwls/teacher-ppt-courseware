// -*- coding: utf-8 -*-
/**
 * 几何审计与放映分步单元测试 (test/unit/audit_and_reveal.test.js)
 *
 * layout_audit / reveal_steps 是交付质量的两道最后防线:
 * - 审计必须真的能抓到越界与文字溢出 (否则 --strict 是空话);
 * - 分步必须真的把形状打上 REVEAL_ 标记 (否则动画注入无对象可注入)。
 * 这两点此前只有端到端金样间接覆盖, 这里补上直接的负向断言。
 */

import test from "node:test";
import assert from "node:assert/strict";
import pptxgen from "pptxgenjs";
import { auditDeck } from "../../plugin/skills/lesson-courseware/lib_js/layout_audit.js";
import { annotateRevealSteps, parseRevealName, REVEAL_PREFIX } from "../../plugin/skills/lesson-courseware/lib_js/reveal_steps.js";

function newDeck() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 英寸
  return pptx;
}

function codes(result) {
  return result.issues.map(i => i.code);
}

test("几何审计: 规整版面应 0 Critical", () => {
  const pptx = newDeck();
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.8, y: 1.2, w: 6, h: 3 });
  s.addText("整十数乘一位数, 先看成几个十", { x: 1.0, y: 1.5, w: 5.5, h: 1.0, fontSize: 20 });

  const res = auditDeck(pptx, ["安全页"]);
  assert.equal(res.summary.critical, 0, `不应有 Critical: ${JSON.stringify(res.issues)}`);
});

test("几何审计: 形状越出画布必须报 Critical", () => {
  const pptx = newDeck();
  const s = pptx.addSlide();
  // 画布宽 13.333, 这里右边界推到 15.5
  s.addShape(pptx.shapes.RECTANGLE, { x: 12.5, y: 1.0, w: 3.0, h: 1.0 });

  const res = auditDeck(pptx, ["越界页"]);
  assert.ok(codes(res).includes("SHAPE_OUT_OF_CANVAS"), `应报 SHAPE_OUT_OF_CANVAS, 实际: ${codes(res)}`);
  assert.equal(res.summary.critical, 1);
});

test("几何审计: 文字塞不进小框必须报 TEXT_OVERFLOW", () => {
  const pptx = newDeck();
  const s = pptx.addSlide();
  const long = "把整十数看成几个十, 用乘法口诀算出几个十, 最后还原成几十, 这道题我们分三步来做";
  s.addText(long, { x: 1.0, y: 2.0, w: 2.0, h: 0.45, fontSize: 28 });

  const res = auditDeck(pptx, ["溢出页"]);
  assert.ok(codes(res).includes("TEXT_OVERFLOW"), `应报 TEXT_OVERFLOW, 实际: ${codes(res)}`);
});

test("几何审计: 含显式换行的多段文本, 末段不应被多算一行而误判溢出", () => {
  const pptx = newDeck();
  const s = pptx.addSlide();
  // 两段各一行, 0.85 高足够容纳 26pt 两行; 若把末尾 breakLine 当成第三行就会误报
  s.addText("瓜果飘香：杏子、香梨、蜜桃，\n特别是葡萄一大串一大串", {
    x: 1.4, y: 1.8, w: 10.53, h: 0.85, fontSize: 26
  });
  const res = auditDeck(pptx, ["换行页"]);
  assert.equal(res.summary.critical, 0, `不应误判溢出: ${JSON.stringify(res.issues)}`);
});

test("放映分步: 自下而上排序分步, 形状被标记为 REVEAL_<步>_<序>", () => {
  const pptx = newDeck();
  const s = pptx.addSlide();
  s.addText("口算乘法", { x: 0.8, y: 0.6, w: 8, h: 0.8, fontSize: 28 }); // 标题区, 由 baseCount 排除
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.8, y: 3.0, w: 6, h: 0.9 });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.8, y: 4.4, w: 6, h: 0.9 });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.8, y: 5.8, w: 6, h: 0.9 });

  const r = annotateRevealSteps(s, { baseCount: 1, pageType: "concept" });
  assert.ok(r.steps >= 1, `应有分步, 实际 ${r.steps}`);
  assert.equal(r.shapes, 3, "标题不应计入分步形状");

  const names = s._slideObjects
    .map(o => o?.options?.objectName)
    .filter(n => typeof n === "string" && n.startsWith(REVEAL_PREFIX));
  assert.equal(names.length, 3, "三个内容形状都应被打上分步标记");
  names.forEach(n => assert.ok(parseRevealName(n), `${n} 应为合法分步名`));
});

test("放映分步: 步数上限生效, 超出部分合并而非丢弃形状", () => {
  const pptx = newDeck();
  const s = pptx.addSlide();
  for (let i = 0; i < 8; i++) {
    s.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 2.6 + i * 0.55, w: 6, h: 0.45 });
  }
  const r = annotateRevealSteps(s, { baseCount: 0, pageType: "concept", maxSteps: 3 });
  assert.equal(r.steps, 3, "应被压缩到 3 步");
  assert.equal(r.shapes, 8, "合并不得丢弃形状");
  const marked = s._slideObjects.filter(o => String(o?.options?.objectName || "").startsWith(REVEAL_PREFIX));
  assert.equal(marked.length, 8);
});

test("放映分步: 封面/结束页与 reveal_mode=off 不分步", () => {
  const pptx = newDeck();
  const cover = pptx.addSlide();
  cover.addText("整十数乘一位数", { x: 1, y: 3, w: 8, h: 1, fontSize: 40 });
  assert.equal(annotateRevealSteps(cover, { pageType: "cover" }).steps, 0);

  const off = pptx.addSlide();
  off.addText("本页不分步", { x: 1, y: 3, w: 8, h: 1, fontSize: 24 });
  assert.equal(annotateRevealSteps(off, { pageType: "concept", mode: "off" }).steps, 0);
  const marked = off._slideObjects.filter(o => String(o?.options?.objectName || "").startsWith(REVEAL_PREFIX));
  assert.equal(marked.length, 0, "off 模式不应写入 REVEAL_ 标记");
});

test("放映分步: 显式 timeline 契约优先于自动推断", () => {
  const pptx = newDeck();
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 3.0, w: 6, h: 0.8, objectName: "card_reasoning" });
  s.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 4.2, w: 6, h: 0.8, objectName: "banner_conclusion" });

  const r = annotateRevealSteps(s, {
    baseCount: 0,
    pageType: "concept",
    timeline: [
      { step: 1, target: "card_reasoning" },
      { step: 2, target: "banner_conclusion" }
    ]
  });
  assert.equal(r.mode, "timeline");
  assert.equal(r.steps, 2);
  const names = s._slideObjects.map(o => String(o?.options?.objectName || ""));
  assert.ok(names.includes("REVEAL_1_0"), `第 1 步应标记第一个形状, 实际: ${names}`);
  assert.ok(names.includes("REVEAL_2_0"), `第 2 步应标记第二个形状, 实际: ${names}`);
});
