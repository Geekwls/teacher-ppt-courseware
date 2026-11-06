// -*- coding: utf-8 -*-
/**
 * 学科元数据 (domain/subjects.js) —— 唯一事实源
 *
 * 学科中文名、知识库目录名集中在此。规划层、主题层、门禁层不得各自维护映射表。
 */

export const SUBJECT_LABEL = {
  math: "数学",
  chinese: "语文",
  english: "英语",
  science: "科学"
};

/** 知识库 curriculum 下的学科目录名 */
export const SUBJECT_DIRS = {
  math: "primary-math",
  chinese: "primary-chinese",
  english: "primary-english",
  science: "primary-science"
};

export function subjectLabel(subject) {
  return SUBJECT_LABEL[subject] || subject || "";
}
