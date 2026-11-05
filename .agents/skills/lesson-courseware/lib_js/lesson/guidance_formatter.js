// -*- coding: utf-8 -*-
/**
 * 教师讲稿结构化格式化引擎 (guidance_formatter.js)
 *
 * 核心目标:
 * 承载配套功能“讲稿结构化”，将 say / ask / expected_answer / transition / timing
 * 组装为可直接照读的标准教案式 PPT 备注栏内容，向下兼容纯文本讲稿。
 */

/**
 * 提取讲稿的纯文本摘要 (用于字数、禁区或数域校验)
 */
export function extractGuidanceText(guidance) {
  if (!guidance) return "";
  if (typeof guidance === "string") return guidance.trim();
  if (typeof guidance === "object") {
    return [
      guidance.timing,
      guidance.say,
      guidance.ask,
      guidance.expected_answer,
      guidance.transition
    ].filter(Boolean).join(" ").trim();
  }
  return String(guidance).trim();
}

/**
 * 将讲稿格式化为 PPT 备注栏文本
 * @param {string|object} guidance 原始讲稿输入
 * @param {object} options
 *   - speech_detail: "bullet" | "interactive" | "diagnostic" | "speech" | "verbatim"
 *   - defaultNote: 兜底文案
 * @returns {string} 格式化后的备注栏文本
 */
export function formatTeacherGuidance(guidance, {
  speech_detail = "bullet",
  defaultNote = "请同学们认真观察大屏幕，跟随老师的思路积极思考。"
} = {}) {
  if (!guidance) return defaultNote;

  if (typeof guidance === "string") {
    const raw = guidance.trim();
    if (raw.length < 5) return defaultNote;
    return raw;
  }

  if (typeof guidance === "object") {
    const sections = [];

    if (guidance.timing) {
      sections.push(`【建议用时】${guidance.timing}`);
    }

    if (guidance.say) {
      const label = speech_detail === "verbatim" ? "【教学台词】" : "【讲授要点】";
      sections.push(`${label}${guidance.say}`);
    }

    if (guidance.ask) {
      sections.push(`【启发提问】${guidance.ask}`);
    }

    if (guidance.expected_answer) {
      sections.push(`【预设回答】${guidance.expected_answer}`);
    }

    if (guidance.transition) {
      sections.push(`【环节过渡】${guidance.transition}`);
    }

    if (sections.length === 0) {
      return defaultNote;
    }

    return sections.join("\n\n");
  }

  return defaultNote;
}
