// -*- coding: utf-8 -*-
/**
 * 课堂放映「播放步骤」自动编排 (reveal_steps.js)
 *
 * 目标: 让每一页内容在放映时按 1→2→3 步单击依次出现, 教师先提问/推导, 再点击揭晓。
 *
 * 设计要点:
 * 1. 不改动任何布局函数。渲染器画完一页后直接读取 slide._slideObjects 的几何坐标,
 *    按「垂直区间重叠」把同一条目卡片(底板 / 编号圆 / 正文)聚类为一个播放步骤;
 * 2. 借 PptxGenJS 的 objectName 写入 <p:cNvPr name="REVEAL_<step>_<idx>">,
 *    deck_transition.js 解包后据此注入 OpenXML 单击进入动效;
 * 3. 框架形状(标题栏/页脚)用 baseCount 精确排除; 音视频 media 形状不参与分步,
 *    避免「点击后视频才出现」以及点击命中动效层导致放不出来;
 * 4. 默认自动推断, 现有课件 JSON 无需任何修改即生效;
 *    reveal_mode:"off" 可整页关闭, reveal_steps:N 可把该页均匀合并为 N 步。
 */

const EMU_PER_INCH = 914400;

export const REVEAL_PREFIX = "REVEAL_";
export const DEFAULT_MAX_STEPS = 6;

// 封面与结束页是整页呈现, 不做分步
const FRAME_PAGE_TYPES = new Set(["cover", "end"]);

/** 解析形状名里的步骤编号: REVEAL_2_3 -> { step: 2, idx: 3 } */
export function parseRevealName(name) {
  const m = /^REVEAL_(\d+)_(\d+)$/.exec(String(name || ""));
  return m ? { step: Number(m[1]), idx: Number(m[2]) } : null;
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
 *   - pageType    {string} 页型, cover/end 跳过
 *   - mode        {string} "auto" | "off", 来自 s.reveal_mode
 *   - targetSteps {number} 来自 s.reveal_steps, 指定该页合并成几步
 *   - maxSteps    {number} 自动推断时的步数上限, 防止教师点太多次
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
  const items = [];

  for (let i = Math.max(0, baseCount); i < objects.length; i++) {
    const obj = objects[i];
    // 音视频形状不参与分步 (PptxGenJS 媒体对象带 media/mtype 字段)
    if (!obj || obj.media || obj.mtype || obj._type === "media") continue;
    const g = shapeGeom(obj);
    // 零高/零宽的是分隔线等装饰, 不单独成步
    if (g.h < 0.05 || g.w < 0.05) continue;
    items.push({ obj, ...g });
  }

  if (!items.length) return { steps: 0, shapes: 0, mode: "auto", sizes: [] };

  // 自上而下排序, 保证播放顺序与阅读顺序一致
  items.sort((a, b) => (a.y - b.y) || (a.x - b.x));

  // 同一条目卡片的底板/编号/文字垂直区间高度重叠 -> 归为同一步
  const groups = [];
  for (const it of items) {
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
    shapes: items.length,
    mode: "auto",
    sizes: buckets.map(b => b.length)
  };
}
