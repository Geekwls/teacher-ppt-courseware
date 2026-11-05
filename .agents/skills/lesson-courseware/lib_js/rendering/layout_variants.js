// -*- coding: utf-8 -*-
/**
 * 课件版式变体注册表与解析器 (layout_variants.js)
 *
 * 核心目标:
 * 承载“旋钮 3｜版式变体”，为核心高频页型注册 2~3 个已验证符合几何体检的变体，
 * 支持 meta 显式指定、场景预设驱动与智能自适应回落。
 */

export const REGISTERED_LAYOUT_VARIANTS = {
  objectives_card: {
    default: "list",
    variants: {
      list: {
        id: "list",
        name: "清单卡",
        desc: "经典纵向卡片列表，逐条展开，清晰明了",
        idealItems: [1, 2, 3]
      },
      grid: {
        id: "grid",
        name: "九宫/矩阵格",
        desc: "多列网格卡片矩阵，适合 3~4 个并列目标或三维目标展示",
        idealItems: [2, 3, 4]
      },
      split_lr: {
        id: "split_lr",
        name: "左右分栏",
        desc: "左侧核心主线与学习导向，右侧维度分解与达成指标",
        idealItems: [2, 3]
      }
    }
  },
  practice_list: {
    default: "single_column",
    variants: {
      single_column: {
        id: "single_column",
        name: "单列题卡",
        desc: "大字号长行题卡，适合长题干、包含复杂算式或应用题",
        idealItems: [1, 2, 3]
      },
      two_column: {
        id: "two_column",
        name: "两栏题组",
        desc: "左右两列对等题组，适合口算速算、词汇填空、正误判断",
        idealItems: [2, 3, 4, 6]
      },
      timed_challenge: {
        id: "timed_challenge",
        name: "限时挑战",
        desc: "带倒计时闯关标记与冲刺氛围底色的互动挑战卡",
        idealItems: [1, 2, 3]
      }
    }
  },
  summary_card: {
    default: "points",
    variants: {
      points: {
        id: "points",
        name: "要点卡",
        desc: "纵向要点卡片序列，核心结论一目了然",
        idealItems: [1, 2, 3]
      },
      tree: {
        id: "tree",
        name: "知识树",
        desc: "层级知识树节点，主干连通分支，强化逻辑脉络",
        idealItems: [2, 3, 4]
      },
      mindmap: {
        id: "mindmap",
        name: "思维导图",
        desc: "顶部/中心主概念辐射多个发散要点小卡",
        idealItems: [2, 3, 4]
      }
    }
  }
};

/**
 * 校验指定页型的变体是否已注册
 */
export function isValidVariant(layout, variant) {
  if (!layout || !variant) return false;
  const entry = REGISTERED_LAYOUT_VARIANTS[layout];
  if (!entry) return false;
  return Boolean(entry.variants[variant]);
}

/**
 * 获取指定页型的所有已注册变体 ID 数组
 */
export function getRegisteredVariants(layout) {
  const entry = REGISTERED_LAYOUT_VARIANTS[layout];
  return entry ? Object.keys(entry.variants) : [];
}

/**
 * 版式变体智能仲裁解析
 * @param {string} layout 页面布局名称 (如 objectives_card)
 * @param {object} options
 *   - explicitVariant: 显式指定的变体 (最高优先级)
 *   - presetVariants: 场景预设传入的默认变体映射
 *   - itemCount: 该页条目数 (用于自适应决策)
 * @returns {string} 仲裁出的变体 ID
 */
export function resolveLayoutVariant(layout, {
  explicitVariant = null,
  presetVariants = {},
  itemCount = 0
} = {}) {
  const entry = REGISTERED_LAYOUT_VARIANTS[layout];
  if (!entry) return null; // 非多变体页型无须仲裁

  // 1. 显式指定最高优先级
  if (explicitVariant && entry.variants[explicitVariant]) {
    return explicitVariant;
  }

  // 2. 场景预设传入的默认偏好
  const fromPreset = presetVariants && presetVariants[layout];
  if (fromPreset && entry.variants[fromPreset]) {
    return fromPreset;
  }

  // 3. 依据内容特征自适应智能推荐
  if (layout === "objectives_card") {
    if (itemCount >= 4) return "grid";
    return entry.default;
  }

  if (layout === "practice_list") {
    if (itemCount >= 4) return "two_column";
    return entry.default;
  }

  return entry.default;
}
