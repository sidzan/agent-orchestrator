import * as fs from "fs";
import * as path from "path";
import { renderTree, writeTree, RenderIssue } from "./render";
import * as prompts from "./prompts";
import { AgentDef, renderAgentFile } from "./agent-defs";

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function suggestRename(targetDir: string): string {
  let i = 2;
  while (fs.existsSync(`${targetDir}-v${i}`)) i += 1;
  return `${targetDir}-v${i}`;
}

interface ResolvedTarget {
  skillName: string;
  target: string;
  renamed: boolean;
}

async function resolveSkillTarget(
  claudeSkillsDir: string,
  skillName: string
): Promise<ResolvedTarget> {
  const target = path.join(claudeSkillsDir, skillName);
  if (!fs.existsSync(target)) return { skillName, target, renamed: false };
  const suggestion = path.basename(suggestRename(target));
  process.stdout.write(
    `\nSkill '${skillName}' already exists at ${target}.\n` +
      `The CLI does not merge or overwrite. Pick a new name.\n`
  );
  const newName = await prompts.text("New skill name", suggestion);
  return resolveSkillTarget(claudeSkillsDir, newName);
}

export interface InstallSkillArgs {
  projectRoot: string;
  templateDir: string;
  skillName: string;
  config: Record<string, unknown>;
  log?: (msg: string) => void;
}

export type InstallSkillResult =
  | { ok: true; skillName: string; target: string }
  | { ok: false; errors: RenderIssue[] };

export async function installSkill(args: InstallSkillArgs): Promise<InstallSkillResult> {
  const { projectRoot, templateDir, skillName, config, log } = args;
  const claudeSkillsDir = path.join(projectRoot, ".claude", "skills");
  ensureDir(claudeSkillsDir);
  const resolved = await resolveSkillTarget(claudeSkillsDir, skillName);
  const finalConfig = { ...config, _resolvedSkillName: resolved.skillName };

  const rendered = renderTree(templateDir, finalConfig);
  if (!rendered.ok) {
    log?.(`  ✗ render failed for ${resolved.skillName}:`);
    for (const e of rendered.errors.slice(0, 10)) {
      const loc = e.file || "<config>";
      log?.(`     [${e.kind}] ${loc}: ${e.message}`);
    }
    if (rendered.errors.length > 10) {
      log?.(`     … and ${rendered.errors.length - 10} more`);
    }
    return { ok: false, errors: rendered.errors };
  }

  const wrote = writeTree(resolved.target, rendered.files);
  if (!wrote.ok) {
    log?.(`  ✗ write failed for ${resolved.skillName}: ${wrote.error?.message}`);
    return { ok: false, errors: [{ kind: "write", message: wrote.error?.message || "write failed" }] };
  }

  log?.(`  installed ${resolved.skillName} (${rendered.files.length} files)`);
  return { ok: true, skillName: resolved.skillName, target: resolved.target };
}

export interface InstallHooksArgs {
  projectRoot: string;
  templateHooksDir: string;
  log?: (msg: string) => void;
}

export function installHooks({ projectRoot, templateHooksDir, log }: InstallHooksArgs): void {
  const dest = path.join(projectRoot, ".claude", "hooks");
  ensureDir(dest);
  const entries = fs.readdirSync(templateHooksDir);
  let count = 0;
  for (const name of entries) {
    const src = path.join(templateHooksDir, name);
    const out = path.join(dest, name);
    if (fs.existsSync(out)) {
      log?.(`  skipped (already exists): .claude/hooks/${name}`);
      continue;
    }
    fs.copyFileSync(src, out);
    try {
      fs.chmodSync(out, 0o755);
    } catch { /* ignore */ }
    count += 1;
  }
  log?.(`  installed ${count} hook(s)`);
}

export interface InstallAgentsArgs {
  projectRoot: string;
  /** Where the orchestrator skill was just installed (post rename-on-conflict). */
  resolvedSkillDir: string;
  /** The persona table for the active stack. */
  agents: readonly AgentDef[];
  log?: (msg: string) => void;
}

export interface InstallAgentsResult {
  written: string[];
  overwritten: string[];
  missingSource: string[];
}

/**
 * Install Claude Code subagent files at .claude/agents/<name>.md so the
 * orchestrator's @indiana / @sheep / etc spawns are recognised as registered
 * subagent types rather than falling back to general-purpose.
 *
 * Source body comes from the orchestrator skill's team file; agent
 * frontmatter (name / description / model) is added on copy.
 *
 * Existing agent files are OVERWRITTEN — the kernel ships specific personas
 * tied to the gate flow and silent-skip would leave outdated content. The
 * result reports which files were overwritten so the user can audit.
 */
export function installAgents(args: InstallAgentsArgs): InstallAgentsResult {
  const { projectRoot, resolvedSkillDir, agents, log } = args;
  const agentsDir = path.join(projectRoot, ".claude", "agents");
  ensureDir(agentsDir);

  const written: string[] = [];
  const overwritten: string[] = [];
  const missingSource: string[] = [];

  for (const def of agents) {
    const sourcePath = path.join(resolvedSkillDir, def.sourceFile);
    if (!fs.existsSync(sourcePath)) {
      missingSource.push(`${def.name} (expected ${def.sourceFile})`);
      continue;
    }
    const sourceBody = fs.readFileSync(sourcePath, "utf8");
    const rendered = renderAgentFile(def, sourceBody);
    const dest = path.join(agentsDir, `${def.name}.md`);
    const existed = fs.existsSync(dest);
    fs.writeFileSync(dest, rendered);
    if (existed) overwritten.push(def.name);
    else written.push(def.name);
  }

  if (written.length) log?.(`  installed ${written.length} agent(s): ${written.join(", ")}`);
  if (overwritten.length) log?.(`  ⚠ overwrote existing agent(s): ${overwritten.join(", ")}`);
  if (missingSource.length) log?.(`  ✗ source missing for: ${missingSource.join(", ")}`);

  return { written, overwritten, missingSource };
}

export interface InstallMcpArgs {
  projectRoot: string;
  templateMcpDir: string;
  variant: "frontend" | "backend";
  log?: (msg: string) => void;
}

export function installMcp({ projectRoot, templateMcpDir, variant, log }: InstallMcpArgs): void {
  const fileName = `mcp.json.example.${variant}`;
  const src = path.join(templateMcpDir, fileName);
  if (!fs.existsSync(src)) return;
  const dest = path.join(projectRoot, ".mcp.json.example");
  if (fs.existsSync(dest)) {
    log?.(`  skipped (already exists): .mcp.json.example`);
    return;
  }
  fs.copyFileSync(src, dest);
  log?.(`  wrote .mcp.json.example`);
}
