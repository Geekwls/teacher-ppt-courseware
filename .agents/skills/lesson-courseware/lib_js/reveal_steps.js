// -*- coding: utf-8 -*-
/**
 * 课堂放映「播放步骤」自动编排 (reveal_steps.js)
 *
 * 核心目标:
 * 彻底遵循教学规律 ——「先呈现题目上下文供学生思考，教师点击鼠标后再按步骤揭晓推演过程或参考答案」。
 *
 * 教学感知规则:
 * 1. 参考答案页 (answer): 4 道题的题目白底卡片、题号圆标、题干摘要文本【全部常驻显示】；
 *    仅浅绿色「★ 参考答案」卡片逐题单击淡入出现 (第1次点击出题1答案, 第2次出题2答案...)；
 * 2. 教材例题页 (example): 顶部的【例题】题干卡片【常驻显示】供学生读题；
 *    下方的列式、口算思考、规范答语按步骤单击淡入；
 * 3. 易错警示页 (misconception): 错例与错因诊断卡片【常驻显示】供学生辨析；
 *    右侧/底部的「✓ 正解」卡片点击后再淡入揭晓；
 * 4. 算理探究页 (concept): 上方推演步骤常驻或分步，底部的「★ 核心规律」卡片点击最后揭晓。
 */

const EMU_PER_INCH = 914400;

export const REVEAL_PREFIX = "REVEAL_";
export const DEFAULT_MAX_STEPS = 6;

// 封面与结束页是整页呈现, 不做分步
const FRAME_PAGE_TYPES = new Set(["cover", "end", "title_cover", "end_cover"]);

/** 解析形状名里的步骤编号: REVEAL_2_3 -> { step: 2, idx: 3 } */
export function parseRevealName(name) {
  const m = /^REVEAL_(\d+)_(\d+)$/.exec(String(name || ""));
  return m ? { step: Number(m[1]), idx: Number(m[2]) } : null;
}

/** 提取形状文本内容 */
function textOf(obj) {
  const t = obj?.text;
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    return t.map(r => String(r?.text ?? "")).join("");
  }
  return "";
}

/** 与 layout_audit.js 一致: 兼容 PptxGenJS 内部路径直接写入 EMU 的情况 */
function shapeGeom(obj) {
  const o = obj?.options || {};
  const raw = {
    x: Number(o.x) || 0,
    y: Number(o.y) || 0,
    w: Number(o.w) || 0,
    h: Number(o.h) || 0
  };
  const k = Math.max(raw.x, raw.y, raw.w, raw.h) > 100 ? EMU_PER_INCH : 1;
  return { x: raw.x / k, y: raw.y / k, w: raw.w / k, h: raw.h / k };
}

/** 把已分好的连续桶均匀合并成 target 桶(保持自上而下的顺序) */
function mergeBuckets(buckets, target) {
  const out = Array.from({ length: target }, () => []);
  buckets.forEach((bucket, i) => {
    const k = Math.min(target - 1, Math.floor(i * target / buckets.length));
    out[k].push(...bucket);
  });
  return out.filter(b => b.length);
}

/**
 * 给单页形状打步骤标记。
 *
 * @param {object} slide       PptxGenJS slide 对象
 * @param {object} opts
 *   - baseCount   {number} 页面框架已画完时的形状数, 之前的是标题/页脚, 不参与分步
 *   - pageType    {string} 页型 (answer / example / misconception / concept / practice 等)
 *   - mode        {string} "auto" | "off", 来自 s.reveal_mode
 *   - targetSteps {number} 来自 s.reveal_steps, 指定该页合并成几步
 *   - maxSteps    {number} 自动推断时的步数上限
 * @returns {{ steps:number, shapes:number, mode:string, sizes:number[] }}
 */
export function annotateRevealSteps(slide, opts = {}) {
  const {
    baseCount = 0,
    pageType = "",
    mode = "auto",
    targetSteps = 0,
    maxSteps = DEFAULT_MAX_STEPS
  } = opts;

  if (FRAME_PAGE_TYPES.has(pageType) || mode === "off") {
    return { steps: 0, shapes: 0, mode: "off", sizes: [] };
  }

  const objects = Array.isArray(slide?._slideObjects) ? slide._slideObjects : [];
  const allContentItems = [];

  for (let i = Math.max(0, baseCount); i < objects.length; i++) {
    const obj = objects[i];
    // 音视频形状不参与分步 (PptxGenJS 媒体对象带 media/mtype 字段)
    if (!obj || obj.media || obj.mtype || obj._type === "media") continue;
    const g = shapeGeom(obj);
    // 零高/零宽的是分隔线等装饰, 不单独成步
    if (g.h < 0.05 || g.w < 0.05) continue;
    allContentItems.push({ obj, ...g, text: textOf(obj) });
  }

  if (!allContentItems.length) return { steps: 0, shapes: 0, mode: "auto", sizes: [] };

  // =========================================================================
  // 教学感知策略 0 (最高优先级): 显式 Timeline 驱动 —— 契约中声明了精确时序
  // =========================================================================
  if (Array.isArray(opts.timeline) && opts.timeline.length > 0) {
    const revealSteps = opts.timeline.filter(t => t.step >= 1 && (t.action === "reveal" || !t.action));
    if (revealSteps.length === 0) {
      // 全页元素均为 step 0 (常驻显示), 无分步动作
      return { steps: 0, shapes: 0, mode: "timeline", sizes: [] };
    }
    if (revealSteps.length > 0) {
      const byStep = new Map();
      revealSteps.forEach(t => {
        if (!byStep.has(t.step)) byStep.set(t.step, []);
        byStep.get(t.step).push(t.target);
      });

      const sortedSteps = [...byStep.keys()].sort((a, b) => a - b);
      let markedCount = 0;
      const stepSizes = [];

      sortedSteps.forEach((stepNum, stepIdx) => {
        const targets = byStep.get(stepNum);
        let subIdx = 0;

        allContentItems.forEach(it => {
          const objName = String(it.obj?.options?.objectName || "");
          const customId = String(it.obj?.options?.customTargetId || "");
          const text = it.text;

          const isMatch = targets.some(rawTgt => {
            // 契约要求 target 为元素 id 字符串; 这里做一次防御性归一, 避免非法输入直接抛 TypeError
            const tgt = String(rawTgt ?? "");
            if (!tgt) return false;
            if (objName && (objName === tgt || objName.startsWith(tgt + "_") || objName.startsWith(tgt + "."))) return true;
            if (customId && (customId === tgt || customId.startsWith(tgt + "_") || customId.startsWith(tgt + "."))) return true;
            if (tgt.endsWith(".explanation") && (text.includes("★ 参考答案") || text.includes("参考答案"))) {
              const qNumMatch = tgt.match(/ans_item_(\d+)/);
              if (qNumMatch && text.includes(`题 ${qNumMatch[1]}`)) return true;
              return true;
            }
            if (tgt === "banner_conclusion" && (text.includes("★ 核心规律") || text.includes("★ 规律发现") || text.includes("★核心规律"))) return true;
            if (tgt === "card_correct" && (text.includes("✓ 正解") || text.includes("✓正解"))) return true;
            if (tgt === "card_cause" && (text.includes("【病因诊断】") || text.includes("病因诊断"))) return true;
            if (tgt === "card_reasoning" && (text.includes("①") || text.includes("②") || text.includes("③") || text.includes("想："))) return true;
            if (tgt === "card_ex_steps" && (text.includes("20 × 3") || text.includes("200 × 3") || text.includes("2000 × 3"))) return true;
            if (tgt === "ans_ex_feedback" && (text.includes("答：") || text.includes("答:"))) return true;
            if (tgt === "card_obj_list" && (text.includes("1.") || text.includes("2.") || text.includes("3."))) return true;
            if (tgt === "card_sum_list" && (text.includes("一看") || text.includes("二算") || text.includes("三添"))) return true;
            if (tgt === "eq_warmup" && (text.includes("20 + 20") || text.includes("20 × 3"))) return true;
            return false;
          });

          if (isMatch) {
            it.obj.options = it.obj.options || {};
            it.obj.options.objectName = `${REVEAL_PREFIX}${stepIdx + 1}_${subIdx++}`;
            markedCount++;
          }
        });
        stepSizes.push(subIdx);
      });

      if (markedCount > 0) {
        return {
          steps: sortedSteps.length,
          shapes: markedCount,
          mode: "timeline",
          sizes: stepSizes
        };
      }
    }
  }

  // =========================================================================
  // 教学感知策略 1: 参考答案页 (answer) —— 题目常驻，仅答案逐题点击揭晓
  // =========================================================================
  if (pageType === "answer") {
    // 过滤出带「参考答案」的形状
    const answerItems = allContentItems.filter(it => it.text.includes("参考答案"));
    if (answerItems.length > 0) {
      answerItems.sort((a, b) => a.y - b.y);
      answerItems.forEach((it, idx) => {
        it.obj.options = it.obj.options || {};
        it.obj.options.objectName = `${REVEAL_PREFIX}${idx + 1}_0`;
      });
      return {
        steps: answerItems.length,
        shapes: answerItems.length,
        mode: "auto",
        sizes: answerItems.map(() => 1)
      };
    }
  }

  // =========================================================================
  // 教学感知策略 2: 例题页 (example) —— 顶部题干常驻，下方解答步骤点击逐个展示
  // =========================================================================
  let candidateItems = allContentItems;
  if (pageType === "example") {
    // 排除顶部题干区卡片 (y < 2.45 且包含【例题】或不包含解题关键词)，保持常驻可见
    candidateItems = allContentItems.filter(it => {
      const isProblemCard = it.text.includes("【例题】") ||
        (it.y < 2.45 && !it.text.includes("横式") && !it.text.includes("思考") && !it.text.includes("答语") && !it.text.includes("答："));
      return !isProblemCard;
    });
  }

  // =========================================================================
  // 教学感知策略 3: 易错警示页 (misconception) —— 错例常驻，错因与正解点击揭晓
  // =========================================================================
  if (pageType === "misconception") {
    // 错例卡片常驻可见，让学生先观察思考
    candidateItems = allContentItems.filter(it => {
      const isWrongCaseCard = it.text.includes("错例") || (it.y < 2.3 && !it.text.includes("错因") && !it.text.includes("正解"));
      return !isWrongCaseCard;
    });
  }

  if (!candidateItems.length) return { steps: 0, shapes: 0, mode: "auto", sizes: [] };

  // 自上而下排序, 保证播放顺序与阅读顺序一致
  candidateItems.sort((a, b) => (a.y - b.y) || (a.x - b.x));

  // 垂直区间高度重叠 (>= 50%) -> 聚类为同一步
  const groups = [];
  for (const it of candidateItems) {
    const last = groups[groups.length - 1];
    if (last) {
      const overlap = Math.min(it.y + it.h, last.bottom) - Math.max(it.y, last.top);
      if (overlap > 0 && overlap >= 0.5 * it.h) {
        last.items.push(it);
        last.top = Math.min(last.top, it.y);
        last.bottom = Math.max(last.bottom, it.y + it.h);
        continue;
      }
    }
    groups.push({ top: it.y, bottom: it.y + it.h, items: [it] });
  }

  let buckets = groups.map(g => g.items);
  const wanted = Number(targetSteps) > 0
    ? Math.min(Number(targetSteps), buckets.length)
    : Math.min(Number(maxSteps) || DEFAULT_MAX_STEPS, buckets.length);
  if (wanted > 0 && wanted < buckets.length) buckets = mergeBuckets(buckets, wanted);

  buckets.forEach((bucket, gi) => {
    bucket.forEach((it, ii) => {
      it.obj.options = it.obj.options || {};
      it.obj.options.objectName = `${REVEAL_PREFIX}${gi + 1}_${ii}`;
    });
  });

  return {
    steps: buckets.length,
    shapes: candidateItems.length,
    mode: "auto",
    sizes: buckets.map(b => b.length)
  };
}
