// -*- coding: utf-8 -*-
/**
 * 动态媒体子引擎 (dynamic_media.js) - 纯 Node.js + SVG 帧序列 + FFmpeg
 *
 * 核心设计原则 (遵循架构规范 references/dynamic-media-architecture.md):
 * 1. 数学过程前置强校验：数学逻辑错误一票否决，绝不渲染错误内容；
 * 2. 声明式参数执行：严禁 AI 生成并执行任意脚本代码；
 * 3. 纯 Node.js / SVG 矢量帧驱动：毫秒级本地确定性渲染，零外部 API 依赖；
 * 4. 产出标准 16:9 1080P/720P H.264 MP4 短视频。
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";

/**
 * 1. 数学过程参数强校验门禁
 */
export function validateAnimationParams(type, params) {
  if (type === "number_line_jump") {
    const { start = 0, jumps = [], target } = params;
    if (!Array.isArray(jumps) || jumps.length === 0) {
      throw new Error(`[dynamic_media] number_line_jump 必须提供非空的 jumps 数组`);
    }
    const sumJumps = jumps.reduce((acc, v) => acc + Number(v), 0);
    const expectedTarget = Number(start) + sumJumps;
    if (target !== undefined && Number(target) !== expectedTarget) {
      throw new Error(`[dynamic_media] 数学算理校验失败: 起点(${start}) + 跳跃总和(${sumJumps}) != 目标点(${target})`);
    }
    return {
      start: Number(start),
      jumps: jumps.map(Number),
      target: expectedTarget,
      step: Number(params.step || 10)
    };
  }

  if (type === "vertical_calc_flow") {
    const { operand_a, operand_b, operator = "×", result, carries = {} } = params;
    const a = Number(operand_a);
    const b = Number(operand_b);
    if (isNaN(a) || isNaN(b)) {
      throw new Error(`[dynamic_media] vertical_calc_flow 缺少有效因数: operand_a=${operand_a}, operand_b=${operand_b}`);
    }
    let expectedResult;
    if (operator === "×" || operator === "*") {
      expectedResult = a * b;
    } else if (operator === "+") {
      expectedResult = a + b;
    } else {
      throw new Error(`[dynamic_media] 尚不支持的竖式操作符: '${operator}'`);
    }

    if (result !== undefined && Number(result) !== expectedResult) {
      throw new Error(`[dynamic_media] 数学算理校验失败: ${a} ${operator} ${b} != ${result} (预期为 ${expectedResult})`);
    }

    return {
      operand_a: a,
      operand_b: b,
      operator: operator === "*" ? "×" : operator,
      result: expectedResult,
      carries: carries || {}
    };
  }

  throw new Error(`[dynamic_media] 未知动画类型: '${type}'`);
}

/**
 * 2. 数轴跳跃逐帧 SVG 绘制
 */
function renderNumberLineSVGFrame({
  width = 1280,
  height = 720,
  start = 0,
  end = 60,
  step = 10,
  jumps = [20, 20, 20],
  progress = 0,
  title = "【算理探究】数轴跳跃过程推演",
  conclusion = "20 × 3 = 60"
}) {
  const padX = 140;
  const lineY = 460;
  const trackW = width - padX * 2;
  const totalRange = Math.max(1, end - start);
  const nTicks = Math.floor(totalRange / step);

  // 刻度位置映射
  function valToX(v) {
    return padX + ((v - start) / totalRange) * trackW;
  }

  // 计算跳跃阶段 (总跳跃进度映射到各跳)
  const nJumps = jumps.length;
  // progress: 0.0 ~ 0.1 准备 -> 0.1 ~ 0.85 跳跃过程 -> 0.85 ~ 1.0 结论定格
  let jumpPhaseProgress = 0;
  if (progress > 0.1 && progress <= 0.85) {
    jumpPhaseProgress = (progress - 0.1) / 0.75;
  } else if (progress > 0.85) {
    jumpPhaseProgress = 1.0;
  }

  const currentJumpFloat = jumpPhaseProgress * nJumps;
  const currentJumpIndex = Math.min(nJumps - 1, Math.floor(currentJumpFloat));
  const currentJumpStepProgress = Math.min(1.0, currentJumpFloat - currentJumpIndex);

  // 累计已完成与正在进行的跳跃
  let accVal = start;
  const jumpArcs = [];
  let ballX = valToX(start);
  let ballY = lineY;

  for (let j = 0; j < nJumps; j++) {
    const jumpDist = jumps[j];
    const fromVal = accVal;
    const toVal = accVal + jumpDist;
    const x1 = valToX(fromVal);
    const x2 = valToX(toVal);
    const midX = (x1 + x2) / 2;
    const arcHeight = Math.min(180, Math.max(90, (x2 - x1) * 0.45));
    const topY = lineY - arcHeight;

    if (j < currentJumpIndex || (j === currentJumpIndex && jumpPhaseProgress === 1.0)) {
      // 已完全完成的跳
      jumpArcs.push({
        x1, x2, midX, topY,
        path: `M ${x1} ${lineY} Q ${midX} ${topY - 20} ${x2} ${lineY}`,
        label: `+${jumpDist}`,
        stepNum: j + 1,
        completed: true
      });
      accVal = toVal;
      ballX = x2;
      ballY = lineY;
    } else if (j === currentJumpIndex && jumpPhaseProgress > 0) {
      // 正在进行中的跳 (贝塞尔部分采样)
      const t = currentJumpStepProgress;
      // 二次贝塞尔曲线插值: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
      const ctrlY = topY - 20;
      const curX = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * midX + t * t * x2;
      const curY = (1 - t) * (1 - t) * lineY + 2 * (1 - t) * t * ctrlY + t * t * lineY;

      jumpArcs.push({
        x1, x2, midX, topY,
        path: `M ${x1} ${lineY} Q ${x1 + (midX - x1) * t} ${lineY + (ctrlY - lineY) * t} ${curX} ${curY}`,
        label: `+${jumpDist}`,
        stepNum: j + 1,
        completed: false,
        showLabel: t > 0.4
      });
      ballX = curX;
      ballY = curY;
      accVal = toVal;
      break;
    }
  }

  // 1. 刻度小竖线与数字
  const ticksSvg = [];
  for (let i = 0; i <= nTicks; i++) {
    const v = start + i * step;
    const tx = valToX(v);
    const isMajor = v % (step * 2) === 0 || v === start || v === end;
    ticksSvg.push(`
      <line x1="${tx}" y1="${lineY - (isMajor ? 14 : 9)}" x2="${tx}" y2="${lineY + (isMajor ? 14 : 9)}" stroke="#334155" stroke-width="${isMajor ? 3 : 2}" stroke-linecap="round"/>
      <text x="${tx}" y="${lineY + 44}" font-size="${isMajor ? 24 : 20}" font-weight="${isMajor ? 'bold' : 'normal'}" fill="${isMajor ? '#0F172A' : '#64748B'}" text-anchor="middle" font-family="'Microsoft YaHei', sans-serif">${v}</text>
    `);
  }

  // 2. 跳跃弧线与步长徽章
  const arcsSvg = jumpArcs.map(arc => `
    <path d="${arc.path}" fill="none" stroke="#F59E0B" stroke-width="4.5" stroke-linecap="round"/>
    ${(arc.completed || arc.showLabel) ? `
      <g transform="translate(${arc.midX}, ${arc.topY - 32})">
        <rect x="-42" y="-18" width="84" height="36" rx="18" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2"/>
        <text x="0" y="7" font-size="20" font-weight="bold" fill="#B45309" text-anchor="middle" font-family="'Microsoft YaHei', sans-serif">${arc.label}</text>
      </g>
    ` : ''}
  `).join("\n");

  // 3. 终点高亮与结论弹窗
  const isFinished = progress > 0.85;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#0F172A" flood-opacity="0.12"/>
    </filter>
    <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F8FAFC"/>
    </linearGradient>
  </defs>

  <!-- 全局背景 -->
  <rect width="${width}" height="${height}" fill="#F0F9FF"/>

  <!-- 主演示卡片底板 -->
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" rx="24" fill="url(#cardGrad)" stroke="#CBD5E1" stroke-width="2" filter="url(#shadow)"/>

  <!-- 顶部标题栏 -->
  <g transform="translate(80, 80)">
    <rect x="0" y="0" width="10" height="38" rx="5" fill="#2563EB"/>
    <text x="24" y="28" font-size="30" font-weight="bold" fill="#1E3A8A" font-family="'Microsoft YaHei', sans-serif">${title}</text>
    <rect x="${width - 340}" y="2" width="180" height="34" rx="17" fill="#EFF6FF" stroke="#3B82F6" stroke-width="1.5"/>
    <text x="${width - 250}" y="25" font-size="16" font-weight="bold" fill="#1D4ED8" text-anchor="middle" font-family="'Microsoft YaHei', sans-serif">★ 3次连续跳跃推演</text>
  </g>

  <!-- 数轴主横线 (带箭头) -->
  <line x1="${padX - 30}" y1="${lineY}" x2="${padX + trackW + 30}" y2="${lineY}" stroke="#1E293B" stroke-width="4.5" stroke-linecap="round"/>
  <polygon points="${padX + trackW + 42},${lineY} ${padX + trackW + 24},${lineY - 9} ${padX + trackW + 24},${lineY + 9}" fill="#1E293B"/>

  <!-- 刻度与数字 -->
  ${ticksSvg.join("\n")}

  <!-- 跳跃弧线 -->
  ${arcsSvg}

  <!-- 动态跳跃光标球 (带光晕) -->
  <g transform="translate(${ballX}, ${ballY})">
    <circle cx="0" cy="0" r="22" fill="#FBBF24" opacity="0.4"/>
    <circle cx="0" cy="0" r="14" fill="#F59E0B" stroke="#FFFFFF" stroke-width="3"/>
  </g>

  <!-- 最终结论展示卡片 (动画末尾平滑呈现) -->
  ${isFinished ? `
    <g transform="translate(${width / 2}, 570)">
      <rect x="-380" y="-36" width="760" height="72" rx="36" fill="#EFF6FF" stroke="#2563EB" stroke-width="2.5" filter="url(#shadow)"/>
      <text x="0" y="12" font-size="28" font-weight="bold" fill="#1E3A8A" text-anchor="middle" font-family="'Microsoft YaHei', sans-serif">
        ★ 规律提炼：连续跳 3 次 20，共跳 60 格！即 ${conclusion}
      </text>
    </g>
  ` : ''}
</svg>
  `.trim();
}

/**
 * 3. 确定性渲染并输出为标准 MP4 视频
 */
export async function exportNumberLineJumpVideo({
  start = 0,
  step = 10,
  jumps = [20, 20, 20],
  target = 60,
  title = "【算理探究】数轴跳跃过程推演",
  conclusion = "20 × 3 = 60",
  outPath = "output/media/number_line_jump.mp4",
  durationSec = 4.5,
  fps = 30
}) {
  // 1. 前置数学校验
  const validated = validateAnimationParams("number_line_jump", { start, step, jumps, target });

  // 2. 准备输出目录与临时帧目录
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const tmpFramesDir = path.join(os.tmpdir(), `deck_anim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(tmpFramesDir, { recursive: true });

  const totalFrames = Math.floor(durationSec * fps);

  try {
    // 3. 逐帧输出 SVG 图像
    for (let f = 0; f <= totalFrames; f++) {
      const progress = f / totalFrames;
      const svg = renderNumberLineSVGFrame({
        width: 1280,
        height: 720,
        start: validated.start,
        end: validated.target,
        step: validated.step,
        jumps: validated.jumps,
        progress: progress,
        title: title,
        conclusion: conclusion
      });
      const frameFilename = `frame_${String(f).padStart(4, "0")}.svg`;
      fs.writeFileSync(path.join(tmpFramesDir, frameFilename), svg, "utf-8");
    }

    // 4. 调用 FFmpeg 编码为 1080P/720P H.264 MP4
    // 使用参数数组而非拼接 shell 字符串: 路径含空格/引号/& 时不会被解释执行
    const ffmpegArgs = [
      "-y",
      "-framerate", String(fps),
      "-i", path.join(tmpFramesDir, "frame_%04d.svg"),
      "-c:v", "libx264",
      "-profile:v", "high",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      outPath
    ];
    try {
      execFileSync("ffmpeg", ffmpegArgs, { stdio: "pipe" });
    } catch (ffErr) {
      throw new Error(`[dynamic_media] FFmpeg 视频编码失败 (请检查系统是否已安装 ffmpeg 并支持 librsvg): ${ffErr.message}`);
    }

    return {
      status: "ok",
      outPath: path.resolve(outPath),
      durationSec,
      totalFrames,
      fileSize: fs.statSync(outPath).size
    };
  } finally {
    // 5. 安全清理临时帧文件
    try {
      fs.rmSync(tmpFramesDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

/**
 * 3. 进位竖式推演逐帧 SVG 绘制
 */
function renderVerticalCalcSVGFrame({
  width = 1280,
  height = 720,
  operand_a = 28,
  operand_b = 3,
  operator = "×",
  result = 84,
  carries = { 1: 2 },
  progress = 0,
  title = "【算理探究】多位数乘一位数笔算过程推演",
  conclusion = "28 × 3 = 84 (满二十向十位进2)"
}) {
  const aStr = String(operand_a);
  const onesA = aStr[aStr.length - 1] || "0";
  const tensA = aStr.length > 1 ? aStr[aStr.length - 2] : "";
  const onesB = String(operand_b);

  const resStr = String(result);
  const onesRes = resStr[resStr.length - 1] || "";
  const tensRes = resStr.length > 1 ? resStr[resStr.length - 2] : "";
  const hundredsRes = resStr.length > 2 ? resStr.slice(0, resStr.length - 2) : "";

  const carryVal = carries["1"] || carries[1] || "";

  // 动效各阶段进度
  const pIntro = Math.min(1.0, progress / 0.18);
  const pStep1 = progress >= 0.18 ? Math.min(1.0, (progress - 0.18) / 0.32) : 0;
  const pStep2 = progress >= 0.50 ? Math.min(1.0, (progress - 0.50) / 0.32) : 0;
  const pFinal = progress >= 0.82 ? Math.min(1.0, (progress - 0.82) / 0.18) : 0;

  // 算式横线动画长度 (160 到 520, 总长 360)
  const lineEndX = 160 + 360 * Math.min(1.0, pIntro * 1.5);

  // 进位小红字飞入插值
  const carryOpacity = pStep1 > 0.4 ? Math.min(1.0, (pStep1 - 0.4) / 0.6) : 0;
  const carryY = 330 - carryOpacity * 15;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1E3A8A"/>
      <stop offset="100%" stop-color="#2563EB"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0F172A" flood-opacity="0.12"/>
    </filter>
  </defs>

  <!-- 整体背景 -->
  <rect width="${width}" height="${height}" fill="#F8FAFC"/>

  <!-- 顶部标题栏 -->
  <rect x="0" y="0" width="${width}" height="84" fill="url(#headerGrad)"/>
  <text x="60" y="52" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF">${title}</text>
  <rect x="1050" y="24" width="170" height="36" rx="18" fill="rgba(255,255,255,0.2)"/>
  <text x="1135" y="48" font-family="sans-serif" font-size="14" fill="#FFFFFF" text-anchor="middle">小学人教版数学三年级</text>

  <!-- 左栏: 竖式卡片 -->
  <g transform="translate(80, 110)" filter="url(#shadow)">
    <rect width="520" height="460" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
    
    <!-- 数位标头 -->
    <g transform="translate(0, 45)">
      <rect x="230" y="0" width="70" height="28" rx="14" fill="#EFF6FF"/>
      <text x="265" y="19" font-family="sans-serif" font-size="14" font-weight="bold" fill="#3B82F6" text-anchor="middle">百位</text>
      <rect x="325" y="0" width="70" height="28" rx="14" fill="#EFF6FF"/>
      <text x="360" y="19" font-family="sans-serif" font-size="14" font-weight="bold" fill="#3B82F6" text-anchor="middle">十位</text>
      <rect x="420" y="0" width="70" height="28" rx="14" fill="#EFF6FF"/>
      <text x="455" y="19" font-family="sans-serif" font-size="14" font-weight="bold" fill="#3B82F6" text-anchor="middle">个位</text>
    </g>

    <!-- 阶段1高亮背景 (个位相乘) -->
    ${pStep1 > 0 && pStep2 === 0 ? `
      <circle cx="455" cy="140" r="32" fill="#FEF08A" opacity="${0.45 * pStep1}"/>
      <circle cx="455" cy="225" r="32" fill="#FEF08A" opacity="${0.45 * pStep1}"/>
    ` : ""}

    <!-- 阶段2高亮背景 (十位相乘) -->
    ${pStep2 > 0 && pFinal === 0 ? `
      <circle cx="360" cy="140" r="32" fill="#BAE6FD" opacity="${0.45 * pStep2}"/>
      <circle cx="455" cy="225" r="32" fill="#BAE6FD" opacity="${0.45 * pStep2}"/>
      ${carryVal ? `<circle cx="380" cy="200" r="18" fill="#FCA5A5" opacity="${0.45 * pStep2}"/>` : ""}
    ` : ""}

    <!-- 第一因数 (operand_a) -->
    <text x="360" y="155" font-family="sans-serif" font-size="56" font-weight="bold" fill="#1E293B" text-anchor="middle">${tensA}</text>
    <text x="455" y="155" font-family="sans-serif" font-size="56" font-weight="bold" fill="#1E293B" text-anchor="middle">${onesA}</text>

    <!-- 第二因数 (operand_b) -->
    <text x="210" y="240" font-family="sans-serif" font-size="48" font-weight="bold" fill="#2563EB" text-anchor="middle">${operator}</text>
    <text x="455" y="240" font-family="sans-serif" font-size="56" font-weight="bold" fill="#1E293B" text-anchor="middle">${onesB}</text>

    <!-- 进位小红字 -->
    ${carryVal && carryOpacity > 0 ? `
      <text x="382" y="${carryY}" font-family="sans-serif" font-size="26" font-weight="bold" fill="#DC2626" text-anchor="middle" opacity="${carryOpacity}">${carryVal}</text>
    ` : ""}

    <!-- 算式底横线 -->
    <line x1="160" y1="275" x2="${lineEndX}" y2="275" stroke="#334155" stroke-width="4" stroke-linecap="round"/>

    <!-- 积结果行 -->
    <!-- 个位得数 -->
    ${pStep1 > 0 ? `
      <text x="455" y="360" font-family="sans-serif" font-size="56" font-weight="bold" fill="${pFinal > 0 ? "#059669" : "#1E293B"}" text-anchor="middle" opacity="${pStep1}">${onesRes}</text>
    ` : ""}

    <!-- 十位得数 -->
    ${pStep2 > 0 ? `
      <text x="360" y="360" font-family="sans-serif" font-size="56" font-weight="bold" fill="${pFinal > 0 ? "#059669" : "#1E293B"}" text-anchor="middle" opacity="${pStep2}">${tensRes}</text>
    ` : ""}

    <!-- 百位得数 (若有) -->
    ${hundredsRes && pStep2 > 0 ? `
      <text x="265" y="360" font-family="sans-serif" font-size="56" font-weight="bold" fill="${pFinal > 0 ? "#059669" : "#1E293B"}" text-anchor="middle" opacity="${pStep2}">${hundredsRes}</text>
    ` : ""}

    <!-- 底部状态药丸 -->
    <rect x="140" y="405" width="240" height="32" rx="16" fill="${pFinal > 0 ? "#DCFCE7" : "#F1F5F9"}"/>
    <text x="260" y="426" font-family="sans-serif" font-size="14" font-weight="bold" fill="${pFinal > 0 ? "#15803D" : "#64748B"}" text-anchor="middle">
      ${pFinal > 0 ? "✓ 竖式计算完成" : (pStep2 > 0 ? "▶ 正在计算十位..." : (pStep1 > 0 ? "▶ 正在计算个位..." : "准备就绪"))}
    </text>
  </g>

  <!-- 右栏: 算理推演看板 -->
  <g transform="translate(630, 110)" filter="url(#shadow)">
    <rect width="570" height="460" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>

    <!-- 步骤 1: 个位相乘 -->
    <g transform="translate(30, 35)">
      <rect width="510" height="110" rx="12" fill="${pStep1 > 0 ? "#FEF9C3" : "#F8FAFC"}" stroke="${pStep1 > 0 ? "#EAB308" : "#E2E8F0"}" stroke-width="${pStep1 > 0 ? 2 : 1}"/>
      <text x="24" y="38" font-family="sans-serif" font-size="18" font-weight="bold" fill="#854D0E">步骤 ①：从个位乘起</text>
      <text x="24" y="70" font-family="sans-serif" font-size="16" fill="#1E293B">计算 ${onesA} × ${onesB} = ${Number(onesA) * Number(onesB)}</text>
      <text x="24" y="96" font-family="sans-serif" font-size="15" fill="#B45309">个位写 ${onesRes}${carryVal ? `，满几十向十位进 ${carryVal}（标小红字）` : ""}</text>
    </g>

    <!-- 步骤 2: 十位相乘并加进位 -->
    <g transform="translate(30, 170)">
      <rect width="510" height="120" rx="12" fill="${pStep2 > 0 ? "#E0F2FE" : "#F8FAFC"}" stroke="${pStep2 > 0 ? "#0284C7" : "#E2E8F0"}" stroke-width="${pStep2 > 0 ? 2 : 1}"/>
      <text x="24" y="38" font-family="sans-serif" font-size="18" font-weight="bold" fill="#0369A1">步骤 ②：再乘十位</text>
      <text x="24" y="70" font-family="sans-serif" font-size="16" fill="#1E293B">计算 ${tensA} × ${onesB} = ${Number(tensA) * Number(onesB)}${carryVal ? `，加上进位的 ${carryVal} 得 ${tensRes}` : ""}</text>
      <text x="24" y="98" font-family="sans-serif" font-size="15" fill="#0284C7">十位写 ${tensRes}${hundredsRes ? `，百位写 ${hundredsRes}` : ""}</text>
    </g>

    <!-- 步骤 3: 核心算理结论卡片 -->
    <g transform="translate(30, 315)">
      <rect width="510" height="110" rx="12" fill="${pFinal > 0 ? "#DCFCE7" : "#F1F5F9"}" stroke="${pFinal > 0 ? "#22C55E" : "#E2E8F0"}" stroke-width="${pFinal > 0 ? 2 : 1}"/>
      <text x="24" y="38" font-family="sans-serif" font-size="18" font-weight="bold" fill="${pFinal > 0 ? "#15803D" : "#64748B"}">★ 笔算核心法则</text>
      <text x="24" y="75" font-family="sans-serif" font-size="16" font-weight="bold" fill="${pFinal > 0 ? "#166534" : "#475569"}">从个位乘起，哪一位相乘满几十，就向前一位进几！</text>
    </g>
  </g>

  <!-- 底部关键算式横幅 -->
  <g transform="translate(80, 595)">
    <rect width="1120" height="85" rx="14" fill="#EFF6FF" stroke="#3B82F6" stroke-width="2"/>
    <text x="560" y="52" font-family="sans-serif" font-size="28" font-weight="bold" fill="#1D4ED8" text-anchor="middle">★ 关键结论：${conclusion}</text>
  </g>
</svg>
  `.trim();
}

/**
 * 导出进位竖式推演 MP4 视频
 */
export async function exportVerticalCalcVideo({
  operand_a = 28,
  operand_b = 3,
  operator = "×",
  result = 84,
  carries = { 1: 2 },
  title = "【算理探究】多位数乘一位数笔算过程推演",
  conclusion = "28 × 3 = 84 (满二十向十位进2)",
  outPath = "output/media/vertical_calc_flow.mp4",
  durationSec = 4.5,
  fps = 30
}) {
  const validated = validateAnimationParams("vertical_calc_flow", {
    operand_a,
    operand_b,
    operator,
    result,
    carries
  });

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const tmpFramesDir = path.join(os.tmpdir(), `vertical_calc_frames_${Date.now()}`);
  fs.mkdirSync(tmpFramesDir, { recursive: true });

  const totalFrames = Math.floor(durationSec * fps);

  try {
    for (let f = 0; f <= totalFrames; f++) {
      const progress = f / totalFrames;
      const svg = renderVerticalCalcSVGFrame({
        width: 1280,
        height: 720,
        operand_a: validated.operand_a,
        operand_b: validated.operand_b,
        operator: validated.operator,
        result: validated.result,
        carries: validated.carries,
        progress: progress,
        title: title,
        conclusion: conclusion
      });
      const frameFilename = `frame_${String(f).padStart(4, "0")}.svg`;
      fs.writeFileSync(path.join(tmpFramesDir, frameFilename), svg, "utf-8");
    }

    const ffmpegArgs = [
      "-y",
      "-framerate", String(fps),
      "-i", path.join(tmpFramesDir, "frame_%04d.svg"),
      "-c:v", "libx264",
      "-profile:v", "high",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      outPath
    ];
    try {
      execFileSync("ffmpeg", ffmpegArgs, { stdio: "pipe" });
    } catch (ffErr) {
      throw new Error(`[dynamic_media] FFmpeg 视频编码失败: ${ffErr.message}`);
    }

    return {
      status: "ok",
      outPath: path.resolve(outPath),
      durationSec,
      totalFrames,
      fileSize: fs.statSync(outPath).size
    };
  } finally {
    try {
      fs.rmSync(tmpFramesDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

/**
 * 4. 统一动画生成器入口
 */
export async function generateAnimationVideo(animSpec, outDir = "output/media") {
  if (!animSpec || typeof animSpec !== "object") {
    throw new Error(`[dynamic_media] 缺少动画规范 animSpec`);
  }

  const type = animSpec.animation_type || animSpec.type;
  const filename = `${animSpec.filename || type || "animation"}.mp4`;
  const outPath = path.join(outDir, filename);

  if (type === "number_line_jump") {
    const p = animSpec.parameters || {};
    return await exportNumberLineJumpVideo({
      start: p.start ?? 0,
      step: p.step ?? 10,
      jumps: p.jumps ?? [20, 20, 20],
      target: p.target ?? 60,
      title: animSpec.title || "【算理探究】数轴跳跃过程推演",
      conclusion: animSpec.conclusion || "20 × 3 = 60",
      outPath: outPath,
      durationSec: animSpec.duration_sec || 4.5,
      fps: 30
    });
  }

  if (type === "vertical_calc_flow") {
    const p = animSpec.parameters || {};
    return await exportVerticalCalcVideo({
      operand_a: p.operand_a ?? 28,
      operand_b: p.operand_b ?? 3,
      operator: p.operator ?? "×",
      result: p.result ?? 84,
      carries: p.carries ?? { 1: 2 },
      title: animSpec.title || "【算理探究】多位数乘一位数笔算过程推演",
      conclusion: animSpec.conclusion || "28 × 3 = 84",
      outPath: outPath,
      durationSec: animSpec.duration_sec || 4.5,
      fps: 30
    });
  }

  throw new Error(`[dynamic_media] 尚不支持的动画类型: ${type}`);
}
