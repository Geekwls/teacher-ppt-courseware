// -*- coding: utf-8 -*-
/**
 * 文本度量与自适应排版单元测试 (test/unit/text_fit.test.js)
 *
 * text_fit.js 是从旧 layouts.js 提炼出来的纯函数层, 承载"防孤字折行"这项
 * 旧管线独有能力; 迁移后必须由单测锁住语义, 否则无声退化无人发现。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  charWidthEm,
  textWidthEm,
  linesForText,
  estimateLines,
  balancedSplit,
  fitTextLayout,
  fitFontSize,
  truncateByWidth
} from "../../plugin/skills/lesson-courseware/lib_js/text_fit.js";

test("字宽估算: 中文全角 > 数字 > 空格, 混排按字符累加", () => {
  assert.equal(charWidthEm("中"), 1.0);
  assert.ok(charWidthEm("8") < charWidthEm("中"), "数字应窄于汉字");
  assert.ok(charWidthEm(" ") < charWidthEm("8"), "空格应窄于数字");
  assert.equal(textWidthEm("中文"), 2.0);
  assert.ok(textWidthEm("abc") < textWidthEm("中文"), "三个字母应窄于两个汉字");
  assert.equal(textWidthEm(""), 0);
});

test("折行: 文本不超宽时只有一行, 超宽时按宽度切成多行且不丢字符", () => {
  assert.deepEqual(linesForText("口算乘法", 10, 24), ["口算乘法"]);

  const long = "把整十数看成几个十, 用乘法口诀算出几个十, 就是几十";
  const lines = linesForText(long, 3.0, 24);
  assert.ok(lines.length > 1, `3 英寸宽应折行, 实际 ${lines.length} 行`);
  assert.equal(lines.join(""), long, "折行不得丢字或加字");
  assert.equal(estimateLines("口算乘法", 10, 24), 1);
});

test("折行: 显式换行符被保留为独立段落", () => {
  const lines = linesForText("第一行\n第二行", 10, 24);
  assert.deepEqual(lines, ["第一行", "第二行"]);
});

test("均衡分两行: 长句分成两段且中间有切点, 不会出现末行单字", () => {
  const text = "每盒有二十支铅笔, 三盒一共有六十支铅笔, 我们一起来算一算";
  const parts = balancedSplit(text);
  assert.equal(parts.length, 2, "长句应切成两段");
  assert.equal(parts.join(""), text, "切分不得丢字");
  assert.ok(parts[1].length >= 2, `末行不应只剩单字, 实际: ${JSON.stringify(parts[1])}`);

  // 过短文本没有可切点, 原样返回单段
  assert.deepEqual(balancedSplit("好"), ["好"]);
});

test("自适应字号: 长文本降字号但不低于下限, 且结果不再溢出", () => {
  const short = "口算乘法";
  assert.equal(fontSizeOf("口算乘法", 10, 1.0, 24, 14), 24, "宽盒子短文本保持基准字号");

  const long = "整十数乘一位数, 先把整十数看成几个十, 再用乘法口诀算出积是几个十, 最后还原成几十";
  const fitted = fitTextLayout(long, 4.0, 0.9, 24, 16);
  assert.ok(fitted.size < 24, "长文本应降字号");
  assert.ok(fitted.size >= 16, "不得低于最小字号");
  assert.ok(fitted.lines * (fitted.size / 72) * 1.30 <= 0.9, "降字号后应能容纳");

  // 极小盒子: 字号压到下限后依旧返回下限, 不会无限降级
  assert.equal(fitFontSize(long, 1.0, 0.2, 24, 12), 12);
});

test("自适应字号: 文本首尾空白被清理, 不因尾随空格多算一行", () => {
  const withSpace = fitTextLayout("  口算乘法  \n", 10, 1.0, 24, 14);
  assert.equal(withSpace.text, "口算乘法");
});

test("按宽度截断: 超宽补省略号, 未超宽原样返回", () => {
  assert.equal(truncateByWidth("口算乘法", 4), "口算乘法");
  const cut = truncateByWidth("整十数乘一位数的口算方法", 5);
  assert.ok(cut.endsWith("…"), "截断应带省略号");
  assert.ok(textWidthEm(cut) <= 6, `截断结果不应明显超宽(仅允许省略号溢出): ${cut}`);
});

// 小helper: 断言可读性
function fontSizeOf(text, w, h, base, min) {
  return fitFontSize(text, w, h, base, min);
}
