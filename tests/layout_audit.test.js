// -*- coding: utf-8 -*-
import test from "node:test";
import assert from "node:assert/strict";
import { auditDeck } from "../plugin/skills/lesson-courseware/lib_js/layout_audit.js";

test("layout_audit: 正常合规页面几何审计通过", () => {
  const mockPptx = {
    _slides: [
      {
        _slideObjects: [
          // 标题
          { text: "正常标题", options: { x: 1.0, y: 0.5, w: 10.0, h: 0.8, fontSize: 24 } },
          // 正文卡片
          { text: "正文内容", options: { x: 1.0, y: 1.8, w: 5.0, h: 4.0, fontSize: 18 } },
          // 右侧卡片
          { text: "右侧内容", options: { x: 6.5, y: 1.8, w: 5.0, h: 4.0, fontSize: 18 } }
        ]
      }
    ]
  };

  const report = auditDeck(mockPptx, ["第1页"]);
  assert.equal(report.summary.critical, 0);
  assert.equal(report.summary.warning, 0);
});

test("layout_audit: 形状超出 16:9 画布边缘触发越界报警", () => {
  const mockPptx = {
    _slides: [
      {
        _slideObjects: [
          // x + w = 11.0 + 3.0 = 14.0 > 13.333 (横向越界)
          { text: "越界卡片", options: { x: 11.0, y: 1.0, w: 3.0, h: 2.0, fontSize: 18 } }
        ]
      }
    ]
  };

  const report = auditDeck(mockPptx, ["第1页"]);
  assert.equal(report.summary.critical > 0, true);
  const outIssue = report.issues.find(i => i.code === "SHAPE_OUT_OF_CANVAS");
  assert.notEqual(outIssue, undefined);
  assert.match(outIssue.message, /越出画布/);
});

test("layout_audit: 两块文本严重重叠触发碰撞报警", () => {
  const mockPptx = {
    _slides: [
      {
        _slideObjects: [
          // 文本 A 与 文本 B 在相同区域几乎完全重叠
          { text: "文本框A", options: { x: 2.0, y: 2.0, w: 4.0, h: 2.0, fontSize: 18 } },
          { text: "文本框B覆盖了A", options: { x: 2.2, y: 2.1, w: 3.8, h: 1.8, fontSize: 18 } }
        ]
      }
    ]
  };

  const report = auditDeck(mockPptx, ["第1页"]);
  assert.equal(report.summary.critical > 0, true);
  const overlapIssue = report.issues.find(i => i.code === "TEXT_OVERLAP");
  assert.notEqual(overlapIssue, undefined);
  assert.match(overlapIssue.message, /文本框.*重叠/);
});

test("layout_audit: 答案题数缺失断言", () => {
  const mockPptx = {
    _slides: [
      {
        _slideObjects: [
          { text: "★ 参考答案：120", options: { x: 1.0, y: 1.0, w: 5.0, h: 1.0, fontSize: 18 } }
        ]
      }
    ]
  };

  // 期望 4 道题，但只出现 1 道
  const report = auditDeck(mockPptx, ["答案页"], {
    answerPages: [{ index: 0, expected: 4 }]
  });
  const missingIssue = report.issues.find(i => i.code === "ANSWER_ITEM_MISSING");
  assert.notEqual(missingIssue, undefined);
  assert.equal(missingIssue.severity, "critical");
});
