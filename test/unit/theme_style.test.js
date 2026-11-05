// -*- coding: utf-8 -*-
/**
 * 风格包单元测试 (theme_style.test.js)
 *
 * 只测"风格解析与 token 合法性", 不测几何:
 * 几何回归由 npm test 的样式矩阵承担 (每份金样 x 5 套风格跑 strict 渲染)。
 * 这样单测保持毫秒级, 又不留下"新增风格没人验"的空档。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  STYLE_PACKS,
  STYLE_PACK_IDS,
  resolveStylePack,
  resolveTheme
} from "../../plugin/skills/lesson-courseware/lib_js/theme.js";

const EXPECTED = ["clean", "warm", "academic", "minimal", "chalk"];

function luminance(hex) {
  const clean = String(hex).replace("#", "").trim();
  const rgb = [0, 2, 4].map(i => parseInt(clean.slice(i, i + 2), 16) / 255);
  const lin = rgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

test("风格包: 恰好注册 5 套且 ID 稳定 (契约枚举与验收矩阵依赖它)", () => {
  assert.deepEqual(STYLE_PACK_IDS, EXPECTED);
  for (const id of EXPECTED) {
    assert.equal(STYLE_PACKS[id].id, id, `${id} 的 id 字段必须与键一致`);
    assert.ok(STYLE_PACKS[id].label, `${id} 缺少中文名`);
    assert.ok(STYLE_PACKS[id].summary, `${id} 缺少一句话说明`);
  }
});

test("风格解析: 未知风格回落 clean, 旧别名 normalizes 到新包", () => {
  assert.equal(resolveStylePack("clean").id, "clean");
  assert.equal(resolveStylePack("").id, "clean");
  assert.equal(resolveStylePack("brand_new_2027").id, "clean", "未知风格必须静默回落, 不能抛错");
  assert.equal(resolveStylePack("standard").id, "clean", "旧 standard 应映射到 clean");
  assert.equal(resolveStylePack("innovative").id, "warm", "旧 innovative 应映射到 warm");
  assert.equal(resolveStylePack("  WARM  ").id, "warm", "大小写与空白应被归一");
});

test("风格包: 5 套视觉 token 必须彼此可区分 (不能只换名字)", () => {
  const sigs = EXPECTED.map(id => {
    const t = resolveTheme("math", 3, id);
    return `${t.bgTint}|${t.accent}|${t.card.radius}|${t.frame.header}|${t.cover.layout}`;
  });
  assert.equal(new Set(sigs).size, EXPECTED.length, `风格签名出现重复: ${sigs.join(" / ")}`);
});

test("可读性: 每套风格的正文字色与页面底色对比度 >= 7:1 (AAA 大字号标准)", () => {
  for (const id of EXPECTED) {
    for (const subject of ["math", "chinese", "english"]) {
      for (const grade of [1, 3, 6, 7]) {
        const t = resolveTheme(subject, grade, id);
        const ratio = contrast(t.ink, t.bgTint);
        assert.ok(
          ratio >= 7,
          `${id}/${subject}/g${grade} 正文字色 ${t.ink} 对底色 ${t.bgTint} 对比度仅 ${ratio.toFixed(2)}:1`
        );
      }
    }
  }
});

test("可读性: 卡片正文 (ink on panel) 与页脚 (muted on bgTint) 均不得低于 4.5:1", () => {
  for (const id of EXPECTED) {
    const t = resolveTheme("math", 3, id);
    assert.ok(contrast(t.ink, t.panel) >= 4.5, `${id}: 卡片正文对比度不足`);
    assert.ok(contrast(t.muted, t.bgTint) >= 4.5, `${id}: 页脚灰字对比度不足`);
  }
});

test("字号缩放: 全部字阶不低于 11pt, 且 warm 标题 >= clean >= academic", () => {
  for (const id of EXPECTED) {
    for (const grade of [1, 3, 6, 7]) {
      const t = resolveTheme("math", grade, id);
      for (const [key, size] of Object.entries(t.fontSize)) {
        assert.ok(size >= 11, `${id}/g${grade} 的 ${key} 只有 ${size}pt, 会不可读`);
        assert.ok(Number.isInteger(size), `${id}/g${grade} 的 ${key} 应为整数 pt, 实际 ${size}`);
      }
    }
  }
  const clean = resolveTheme("math", 3, "clean").fontSize.title;
  const warm = resolveTheme("math", 3, "warm").fontSize.title;
  const academic = resolveTheme("math", 3, "academic").fontSize.title;
  assert.ok(warm >= clean, `warm 标题应不小于 clean (${warm} vs ${clean})`);
  assert.ok(academic <= clean, `academic 标题应不大于 clean (${academic} vs ${clean})`);
});

test("圆角与投影: 半径落在安全区间; minimal 用 null 表示无阴影 (0 会写出畸形 effectLst)", () => {
  for (const id of EXPECTED) {
    const t = resolveTheme("math", 3, id);
    assert.ok(typeof t.card.radius === "number", `${id} 缺少圆角`);
    assert.ok(t.card.radius >= 0 && t.card.radius <= 0.3, `${id} 圆角 ${t.card.radius} 超出安全区间`);
    if (id === "minimal") {
      assert.equal(t.card.shadow, null, "minimal 必须用 null 关闭阴影");
    } else {
      assert.ok(t.card.shadow && t.card.shadow.type === "outer", `${id} 应带柔和外阴影`);
      assert.ok(t.card.shadow.opacity > 0 && t.card.shadow.opacity <= 0.35, `${id} 阴影浓度应收敛`);
    }
  }
});

test("学科主色: 非覆盖型风格必须保留三科色相, 极简与手账允许统一收敛", () => {
  const mathClean = resolveTheme("math", 3, "clean").primary;
  const chineseClean = resolveTheme("chinese", 3, "clean").primary;
  assert.notEqual(mathClean, chineseClean, "clean 下数学与语文主色不能相同");

  for (const id of ["clean", "warm", "academic"]) {
    assert.equal(resolveTheme("math", 3, id).primary, mathClean, `${id} 不应改动学科主色`);
  }
  // minimal/chalk 有意统一为黑白或墨绿, 这是风格定义而非退化
  assert.equal(resolveTheme("math", 3, "minimal").primary, resolveTheme("chinese", 3, "minimal").primary);
  assert.equal(resolveTheme("math", 3, "chalk").primary, resolveTheme("chinese", 3, "chalk").primary);
});

test("风格不改变学段节奏: 同一风格下低段字号仍大于高段", () => {
  for (const id of EXPECTED) {
    const lower = resolveTheme("math", 1, id).fontSize.body;
    const upper = resolveTheme("math", 6, id).fontSize.body;
    assert.ok(lower > upper, `${id}: 低段正文 ${lower} 应大于高段 ${upper}`);
  }
  assert.equal(resolveTheme("math", 3, "warm").maxItemsPerSlide, resolveTheme("math", 3, "clean").maxItemsPerSlide);
  assert.equal(resolveTheme("math", 3, "warm").gradeLevel, "middle");
});
