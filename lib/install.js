"use strict";

const fs = require("fs");
const path = require("path");
const { renderTree, writeTree } = require("./render");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function suggestRename(targetDir) {
  let i = 2;
  while (fs.existsSync(`${targetDir}-v${i}`)) i += 1;
  return `${targetDir}-v${i}`;
}

async function resolveSkillTarget(claudeSkillsDir, skillName, prompts) {
  const target = path.join(claudeSkillsDir, skillName);
  if (!fs.existsSync(target)) return { skillName, target, renamed: false };
  const suggestion = path.basename(suggestRename(target));
  process.stdout.write(
    `\nSkill '${skillName}' already exists at ${target}.\n` +
      `The CLI does not merge or overwrite. Pick a new name.\n`
  );
  const newName = await prompts.text("New skill name", suggestion);
  return resolveSkillTarget(claudeSkillsDir, newName, prompts);
}

/**
 * Install a single skill. Renders the entire template tree in memory first,
 * audits it, and writes only if the audit passed. Returns:
 *   { ok, skillName, target } on success
 *   { ok: false, errors } on render or write failure
 *
 * On any failure NOTHING is written to disk for this skill.
 */
async function installSkill({ projectRoot, templateDir, skillName, config, prompts, log }) {
  const claudeSkillsDir = path.join(projectRoot, ".claude", "skills");
  ensureDir(claudeSkillsDir);
  const resolved = await resolveSkillTarget(claudeSkillsDir, skillName, prompts);
  const finalConfig = { ...config, _resolvedSkillName: resolved.skillName };

  const rendered = renderTree(templateDir, finalConfig);
  if (!rendered.ok) {
    log && log(`  ✗ render failed for ${resolved.skillName}:`);
    for (const e of rendered.errors.slice(0, 10)) {
      const loc = e.file ? `${e.file}` : "<config>";
      log && log(`     [${e.kind}] ${loc}: ${e.message}`);
    }
    if (rendered.errors.length > 10) {
      log && log(`     … and ${rendered.errors.length - 10} more`);
    }
    return { ok: false, errors: rendered.errors };
  }

  const wrote = writeTree(resolved.target, rendered.files);
  if (!wrote.ok) {
    log && log(`  ✗ write failed for ${resolved.skillName}: ${wrote.error.message}`);
    return { ok: false, errors: [{ kind: "write", message: wrote.error.message }] };
  }

  log && log(`  installed ${resolved.skillName} (${rendered.files.length} files)`);
  return { ok: true, skillName: resolved.skillName, target: resolved.target };
}

function installHooks({ projectRoot, templateHooksDir, log }) {
  const dest = path.join(projectRoot, ".claude", "hooks");
  ensureDir(dest);
  const entries = fs.readdirSync(templateHooksDir);
  let count = 0;
  for (const name of entries) {
    const src = path.join(templateHooksDir, name);
    const out = path.join(dest, name);
    if (fs.existsSync(out)) {
      log && log(`  skipped (already exists): .claude/hooks/${name}`);
      continue;
    }
    fs.copyFileSync(src, out);
    try {
      fs.chmodSync(out, 0o755);
    } catch {}
    count += 1;
  }
  log && log(`  installed ${count} hook(s)`);
}

function installMcp({ projectRoot, templateMcpDir, variant, log }) {
  const fileName = `mcp.json.example.${variant}`;
  const src = path.join(templateMcpDir, fileName);
  if (!fs.existsSync(src)) return;
  const dest = path.join(projectRoot, ".mcp.json.example");
  if (fs.existsSync(dest)) {
    log && log(`  skipped (already exists): .mcp.json.example`);
    return;
  }
  fs.copyFileSync(src, dest);
  log && log(`  wrote .mcp.json.example`);
}

module.exports = {
  installSkill,
  installHooks,
  installMcp,
  ensureDir,
};
