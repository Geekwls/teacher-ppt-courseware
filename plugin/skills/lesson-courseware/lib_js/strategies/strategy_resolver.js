// -*- coding: utf-8 -*-
/**
 * 课件多维策略仲裁与解析引擎 (strategy_resolver.js)
 *
 * 核心设计:
 * 坚决废除“单链覆盖”机制，将决策拆解为三套正交协作机制:
 * 1. Constraints (硬约束): SSOT 教材事实、学科计算/字形真值、数域上限、核心教学步骤不可删减;
 * 2. Strategies (教学策略):
 *    - GradeCognitivePolicy: 1-2年级具象(单页≤3块)/3-4年级图文模型(单页≤4块)/5-6年级思辨(单页≤5块);
 *    - SubjectTeachingPolicy: 数学算理与图元偏好 / 语文课文与田字格偏好 / 英语语境与对话偏好;
 *    - LessonTypePolicy: 新授课(探究驱动)/练习课(诊断驱动)/复习课(结构网络驱动);
 * 3. Preferences (用户偏好): 配色主题、字体微调、动效速度偏好 (仅在约束允许范围内生效);
 * 4. 冲突协调算法:
 *    当内容块负荷超过年级认知容量时，系统硬约束判定“算理不可删”，进而触发 PagePlanner 跨页拆分，
 *    彻底杜绝“为了满足页面容量而强制删减算理”的恶性冲突。
 */

export const HARD_CONSTRAINTS = {
  ssot_facts_must_verify: true,
  math_arithmetic_zero_error: true,
  chinese_text_no_unauthorized_alteration: true,
  core_pedagogical_steps_immutable: true,
  strict_zero_critical_geometry: true
};

export const GRADE_COGNITIVE_POLICIES = {
  lower: {
    tier: "lower",
    grades: [1, 2],
    maxBlocksPerSlide: 3,
    maxStepsPerReasoningSlide: 3,
    minFontSizePt: 22,
    preferConcreteVisual: true,
    motionPacing: "gentle"
  },
  middle: {
    tier: "middle",
    grades: [3, 4],
    maxBlocksPerSlide: 4,
    maxStepsPerReasoningSlide: 4,
    minFontSizePt: 18,
    preferConcreteVisual: true,
    motionPacing: "medium"
  },
  upper: {
    tier: "upper",
    grades: [5, 6],
    maxBlocksPerSlide: 5,
    maxStepsPerReasoningSlide: 6,
    minFontSizePt: 16,
    preferConcreteVisual: false,
    motionPacing: "brisk"
  }
};

export const SUBJECT_TEACHING_POLICIES = {
  math: {
    subject: "math",
    preferredFigures: ["number_line", "vertical_calc", "fraction_bar"],
    mandatoryPhases: ["context", "reasoning", "example", "practice", "summary"],
    stepOrderPreserved: true,
    splitPracticeAndAnswer: true
  },
  chinese: {
    subject: "chinese",
    preferredFigures: ["tianzige", "pinyin_line", "reading_card"],
    mandatoryPhases: ["text_excerpt", "character_writing", "vocabulary", "comprehension", "summary"],
    stepOrderPreserved: true,
    splitPracticeAndAnswer: true
  },
  english: {
    subject: "english",
    preferredFigures: ["dialogue_bubble", "word_card"],
    mandatoryPhases: ["phonics", "words", "dialogue", "practice", "wrapup"],
    stepOrderPreserved: true,
    splitPracticeAndAnswer: true
  }
};

export const LESSON_TYPE_POLICIES = {
  concept_learning: {
    type: "concept_learning",
    name: "新授探究课",
    defaultPhases: ["warmup", "exploration", "example", "misconception", "practice", "summary"]
  },
  practice_consolidation: {
    type: "practice_consolidation",
    name: "练习巩固课",
    defaultPhases: ["recall", "basic_practice", "variant_practice", "error_analysis", "summary"]
  },
  unit_review: {
    type: "unit_review",
    name: "单元复习课",
    defaultPhases: ["network", "topic_drill", "summary"]
  }
};

function getGradeTier(grade) {
  const g = Number(grade) || 3;
  if (g <= 2) return "lower";
  if (g <= 4) return "middle";
  return "upper";
}

/**
 * 多维策略仲裁与上下文解析
 * @param {object} input
 *   - subject: "math" | "chinese" | "english"
 *   - grade: number (1..6)
 *   - lesson_type: "concept_learning" | ...
 *   - userPreferences: object (theme, fontPreference, etc.)
 * @returns {object} ResolvedStrategyContext
 */
export function resolveStrategyContext(input = {}) {
  const subjectKey = input.subject || "math";
  const gradeNum = Number(input.grade) || 3;
  const lessonTypeKey = input.lesson_type || "concept_learning";
  const prefs = input.userPreferences || {};

  const gradeTier = getGradeTier(gradeNum);
  const gradePolicy = GRADE_COGNITIVE_POLICIES[gradeTier];
  const subjectPolicy = SUBJECT_TEACHING_POLICIES[subjectKey] || SUBJECT_TEACHING_POLICIES.math;
  const lessonTypePolicy = LESSON_TYPE_POLICIES[lessonTypeKey] || LESSON_TYPE_POLICIES.concept_learning;

  const defaultTheme = subjectKey === "chinese"
    ? "warm_chinese_bamboo"
    : subjectKey === "english"
      ? "fresh_english_morning"
      : "clean_math_ocean";

  const resolvedTheme = prefs.theme || defaultTheme;

  return {
    meta: {
      subject: subjectKey,
      grade: gradeNum,
      grade_tier: gradeTier,
      lesson_type: lessonTypeKey
    },
    constraints: HARD_CONSTRAINTS,
    cognitive: gradePolicy,
    subject: subjectPolicy,
    lesson_type: lessonTypePolicy,
    preferences: {
      theme: resolvedTheme,
      aspect_ratio: prefs.aspect_ratio || "16:9",
      motion_enabled: prefs.motion_enabled !== false
    },
    /**
     * 环节容量负荷评估与跨页决策
     * @param {object} phaseContent 教学环节内容块
     * @returns {{ needSplit: boolean, reason: string|null, splitPlan: object|null }}
     */
    evaluateCapacityAndSplit(phaseContent = {}) {
      const reasoningSteps = phaseContent.reasoning_steps || [];
      const hasFigure = Boolean(phaseContent.model_payload || phaseContent.visual_model);

      // 如果有数轴等图元，同时推理步数超过了年级认知上限，触发跨页拆分
      if (hasFigure && reasoningSteps.length > gradePolicy.maxStepsPerReasoningSlide) {
        return {
          needSplit: true,
          reason: `当前环节包含复杂图元且算理步骤 (${reasoningSteps.length}步) 超过 ${gradePolicy.tier} 学段单页建议容量 (${gradePolicy.maxStepsPerReasoningSlide}步)，硬约束要求算理不可删减，决策触发跨页拆分。`,
          splitMode: "model_and_reasoning_sequence"
        };
      }

      // 如果是练习题超过 2 题，触发题目与答案拆页
      if (phaseContent.type === "practice_challenge" && Array.isArray(phaseContent.items) && phaseContent.items.length >= 2) {
        return {
          needSplit: true,
          reason: "练习题量较多，依据教学时序策略拆分为「当堂做题页」与「逐题诊断答案页」。",
          splitMode: "practice_and_answer_dual_page"
        };
      }

      // 如果是长文本精读且设问较多，触发原文品读与设问探究拆页 (保障大字号与深度思维)
      if (phaseContent.type === "text_reading") {
        const excerpt = String(phaseContent.paragraph_excerpt || "").trim();
        const questions = Array.isArray(phaseContent.focus_questions) ? phaseContent.focus_questions : [];
        const isUpperOrJunior = gradeTier === "upper" || gradeNum >= 7;
        const isLongText = excerpt.length > 70 || excerpt.split("\n").filter(Boolean).length >= 3;

        if (isUpperOrJunior && isLongText && questions.length >= 2) {
          return {
            needSplit: true,
            reason: `长文本品读 (${excerpt.length}字) 伴随多重设问 (${questions.length}问)，为保障教室后排可读性(≥20pt)与深度思维探究，决策拆分为「原文沉浸品读」与「文本设问与深层探究」。`,
            splitMode: "text_reading_and_questions_dual_page"
          };
        }
      }

      return {
        needSplit: false,
        reason: null,
        splitMode: null
      };
    }
  };
}
