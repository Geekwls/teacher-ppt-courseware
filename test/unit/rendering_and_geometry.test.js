// -*- coding: utf-8 -*-
/**
 * 确定性渲染、栅格几何与版式体检测试 (test/unit/rendering_and_geometry.test.js)
 *
 * 核心目标:
 * 聚焦交付终点的两道硬防线:
 * 1. 栅格槽位几何约束 (makeGridSlots / makeSplitSlots / makeListSlots 边界安全);
 * 2. 负向几何体检 (越界、严重溢出必须拦截报 Critical / Warning);
 * 3. 原生放映分步时序标记 (REVEAL_ 步骤编码规范且顺序合规);
 * 4. 变体与新页型端到端渲染 (目标页变体、练习页变体、小结页变体、指令卡、对比表、知识树全部 0 Critical).
 */

import test from "node:test";
import assert from "node:assert/strict";
import pptxgen from "pptxgenjs";

import {
  SAFE_CONTENT_BOUNDS,
  makeGridSlots,
  makeSplitSlots,
  makeListSlots
} from "../../plugin/skills/lesson-courseware/lib_js/rendering/grid_slots.js";

import { auditDeck } from "../../plugin/skills/lesson-courseware/lib_js/layout_audit.js";
import { annotateRevealSteps, parseRevealName, REVEAL_PREFIX } from "../../plugin/skills/lesson-courseware/lib_js/reveal_steps.js";
import { resolveTheme } from "../../plugin/skills/lesson-courseware/lib_js/theme.js";
import {
  renderObjectivesCard,
  renderPracticeList,
  renderSummaryCard,
  renderActivityInstruction,
  renderComparisonTable,
  renderKnowledgeTree
} from "../../plugin/skills/lesson-courseware/lib_js/rendering/new_page_renderers.js";

function newDeck() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 英寸
  return pptx;
}

test("栅格与槽位: 矩阵与分栏计算落在安全区内且无坐标倒置", () => {
  const bounds = { x: 1.0, y: 1.5, w: 10.0, h: 5.0 };
  const grid = makeGridSlots(bounds, { rows: 2, cols: 3, gapX: 0.2, gapY: 0.2 });
  assert.equal(grid.length, 6);
  grid.forEach(s => {
    assert.ok(s.x >= bounds.x && s.y >= bounds.y);
    assert.ok(s.x + s.w <= bounds.x + bounds.w + 0.01);
    assert.ok(s.y + s.h <= bounds.y + bounds.h + 0.01);
  });

  const [left, right] = makeSplitSlots(bounds, { ratios: [0.4, 0.6], gap: 0.3 });
  assert.ok(left.w > 0 && right.w > 0);
  assert.ok(right.w > left.w);
  assert.ok(Math.abs((left.w + right.w + 0.3) - bounds.w) < 0.05);

  const list = makeListSlots(bounds, { count: 3, maxItemH: 1.2, gap: 0.2 });
  assert.equal(list.length, 3);
  list.forEach(s => assert.ok(s.h <= 1.201));
});

test("几何体检: 形状越界或文字严重溢出必须报异常", () => {
  const pptx = newDeck();
  const s = pptx.addSlide();
  // 故意将形状推到画布右边界外 (画布宽 13.333)
  s.addShape(pptx.shapes.RECTANGLE, { x: 12.8, y: 1.0, w: 3.0, h: 1.0 });

  const res = auditDeck(pptx, ["越界页"]);
  const codes = res.issues.map(i => i.code);
  assert.ok(codes.includes("SHAPE_OUT_OF_CANVAS"), "越出画布边界必须报 SHAPE_OUT_OF_CANVAS");
  assert.equal(res.summary.critical, 1);
});

test("几何体检: 文字塞不进小框必须报 TEXT_OVERFLOW", () => {
  const pptx = newDeck();
  const s = pptx.addSlide();
  const long = "把整十数看成几个十, 用乘法口诀算出几个十, 最后还原成几十, 这道题我们分三步来做认真计算仔细检验";
  s.addText(long, { x: 1.0, y: 2.0, w: 2.0, h: 0.45, fontSize: 28 });

  const res = auditDeck(pptx, ["溢出页"]);
  const codes = res.issues.map(i => i.code);
  assert.ok(codes.includes("TEXT_OVERFLOW"), "文本严重超宽超高必须报 TEXT_OVERFLOW");
});

test("放映分步: 形状自动打上 REVEAL_ 前缀且支持步数上限压缩", () => {
  const pptx = newDeck();
  const s = pptx.addSlide();
  s.addText("页面大标题", { x: 0.8, y: 0.6, w: 8, h: 0.8, fontSize: 28 }); // 标题由 baseCount=1 排除
  for (let i = 0; i < 6; i++) {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.8, y: 2.0 + i * 0.7, w: 6, h: 0.5 });
  }

  // 压缩至最多 3 步
  const r = annotateRevealSteps(s, { baseCount: 1, pageType: "concept", maxSteps: 3 });
  assert.equal(r.steps, 3, "步骤应被压缩到上限 3 步");
  assert.equal(r.shapes, 6, "压缩步骤不得丢弃任何形状");

  const names = s._slideObjects
    .map(o => o?.options?.objectName)
    .filter(n => typeof n === "string" && n.startsWith(REVEAL_PREFIX));
  assert.equal(names.length, 6);
  names.forEach(n => assert.ok(parseRevealName(n)));
});

test("渲染层验收: 所有版式变体与高频新页型确定性渲染全部 0 Critical", () => {
  const pptx = newDeck();
  const theme = resolveTheme("math", 3, "clean");
  const shadow = { type: "outer", color: "CBD5E1", blur: 4, offset: 2, angle: 90, opacity: 0.25 };
  const font = "Microsoft YaHei";

  // 1. ObjectivesCard: grid
  const s1 = pptx.addSlide();
  renderObjectivesCard(s1, pptx, theme, {
    layout_variant: "grid",
    elements: [{ type: "card_list", properties: { items: ["目标一：掌握基础知识", "目标二：理解核心算理", "目标三：拓展综合应用"] } }]
  }, shadow, font);

  // 2. ObjectivesCard: split_lr
  const s2 = pptx.addSlide();
  renderObjectivesCard(s2, pptx, theme, {
    layout_variant: "split_lr",
    elements: [{ type: "card_list", properties: { items: ["学习目标 A：理解概念内涵", "学习目标 B：规范解答示范"] } }]
  }, shadow, font);

  // 3. PracticeList: two_column
  const s3 = pptx.addSlide();
  renderPracticeList(s3, pptx, theme, {
    layout_variant: "two_column",
    elements: [{ type: "practice_list", properties: { questions: ["① 20 × 3 = ?", "② 300 × 2 = ?", "③ 40 × 5 = ?", "④ 500 × 6 = ?"] } }]
  }, shadow, font);

  // 4. PracticeList: timed_challenge
  const s4 = pptx.addSlide();
  renderPracticeList(s4, pptx, theme, {
    layout_variant: "timed_challenge",
    elements: [{ type: "practice_list", properties: { questions: ["关卡一：口算 60 × 4", "关卡二：口算 800 × 3"] } }]
  }, shadow, font);

  // 5. SummaryCard: mindmap
  const s5 = pptx.addSlide();
  renderSummaryCard(s5, pptx, theme, {
    layout_variant: "mindmap",
    elements: [{ type: "card_list", properties: { items: ["整十数相乘先算非零位", "末尾数零添零", "本质是计数单位相乘"] } }]
  }, shadow, font);

  // 6. ActivityInstruction 活动指令卡
  const s6 = pptx.addSlide();
  renderActivityInstruction(s6, pptx, theme, {
    elements: [{
      type: "activity_card",
      properties: {
        activity_type: "四人小组合作探究",
        duration: "4分钟",
        tasks: ["① 组内轮流说一说自己的算法", "② 记录最快最简便的做法", "③ 推选一名同学准备汇报"],
        prompt: "轻声交流，互相倾听。"
      }
    }]
  }, shadow, font);

  // 7. ComparisonTable 对比表
  const s7 = pptx.addSlide();
  renderComparisonTable(s7, pptx, theme, {
    elements: [{
      type: "comparison_table",
      properties: {
        headers: ["对比维度", "常见误区", "标准算法"],
        rows: [["末尾有0的乘法", "算丢末尾零", "先乘非零数再添零"]],
        summary_tip: "算理理清楚，计算快又准。"
      }
    }]
  }, shadow, font);

  // 8. KnowledgeTree 知识树
  const s8 = pptx.addSlide();
  renderKnowledgeTree(s8, pptx, theme, {
    elements: [{
      type: "tree_graph",
      properties: {
        root_topic: "整十数乘一位数",
        branches: [{ name: "算理建模", leaves: ["数轴连续跳跃", "计数单位转化"] }]
      }
    }]
  }, shadow, font);

  const audit = auditDeck(pptx);
  assert.equal(audit.summary.critical, 0, `变体与新页型出现几何体检 Critical 错误: ${JSON.stringify(audit.issues)}`);
});
