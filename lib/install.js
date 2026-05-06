"use strict";

const fs = require("fs");
const path = require("path");
const { render } = require("./substitute");

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".sh",
  ".json",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".yml",
  ".yaml",
  ".sql",
  ".cs",
  ".csproj",
  ".txt",
  ".example",
  ".gitignore",
]);

function isTextFile(filePath) {
  if (TEXT_EXTENSIONS.has(path.extname(filePath))) return true;
  const base = path.basename(filePath);
  if (base.startsWith(".") || !base.includes(".")) return true;
  return false;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDirRendered(srcDir, destDir, config, log) {
  if (!fs.existsSync(srcDir)) return 0;
  ensureDir(destDir);
  let count = 0;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const src = path.join(srcDir, e.name);
    const dest = path.join(destDir, e.name);
    if (e.isDirectory()) {
      count += copyDirRendered(src, dest, config, log);
    } else {
      if (isTextFile(src)) {
        const raw = fs.readFileSync(src, "utf8");
        const rendered = render(raw, config, {
          warn: (msg) => log && log(`  warn: ${path.relative(process.cwd(), src)}: ${msg}`),
        });
        fs.writeFileSync(dest, rendered);
      } else {
        fs.copyFileSync(src, dest);
      }
      count += 1;
    }
  }
  return count;
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

async function installSkill({ projectRoot, templateDir, skillName, config, prompts, log }) {
  const claudeSkillsDir = path.join(projectRoot, ".claude", "skills");
  ensureDir(claudeSkillsDir);
  const resolved = await resolveSkillTarget(claudeSkillsDir, skillName, prompts);
  const finalConfig = { ...config, _resolvedSkillName: resolved.skillName };
  const fileCount = copyDirRendered(templateDir, resolved.target, finalConfig, log);
  log && log(`  installed ${resolved.skillName} (${fileCount} files)`);
  return resolved;
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
  copyDirRendered,
  ensureDir,
};
