// -*- coding: utf-8 -*-
/**
 * 渲染入口兼容层 (presentation_renderer.js)
 *
 * 历史入口名保留给 scripts/* 与外部集成使用。真正的编排在 deck_builder.js,
 * 版式绘制在 renderers/<layout>.js, 本文件不再承载任何渲染逻辑。
 */

export { buildDeck, buildDeck as renderPresentation } from "./deck_builder.js";
