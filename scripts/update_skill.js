#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Skill 更新与多环境分发管理 CLI (update_skill.js) - 纯 Node.js
 *
 * 核心功能:
 * 1. 版本检查 (--check): 对比本地代码版本、已安装 Agent 副本及 GitHub 远端是否有新提交;
 * 2. 远程拉取更新 (--pull): 自动执行 git fetch/pull 拉取远程仓库最新版本;
 * 3. 一键同步安装 (--sync): 将正本 plugin/skills/lesson-courseware 零漂移同步至项目级和用户级 Agent 目录;
 * 4. 用户全局安装 (--user): 安装/更新至用户根目录 (~/.agents/skills, ~/.gemini/antigravity/skills 等);
 * 5. 健康自检与测试 (--verify): 更新后自动跑回归测试，保证 Skill 处于可用状态。
 *
 * 用法:
 *   node scripts/update_skill.js              # 检查并同步本地所有已配置目录
 *   node scripts/update_skill.js --check      # 仅检查是否有更新或目录漂移 (退出码 0=最新同构, 1=存在更新或漂移)
 *   node scripts/update_skill.js --pull       # 从 GitHub 远端拉取最新代码并同步
 *   node scripts/update_skill.js --user       # 同步更新至用户全局 Agent 目录
 *   node scripts/update_skill.js --verify     # 更新后执行回归自检
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { execSync } from "child_process";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "plugin", "skills", "lesson-courseware");
const VERSION_FILE = path.join(SRC, "version.json");

// 各 Agent 发现目录映射
const PROJECT_TARGETS = [
  { key: "agents", relPath: [".agents", "skills", "lesson-courseware"] }
];

const USER_TARGETS = [
  { key: "user_agents", relPath: [".agents", "skills", "lesson-courseware"] },
  { key: "user_antigravity", relPath: [".gemini", "antigravity", "skills", "lesson-courseware"] }
];

function readVersionInfo() {
  if (fs.existsSync(VERSION_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VERSION_FILE, "utf-8"));
    } catch {
      return { version: "unknown" };
    }
  }
  return { version: "1.0.0" };
}

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

function checkGitRemote() {
  try {
    const localHash = execSync("git rev-parse HEAD", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    
    // 尝试探测远程是否有更新 (超时 3 秒)
    const remoteOut = execSync(`git ls-remote origin ${branch}`, { encoding: "utf-8", timeout: 3500, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const remoteHash = remoteOut.split(/\s+/)[0];

    return {
      hasGit: true,
      branch,
      localHash: localHash.slice(0, 7),
      remoteHash: remoteHash ? remoteHash.slice(0, 7) : null,
      behind: (remoteHash && remoteHash !== localHash)
    };
  } catch {
    return { hasGit: false, behind: false };
  }
}

function pullGitRemote() {
  console.log("📥 正在从 GitHub 远端拉取最新更新 (git pull)...");
  try {
    const res = execSync("git pull origin main", { encoding: "utf-8" });
    console.log(res.trim());
    return true;
  } catch (err) {
    console.error(`❌ Git 拉取失败: ${err.message}`);
    return false;
  }
}

function parseCli() {
  const args = process.argv.slice(2);
  const out = {
    check: false,
    pull: false,
    sync: false,
    user: false,
    verify: false
  };

  for (const a of args) {
    if (a === "--check") out.check = true;
    else if (a === "--pull") out.pull = true;
    else if (a === "--sync") out.sync = true;
    else if (a === "--user") out.user = true;
    else if (a === "--verify") out.verify = true;
  }

  // 默认模式: 如果没有指定 check，则执行 sync 同步
  if (!out.check && !out.pull) {
    out.sync = true;
  }

  return out;
}

async function main() {
  const opts = parseCli();
  const vInfo = readVersionInfo();

  console.log("================================================================");
  console.log(`📦 教师课件生成 Skill 管理器 (Version: v${vInfo.version})`);
  console.log(`   引擎架构: ${vInfo.engine_type || "dual-ast-layered"}  |  发布日期: ${vInfo.released_at || "2026-11-05"}`);
  console.log("================================================================");

  if (!fs.existsSync(SRC)) {
    console.error(`❌ 错误: Skill 正本源目录不存在: ${SRC}`);
    process.exit(1);
  }

  // 1. 如果指定了 --pull，先从远端拉取更新
  if (opts.pull) {
    const ok = pullGitRemote();
    if (!ok) {
      console.warn("⚠️ 远端拉取异常，继续执行本地同步...");
    }
  }

  // 2. 检查远端 git 状态
  const gitStatus = checkGitRemote();
  if (gitStatus.hasGit) {
    console.log(`🔍 Git 状态: 当前分支 [${gitStatus.branch}] 本地提交: ${gitStatus.localHash}`);
    if (gitStatus.behind) {
      console.log(`💡 提示: 远端发现更新 (${gitStatus.remoteHash})! 可运行 node scripts/update_skill.js --pull 拉取`);
    } else {
      console.log(`✓ 本地代码与 GitHub 远端保持最新一致。`);
    }
  }

  // 3. 构建待检查/更新目标目录列表
  const targets = [];
  PROJECT_TARGETS.forEach(t => {
    targets.push({
      key: t.key,
      scope: "project",
      dest: path.join(ROOT, ...t.relPath)
    });
  });

  if (opts.user) {
    const homedir = os.homedir();
    USER_TARGETS.forEach(t => {
      targets.push({
        key: t.key,
        scope: "user",
        dest: path.join(homedir, ...t.relPath)
      });
    });
  }

  const srcDigest = digestDir(SRC);
  const srcFileCount = Object.keys(srcDigest).length;
  console.log(`📁 正本源文件数量: ${srcFileCount} 个文件`);

  let driftCount = 0;
  const report = [];

  for (const t of targets) {
    const exists = fs.existsSync(t.dest);
    if (!exists) {
      driftCount++;
      report.push({ ...t, status: "missing", diffFiles: [] });
      continue;
    }

    const dstDigest = digestDir(t.dest);
    const allKeys = new Set([...Object.keys(srcDigest), ...Object.keys(dstDigest)]);
    const diff = Array.from(allKeys).filter(k => srcDigest[k] !== dstDigest[k]).sort();

    if (diff.length > 0) {
      driftCount++;
      report.push({ ...t, status: "drift", diffFiles: diff });
    } else {
      report.push({ ...t, status: "ok", diffFiles: [] });
    }
  }

  // 检查模式输出
  if (opts.check) {
    console.log("----------------------------------------------------------------");
    console.log("📊 目录同构与漂移检查结果:");
    report.forEach(r => {
      const mark = r.status === "ok" ? "✓ OK" : (r.status === "drift" ? "⚠️ DRIFT" : "❌ MISSING");
      console.log(`   [${r.scope}] ${r.dest} -> ${mark}`);
      if (r.diffFiles.length > 0) {
        console.log(`      差异文件 (${r.diffFiles.length} 个): ${r.diffFiles.slice(0, 5).join(", ")}${r.diffFiles.length > 5 ? "..." : ""}`);
      }
    });

    const isLatest = driftCount === 0 && !gitStatus.behind;
    console.log("================================================================");
    if (isLatest) {
      console.log("🎉 当前 Skill 正本与各 Agent 目录 100% 同构，且与远端保持最新！");
      process.exit(0);
    } else {
      console.log(`⚠️ 检测到 ${driftCount} 个目录存在漂移或缺失。可运行 node scripts/update_skill.js 执行一键同步！`);
      process.exit(1);
    }
  }

  // 执行同步安装
  console.log("----------------------------------------------------------------");
  console.log("🚀 开始执行 Skill 全量增量同构同步 (Syncing)...");
  for (const r of report) {
    if (r.status === "ok") {
      console.log(`   [保持最新] ${r.dest}`);
      continue;
    }
    console.log(`   [更新同步] ${r.dest} (复制 ${srcFileCount} 个文件)...`);
    copyDirRecursive(SRC, r.dest);
  }

  // 4. 可选: 验证回归测试
  if (opts.verify) {
    console.log("----------------------------------------------------------------");
    console.log("🧪 执行更新后回归测试 (npm test)...");
    try {
      execSync("npm test", { stdio: "inherit" });
      console.log("✓ 回归测试全量通过!");
    } catch {
      console.error("❌ 回归测试失败，请检查更新后代码!");
      process.exit(1);
    }
  }

  console.log("================================================================");
  console.log("🎉 Skill 更新与同步完成!");
  console.log(`   当前版本: v${vInfo.version}  |  受控目录数: ${targets.length}`);
  console.log("================================================================");
}

main().catch(err => {
  console.error("更新脚本发生未捕获异常:", err);
  process.exit(1);
});
