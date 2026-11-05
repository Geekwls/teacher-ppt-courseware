#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Skill 目录安装同步器 (install_skill.js) - 纯 Node.js
 *
 * 把正本 plugin/skills/lesson-courseware 同步到各 Agent 发现目录, 保证零差异同构:
 *   项目级(--target <项目根>, 默认本仓库):
 *     .agents/skills/lesson-courseware
 *   用户级(--user):
 *     ~/.agents/skills/lesson-courseware
 *
 * 用法:
 *   node scripts/install_skill.js
 *   node scripts/install_skill.js --check
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "plugin", "skills", "lesson-courseware");

const DIR_MAP = {
  agents: [".agents", "skills"]
};

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

function resolveTargets(baseRoot, dirKeys) {
  return dirKeys.map(key => {
    const seg = DIR_MAP[key];
    return { key, dest: path.join(baseRoot, ...seg, "lesson-courseware") };
  });
}

function parseCli() {
  const args = process.argv.slice(2);
  const out = { dirs: ["agents"], check: false, user: false, target: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--check") out.check = true;
    else if (a === "--user") out.user = true;
    else if (a === "--target" && args[i + 1]) {
      out.target = args[i + 1];
      i++;
    } else if (a === "--dirs" && args[i + 1]) {
      out.dirs = args[i + 1].split(",").map(s => s.trim());
      i++;
    }
  }
  return out;
}

function main() {
  const opts = parseCli();
  if (!fs.existsSync(SRC)) {
    console.error(JSON.stringify({ status: "error", message: `源目录不存在: ${SRC}` }));
    process.exit(1);
  }

  const baseRoot = opts.user ? os.homedir() : (opts.target ? path.resolve(opts.target) : ROOT);
  const targets = resolveTargets(baseRoot, opts.dirs);
  const srcDigest = digestDir(SRC);

  const report = [];
  let driftAny = false;
  let missingAny = false;

  for (const { key, dest } of targets) {
    const entry = { dir: key, path: dest };
    if (!fs.existsSync(dest)) {
      missingAny = true;
      driftAny = true;
      entry.status = "missing";
    } else {
      const dstDigest = digestDir(dest);
      const allKeys = new Set([...Object.keys(srcDigest), ...Object.keys(dstDigest)]);
      const diff = Array.from(allKeys).filter(k => srcDigest[k] !== dstDigest[k]).sort();
      entry.status = diff.length === 0 ? "ok" : "drift";
      if (diff.length > 0) {
        driftAny = true;
        entry.different_files = diff.slice(0, 20);
      }
    }
    report.push(entry);
  }

  if (opts.check) {
    const status = (!driftAny && !missingAny) ? "ok" : "drift";
    console.log(JSON.stringify({
      status,
      source_files: Object.keys(srcDigest).length,
      targets: report
    }, null, 1));
    process.exit(status === "ok" ? 0 : 1);
  }

  // 写入同步
  for (const { dest } of targets) {
    copyDirRecursive(SRC, dest);
  }

  console.log(JSON.stringify({
    status: "ok",
    source_files: Object.keys(srcDigest).length,
    scope: opts.user ? "user" : `project(${baseRoot})`,
    targets: report
  }, null, 1));
}

main();
