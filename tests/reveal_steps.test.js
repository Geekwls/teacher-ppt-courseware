// -*- coding: utf-8 -*-
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRevealName,
  annotateRevealSteps,
  REVEAL_PREFIX
} from "../plugin/skills/lesson-courseware/lib_js/reveal_steps.js";

test("reveal_steps: parseRevealName 解析合法与非法名称", () => {
  assert.deepEqual(parseRevealName("REVEAL_1_0"), { step: 1, idx: 0 });
  assert.deepEqual(parseRevealName("REVEAL_3_5"), { step: 3, idx: 5 });
  assert.equal(parseRevealName("Shape 1"), null);
  assert.equal(parseRevealName("REVEAL_X_Y"), null);
  assert.equal(parseRevealName(null), null);
});

test("reveal_steps: reveal_mode='off' 或封面页不打步骤标记", () => {
  const mockSlide = {
    _slideObjects: [
      { options: { x: 1, y: 1, w: 5, h: 2 } }
    ]
  };

  // mode: "off"
  const resOff = annotateRevealSteps(mockSlide, { mode: "off" });
  assert.equal(resOff.steps, 0);

  // pageType: "cover" 封面页
  const resCover = annotateRevealSteps(mockSlide, { pageType: "cover" });
  assert.equal(resCover.steps, 0);
});

test("reveal_steps: 垂直重叠的卡片底板与编号自动聚类为同一步骤", () => {
  const cardBg = { options: { x: 1.0, y: 2.0, w: 10.0, h: 1.0 } };
  const badge = { options: { x: 1.2, y: 2.2, w: 0.6, h: 0.6 } };
  const text = { options: { x: 2.0, y: 2.1, w: 8.0, h: 0.8 } };

  const nextCardBg = { options: { x: 1.0, y: 3.5, w: 10.0, h: 1.0 } };
  const nextBadge = { options: { x: 1.2, y: 3.7, w: 0.6, h: 0.6 } };

  const mockSlide = {
    _slideObjects: [
      // baseCount = 1 (框架形状，如标题)
      { options: { x: 1, y: 0.5, w: 8, h: 0.8 } },
      cardBg,
      badge,
      text,
      nextCardBg,
      nextBadge
    ]
  };

  const res = annotateRevealSteps(mockSlide, {
    baseCount: 1,
    pageType: "practice"
  });

  assert.equal(res.steps, 2);
  // 第一组 (cardBg, badge, text) 均为 step 1
  assert.equal(cardBg.options.objectName.startsWith("REVEAL_1_"), true);
  assert.equal(badge.options.objectName.startsWith("REVEAL_1_"), true);
  assert.equal(text.options.objectName.startsWith("REVEAL_1_"), true);

  // 第二组 为 step 2
  assert.equal(nextCardBg.options.objectName.startsWith("REVEAL_2_"), true);
  assert.equal(nextBadge.options.objectName.startsWith("REVEAL_2_"), true);
});
