// -*- coding: utf-8 -*-
/**
 * 场景预设解析引擎 (scene_presets.js)
 *
 * 核心目标:
 * 承载“旋钮 4｜场景预设”，通过一个字段同时联动决策：
 * 1. 结构 (骨架与收尾页补齐);
 * 2. 风格 (5套视觉风格包联动);
 * 3. 密度 (排版字号与卡槽空间);
 * 4. 讲稿 (详略度与教案化格式);
 * 5. 变体 (默认选用的版式变体)。
 */

export const SCENE_PRESETS = {
  standard: {
    id: "standard",
    name: "常态课",
    desc: "全环节常态教学，标准字阶与卡槽密度，讲稿为要点式引导",
    default_style: "clean",
    density: "standard",
    speech_detail: "bullet",
    default_variants: {
      objectives_card: "list",
      practice_list: "single_column",
      summary_card: "points"
    },
    extra_closers: [],
    motion_pacing: "medium"
  },
  open_class: {
    id: "open_class",
    name: "公开课",
    desc: "赛课/公开课示范，字号放大、留白增加，强制板书页、分层作业与活动卡，互动更细",
    default_style: "warm",
    density: "spacious",
    speech_detail: "interactive",
    default_variants: {
      objectives_card: "split_lr",
      practice_list: "timed_challenge",
      summary_card: "mindmap"
    },
    extra_closers: ["board", "homework"],
    motion_pacing: "detailed"
  },
  review: {
    id: "review",
    name: "复习课",
    desc: "期中/期末/单元复习，两栏题组与知识网络，高密度表格化排版",
    default_style: "clean",
    density: "compact",
    speech_detail: "diagnostic",
    default_variants: {
      objectives_card: "grid",
      practice_list: "two_column",
      summary_card: "tree"
    },
    extra_closers: ["board", "homework"],
    motion_pacing: "brisk"
  },
  parent_meeting: {
    id: "parent_meeting",
    name: "家长会",
    desc: "汇报展示与家校沟通，结论先行、一页一观点、少字多图",
    default_style: "clean",
    density: "minimal",
    speech_detail: "speech",
    default_variants: {
      objectives_card: "list",
      practice_list: "single_column",
      summary_card: "points"
    },
    extra_closers: [],
    motion_pacing: "gentle"
  },
  new_teacher: {
    id: "new_teacher",
    name: "新教师备课",
    desc: "初入职/实习教师备课，全环节严谨闭环，讲稿逐句写出台词、发问、应答与过渡",
    default_style: "clean",
    density: "standard",
    speech_detail: "verbatim",
    default_variants: {
      objectives_card: "list",
      practice_list: "single_column",
      summary_card: "points"
    },
    extra_closers: ["board", "homework"],
    motion_pacing: "medium"
  }
};

export const SCENE_PRESET_IDS = Object.keys(SCENE_PRESETS);

/**
 * 解析场景预设与用户覆盖
 * @param {string} presetId 预设 ID
 * @param {object} userPreferences 用户显式覆盖偏好
 * @returns {object} 解析后的场景配置
 */
export function resolveScenePreset(presetId = "standard", userPreferences = {}) {
  const normId = String(presetId || "standard").trim().toLowerCase();
  const base = SCENE_PRESETS[normId] || SCENE_PRESETS.standard;

  // 用户显式指定的 style 优先于预设的 default_style
  const effectiveStyle = userPreferences.style || base.default_style;

  // 用户显式指定的 layout_variants 优先合并
  const effectiveVariants = {
    ...base.default_variants,
    ...(userPreferences.layout_variants || {})
  };

  return {
    preset_id: base.id,
    name: base.name,
    desc: base.desc,
    style: effectiveStyle,
    density: base.density,
    speech_detail: base.speech_detail,
    variants: effectiveVariants,
    extra_closers: base.extra_closers,
    motion_pacing: base.motion_pacing
  };
}
