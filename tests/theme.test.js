// -*- coding: utf-8 -*-
import test from "node:test";
import assert from "node:assert/strict";
import {
  getGradeLevel,
  resolveTheme,
  footerOf,
  SUBJECT_LABEL,
  TERM_LABEL,
  CANVAS_W,
  CANVAS_H
} from "../plugin/skills/lesson-courseware/lib_js/theme.js";

test("theme: 学段级别划分", () => {
  assert.equal(getGradeLevel(1), "lower");
  assert.equal(getGradeLevel(2), "lower");
  assert.equal(getGradeLevel(3), "middle");
  assert.equal(getGradeLevel(4), "middle");
  assert.equal(getGradeLevel(5), "upper");
  assert.equal(getGradeLevel(6), "upper");
});

test("theme: 语数英主题与色彩 Token 解析", () => {
  const mathTheme = resolveTheme("math", 3);
  assert.equal(mathTheme.gradeLevel, "middle");
  assert.equal(typeof mathTheme.primary, "string");
  assert.equal(typeof mathTheme.accent, "string");
  assert.equal(mathTheme.fontSize.title > mathTheme.fontSize.body, true);

  const chineseTheme = resolveTheme("chinese", 1);
  assert.equal(chineseTheme.gradeLevel, "lower");
  // 低段字号通常大于中段字号以保护低年级视力
  assert.equal(chineseTheme.fontSize.body >= mathTheme.fontSize.body, true);

  const englishTheme = resolveTheme("english", 5);
  assert.equal(englishTheme.gradeLevel, "upper");
});

test("theme: footerOf 导航页脚规范生成", () => {
  const meta = {
    grade: 3,
    term: "term-1",
    unit_name: "多位数乘一位数",
    class_period_label: "第1课时"
  };
  const footer = footerOf(meta);
  assert.match(footer, /人教版·3年级上册/);
  assert.match(footer, /多位数乘一位数/);
  assert.match(footer, /第1课时/);
});

test("theme: 16:9 画布标准比例定义", () => {
  assert.equal(CANVAS_W, 13.333);
  assert.equal(CANVAS_H, 7.5);
});
