// -*- coding: utf-8 -*-
/**
 * 学段标签 (domain/grades.js) —— 唯一事实源
 *
 * 小学 1~6 年级 + 初中 7~9 年级。封面副标题、页脚与讲稿都从这里取中文名。
 */

export const GRADE_NAMES = {
  1: "一年级",
  2: "二年级",
  3: "三年级",
  4: "四年级",
  5: "五年级",
  6: "六年级",
  7: "七年级",
  8: "八年级",
  9: "九年级"
};

export function gradeLabel(grade) {
  return GRADE_NAMES[grade] || `${grade}年级`;
}
