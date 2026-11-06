// -*- coding: utf-8 -*-
/**
 * 算理动画预生成 (animation_prep.js)
 *
 * 把 lib_js/dynamic_media.js 动画子引擎接入渲染主链路:
 * 渲染画页之前扫描课件 JSON 中的 animation 图元, 现场合成算理演示视频
 * (SVG 逐帧 + FFmpeg), 并把产物路径注入 figure.path, 之后仍由
 * figures.js 的 renderMedia 完成原生视频嵌入 —— 渲染层无需感知差异。
 *
 * 工程底线 (遵循 references/dynamic-media-architecture.md):
 * 1. 数学逻辑错误一票否决: 参数校验失败时不渲染任何动画内容;
 * 2. 声明式参数执行: 只透传结构化参数, 绝不执行任何生成代码;
 * 3. 幂等缓存: 相同动画参数只合成一次 (按参数指纹命名), 重复渲染秒级命中;
 * 4. 优雅降级: FFmpeg 缺失/合成失败时回落为静态播放卡片, 并在审计中留痕。
 *
 * 降级语义:
 * - 参数/数学错误: --strict 下拒绝交付 (退出码 1), 非 strict 降级为封面卡;
 * - 环境故障 (FFmpeg 缺失、编码失败): 一律降级为封面卡 + 审计 warning。
 */

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execFileSync } from "child_process";
import {
  validateAnimationParams,
  generateAnimationVideo
} from "./dynamic_media.js";

/** 检测 FFmpeg 是否可用 (带缓存, 整个渲染进程只探测一次) */
let ffmpegAvailable = null;
function hasFFmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 10_000 });
    ffmpegAvailable = true;
  } catch (_) {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

/** 动画参数指纹: 类型 + 全部画面相关字段的稳定哈希, 用作缓存文件名 */
const ANIMATION_CACHE_VERSION = "v1";

function animationFingerprint(fig) {
  const payload = JSON.stringify({
    cache_version: ANIMATION_CACHE_VERSION,
    type: fig.animation_type,
    parameters: fig.parameters || {},
    title: fig.title || "",
    conclusion: fig.conclusion || "",
    duration_sec: fig.duration_sec || 0
  });
  return crypto.createHash("sha1").update(payload).digest("hex").slice(0, 10);
}

function isAnimationFigure(fig) {
  return (
    fig &&
    typeof fig === "object" &&
    fig.kind === "animation" &&
    fig.animation_type &&
    fig.animation_type !== ""
  );
}

/**
 * 预处理整套课件的动画图元。
 * @param {Array<{slide:number, fig:object}>} entries  动画图元条目 (fig 就地修改: 合成的 path 会写回)
 * @param {object} opts      { outdir: 渲染输出目录, strict: 严格模式 }
 * @returns {object} 动画处理报告, 供审计回执与控制台日志使用
 */
export async function prepareFigureAnimations(entries, { outdir = "output", strict = false } = {}) {
  const report = {
    total: 0,
    generated: 0,
    cached: 0,
    reusedExisting: 0,
    fallback: 0,
    mathErrors: 0,
    items: []
  };

  const animFigs = (entries || []).filter(e => isAnimationFigure(e?.fig));
  report.total = animFigs.length;
  if (animFigs.length === 0) return report;

  const outDir = path.join(outdir, "media");
  const ffmpegOk = hasFFmpeg();
  if (!ffmpegOk) {
    console.warn("[animation_prep] 未检测到 FFmpeg, 算理动画将降级为静态播放卡片。");
  }

  for (const { slide, fig } of animFigs) {
    const entry = { slide, type: fig.animation_type, action: "", outPath: "", error: "" };

    // 1) 已显式提供可用视频路径: 直接复用, 零成本
    if (fig.path && fs.existsSync(fig.path)) {
      entry.action = "reused-existing";
      entry.outPath = fig.path;
      report.reusedExisting++;
      report.items.push(entry);
      continue;
    }

    // 2) 环境无 FFmpeg: 降级 (非内容错误, 不区分 strict)
    if (!ffmpegOk) {
      entry.action = "fallback";
      entry.error = "FFmpeg 不可用";
      fig.path = "";
      report.fallback++;
      report.items.push(entry);
      continue;
    }

    // 3) 数学门禁前置: 参数/算理不合法绝不渲染 (架构底线 1)
    try {
      validateAnimationParams(fig.animation_type, fig.parameters || {});
    } catch (err) {
      report.mathErrors++;
      if (strict) {
        entry.action = "math-error";
        entry.error = err.message;
        report.items.push(entry);
        // strict 模式下数学错误一票否决, 由调用方统一退出
        report.items.hardFailure = entry;
        break;
      }
      entry.action = "fallback";
      entry.error = err.message;
      fig.path = "";
      report.fallback++;
      report.items.push(entry);
      console.warn(`[animation_prep] P${slide} 动画参数未过数学门禁, 已降级: ${err.message}`);
      continue;
    }

    // 4) 幂等缓存命中: 指纹文件已存在则直接复用
    const outPath = path.join(outDir, `anim_${fig.animation_type}_${animationFingerprint(fig)}.mp4`);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      fig.path = outPath;
      entry.action = "cached";
      entry.outPath = outPath;
      report.cached++;
      report.items.push(entry);
      console.log(`[animation_prep] P${slide} 命中动画缓存: ${path.basename(outPath)}`);
      continue;
    }

    // 5) 现场合成
    try {
      fs.mkdirSync(outDir, { recursive: true });
      const r = await generateAnimationVideo(
        {
          animation_type: fig.animation_type,
          parameters: fig.parameters || {},
          title: fig.title,
          conclusion: fig.conclusion,
          duration_sec: fig.duration_sec,
          filename: path.basename(outPath, ".mp4")
        },
        outDir
      );
      fig.path = r.outPath;
      entry.action = "generated";
      entry.outPath = r.outPath;
      report.generated++;
      report.items.push(entry);
      console.log(`[animation_prep] P${slide} 已合成算理动画: ${path.basename(r.outPath)} (${r.durationSec}s / ${(r.fileSize / 1024).toFixed(0)}KB)`);
    } catch (err) {
      entry.action = "fallback";
      entry.error = err.message;
      fig.path = "";
      report.fallback++;
      report.items.push(entry);
      console.warn(`[animation_prep] P${slide} 动画合成失败, 降级为播放卡片: ${err.message}`);
    }
  }

  return report;
}

/**
 * strict 模式的最终裁决: 数学错误存在即拒绝交付。
 * @returns {object|null} 导致拒绝交付的动画条目, 无则 null
 */
export function strictHardFailure(animReport) {
  if (!animReport) return null;
  return animReport.items.find(it => it.action === "math-error") || null;
}
