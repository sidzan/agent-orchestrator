#!/usr/bin/env node
"use strict";

/**
 * Snapshot tests for the renderer.
 *
 * Renders each canonical config fixture against the matching template tree
 * and either compares to a saved snapshot (default) or updates the snapshot
 * (--update). Zero npm deps; pure Node + fs + readline.
 *
 * Usage:
 *   node tests/snapshot.js          → run, fail on drift
 *   node tests/snapshot.js --update → write snapshots, never fail
 */

const fs = require("fs");
const path = require("path");
const { renderTree } = require("../dist/lib/render");

const REPO_ROOT = path.resolve(__dirname, "..");
const FIX_DIR = path.join(__dirname, "fixtures");
const SNAP_DIR = path.join(__dirname, "snapshots");
const TPL = path.join(REPO_ROOT, "templates");

const UPDATE = process.argv.includes("--update");

const CASES = [
  { name: "npm-single-repo",   fixture: "npm-single-repo.config.json",   templateDir: path.join(TPL, "frontend", "implement-app") },
  { name: "pnpm-monorepo",     fixture: "pnpm-monorepo.config.json",     templateDir: path.join(TPL, "frontend", "implement-app") },
  { name: "dotnet-flyway",     fixture: "dotnet-flyway.config.json",     templateDir: path.join(TPL, "backend", "implement-backend") },
  { name: "dotnet-efcore",     fixture: "dotnet-efcore.config.json",     templateDir: path.join(TPL, "backend", "implement-backend") },
  { name: "shared-jira",       fixture: "npm-single-repo.config.json",   templateDir: path.join(TPL, "shared", "jira-tracking") },
  { name: "shared-pr",         fixture: "npm-single-repo.config.json",   templateDir: path.join(TPL, "shared", "create-pull-request") },
  { name: "shared-sonar",      fixture: "npm-single-repo.config.json",   templateDir: path.join(TPL, "shared", "sonar-fix") },
];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmRecursive(p) {
  if (!fs.existsSync(p)) return;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const sub = path.join(p, e.name);
    if (e.isDirectory()) rmRecursive(sub);
    else fs.unlinkSync(sub);
  }
  fs.rmdirSync(p);
}

function writeSnapshot(snapDir, files) {
  ensureDir(snapDir);
  for (const f of files) {
    const dest = path.join(snapDir, f.relativePath);
    ensureDir(path.dirname(dest));
    if (f.mode === "binary") fs.writeFileSync(dest, f.content);
    else fs.writeFileSync(dest, f.content);
  }
}

function listFiles(dir, base = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

function compareToSnapshot(snapDir, files) {
  const issues = [];
  const expectedSet = new Set(files.map((f) => f.relativePath));
  const actualList = listFiles(snapDir);
  const actualSet = new Set(actualList);

  for (const f of files) {
    const actualPath = path.join(snapDir, f.relativePath);
    if (!fs.existsSync(actualPath)) {
      issues.push({ kind: "missing-in-snapshot", file: f.relativePath });
      continue;
    }
    const expected = fs.readFileSync(actualPath);
    const got = f.mode === "binary" ? f.content : Buffer.from(f.content);
    if (!expected.equals(got)) {
      issues.push({ kind: "content-drift", file: f.relativePath });
    }
  }
  for (const a of actualList) {
    if (!expectedSet.has(a)) issues.push({ kind: "extra-in-snapshot", file: a });
  }
  return issues;
}

function runCase(c) {
  const fixturePath = path.join(FIX_DIR, c.fixture);
  const config = readJson(fixturePath);
  const result = renderTree(c.templateDir, config);

  if (!result.ok) {
    return {
      name: c.name,
      status: "render-failed",
      errors: result.errors.slice(0, 8),
    };
  }

  const snapDir = path.join(SNAP_DIR, c.name);

  if (UPDATE) {
    rmRecursive(snapDir);
    writeSnapshot(snapDir, result.files);
    return { name: c.name, status: "updated", count: result.files.length };
  }

  if (!fs.existsSync(snapDir)) {
    return { name: c.name, status: "no-snapshot", message: "run with --update to create" };
  }

  const drift = compareToSnapshot(snapDir, result.files);
  if (drift.length === 0) {
    return { name: c.name, status: "ok", count: result.files.length };
  }
  return { name: c.name, status: "drift", drift: drift.slice(0, 10) };
}

function main() {
  const results = CASES.map(runCase);
  let fail = 0;

  for (const r of results) {
    if (r.status === "ok") {
      console.log(`✓ ${r.name}: ${r.count} files match snapshot`);
    } else if (r.status === "updated") {
      console.log(`↻ ${r.name}: snapshot rewritten (${r.count} files)`);
    } else if (r.status === "no-snapshot") {
      console.log(`? ${r.name}: ${r.message}`);
      fail += 1;
    } else if (r.status === "drift") {
      console.log(`✗ ${r.name}: snapshot drift`);
      for (const d of r.drift) console.log(`    [${d.kind}] ${d.file}`);
      fail += 1;
    } else if (r.status === "render-failed") {
      console.log(`✗ ${r.name}: render failed`);
      for (const e of r.errors) {
        const loc = e.file || (e.path ? `CONFIG.${e.path}` : "<config>");
        console.log(`    [${e.kind}] ${loc}: ${e.message}`);
      }
      fail += 1;
    }
  }

  if (UPDATE) {
    console.log(`\n${results.length} snapshot(s) updated. Re-run without --update to verify.`);
    process.exit(0);
  }

  if (fail > 0) {
    console.log(`\n${fail}/${results.length} cases failed. Run with --update to accept new output (after manual review).`);
    process.exit(1);
  }
  console.log(`\n${results.length}/${results.length} cases passed.`);
  process.exit(0);
}

if (require.main === module) main();
