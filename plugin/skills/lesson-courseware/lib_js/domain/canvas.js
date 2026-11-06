// -*- coding: utf-8 -*-
/**
 * 画布几何常量 (domain/canvas.js) —— 唯一事实源
 *
 * 16:9 宽屏 LAYOUT_WIDE: 13.333 x 7.5 英寸。
 * 渲染器、栅格槽位、几何体检都必须从这里取, 禁止各自再写一份 magic number。
 */

export const CANVAS_W = 13.333;
export const CANVAS_H = 7.5;

/** 页眉底边 / 页脚顶边: 内容区的上下安全线 (含页框绘制留白) */
export const CONTENT_TOP = 1.35;
export const CONTENT_BOTTOM = 6.65;
