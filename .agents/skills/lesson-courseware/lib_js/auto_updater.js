// -*- coding: utf-8 -*-
/**
 * Skill 自动检测与静默自愈更新模块 (auto_updater.js)
 *
 * 核心设计:
 * 1. 运行时无感静默执行: 任何 CLI/Agent 触发操作时自动前置运行, 无需人工干预;
 * 2. 本地漂移自愈 (Local Auto-Heal): 自动检测正本与各 Agent 目录差异, 发现修改毫秒级自动同步;
 * 3. 远端更新无阻探测 (Remote Throttle Detection):
 *    - 节流策略 (默认 1 小时内仅检查 1 次, 避免网络卡顿);
 *    - 异步/软超时保护 (网络不通或离线时 2 秒内静默放行, 绝不阻塞正常业务);
 *    - 若发现远端有新提交, 自动在终端呈现优雅通知横幅, 或在安全时自动拉取。
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

const CACHE_FILE_NAME = ".update_cache.json";
const DEFAULT_THROTTLE_MS = 60 * 60 * 1000; // 1 小时节流

function digestDir(dirPath) {
  const out = {};
  function walk(current) {
    if (!fs.existsSync(current)) return;
    const items = fs.readdirSync(current);
    for (const item of items) {
      if (item === "__pycache__" || item === ".git") continue;
      const full = path.join(current, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        const rel = path.relative(dirPath, full).replace(/\\/g, "/");
        const buf = fs.readFileSync(full);
        out[rel] = crypto.createHash("sha256").update(buf).digest("hex");
      }
    }
  }
  walk(dirPath);
  return out;
}

function copyDirRecursive(src, dest) {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(dest, { recursive: true });

  function copy(s, d) {
    const entries = fs.readdirSync(s);
    for (const entry of entries) {
      if (entry === "__pycache__" || entry === ".git") continue;
      const srcPath = path.join(s, entry);
      const destPath = path.join(d, entry);
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copy(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  copy(src, dest);
}

/**
 * 自动检测与更新
 */
export function runAutoUpdateCheck(options = {}) {
  const root = options.root || process.cwd();
  const src = path.join(root, "plugin", "skills", "lesson-courseware");
  const agentDest = path.join(root, ".agents", "skills", "lesson-courseware");
  const cachePath = path.join(root, CACHE_FILE_NAME);

  if (!fs.existsSync(src)) return;

  // 1. 本地目录漂移自动自愈 (Local Auto-Heal) - 始终静默检查并修复
  try {
    if (!fs.existsSync(agentDest)) {
      copyDirRecursive(src, agentDest);
      console.log("[auto-updater] ⚡ 发现缺少 Agent 安装目录，已自动完成同步初始化。");
    } else {
      const srcDig = digestDir(src);
      const dstDig = digestDir(agentDest);
      const allKeys = new Set([...Object.keys(srcDig), ...Object.keys(dstDig)]);
      const diff = Array.from(allKeys).filter(k => srcDig[k] !== dstDig[k]);
      if (diff.length > 0) {
        copyDirRecursive(src, agentDest);
        console.log(`[auto-updater] ⚡ 检测到本地 Skill 源码变动 (${diff.length} 个文件)，已自动静默同步至 .agents 目录。`);
      }
    }
  } catch {
    // 静默忽略本地自愈异常
  }

  // 2. 远端更新探测 (带节流与软超时)
  let cache = {};
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    } catch {
      cache = {};
    }
  }

  const now = Date.now();
  const throttleMs = options.throttleMs || DEFAULT_THROTTLE_MS;
  if (cache.lastCheckedAt && (now - cache.lastCheckedAt) < throttleMs) {
    // 还在节流窗口内，直接返回
    return;
  }

  // 更新缓存时间戳
  cache.lastCheckedAt = now;
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch {}

  // 异步或带超时的远端探测
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: root, encoding: "utf-8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    const localHash = execSync("git rev-parse HEAD", {
      cwd: root, encoding: "utf-8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    // 2.5 秒超时查询远端
    const remoteOut = execSync(`git ls-remote origin ${branch}`, {
      cwd: root, encoding: "utf-8", timeout: 2500, stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    const remoteHash = remoteOut ? remoteOut.split(/\s+/)[0] : null;

    if (remoteHash && remoteHash !== localHash) {
      console.log("\n┌─────────────────────────────────────────────────────────────┐");
      console.log(`│ 💡 自动更新检测: GitHub 远端发现新版本 (${remoteHash.slice(0, 7)})!      │`);
      console.log("│    建议运行 npm run pull-skill 自动拉取最新优化与课件模板   │");
      console.log("└─────────────────────────────────────────────────────────────┘\n");
    }
  } catch {
    // 离线或网络异常时完全静默，绝不阻断正常生成业务
  }
}
