import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import * as prompts from "./prompts";

function which(cmd: string): string | null {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
  });
  return r.status === 0 ? r.stdout.trim().split("\n")[0] : null;
}

export function isAgentBrowserCliInstalled(): boolean {
  if (!which("agent-browser")) return false;
  const r = spawnSync("agent-browser", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

export function isAgentBrowserSkillInstalled(projectRoot: string): boolean {
  return fs.existsSync(path.join(projectRoot, ".claude", "skills", "agent-browser"));
}

export function npmGlobalNeedsSudo(): boolean | null {
  const prefix = spawnSync("npm", ["config", "get", "prefix"], { encoding: "utf8" });
  if (prefix.status !== 0) return null;
  const dir = prefix.stdout.trim();
  if (!dir) return null;
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return false;
  } catch {
    return true;
  }
}

interface RunCmdArgs {
  cmd: string;
  args: string[];
  label: string;
  log?: (msg: string) => void;
  err?: (msg: string) => void;
}

interface RunCmdResult {
  ok: boolean;
  status?: number | null;
}

function runCmd({ cmd, args, label, log, err }: RunCmdArgs): RunCmdResult {
  log?.(`  $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: "inherit" });
  if (r.status === 0) {
    log?.(`  ✓ ${label}`);
    return { ok: true };
  }
  err?.(`  ✗ ${label} failed (exit ${r.status})`);
  return { ok: false, status: r.status };
}

interface InstallStepArgs {
  log?: (msg: string) => void;
  err?: (msg: string) => void;
}

interface SkillInstallArgs extends InstallStepArgs {
  projectRoot: string;
}

export interface StepResult {
  ok: boolean;
  skipped?: boolean;
  needsManual?: string;
  reason?: string;
  copied?: boolean;
  error?: Error;
}

export function installAgentBrowserSkill({ projectRoot, log, err }: SkillInstallArgs): StepResult {
  if (isAgentBrowserSkillInstalled(projectRoot)) {
    log?.("  ✓ agent-browser skill already present");
    return { ok: true, skipped: true };
  }
  return runCmd({
    cmd: "npx",
    args: ["-y", "skills", "add", "vercel-labs/agent-browser"],
    label: "agent-browser skill",
    log,
    err,
  });
}

export function installAgentBrowserCli({ log, err }: InstallStepArgs): StepResult {
  if (isAgentBrowserCliInstalled()) {
    log?.("  ✓ agent-browser CLI already installed");
    return { ok: true, skipped: true };
  }
  const needsSudo = npmGlobalNeedsSudo();
  if (needsSudo === true) {
    err?.("  ⚠ npm global prefix is not writable. Run manually:");
    err?.("      sudo npm install -g agent-browser");
    return { ok: false, needsManual: "sudo npm install -g agent-browser" };
  }
  return runCmd({
    cmd: "npm",
    args: ["install", "-g", "agent-browser"],
    label: "agent-browser CLI",
    log,
    err,
  });
}

export function setupMcpJson({ projectRoot, log, err }: SkillInstallArgs): StepResult {
  const example = path.join(projectRoot, ".mcp.json.example");
  const real = path.join(projectRoot, ".mcp.json");
  if (!fs.existsSync(example)) {
    return { ok: false, reason: "no-example" };
  }
  if (fs.existsSync(real)) {
    log?.("  ✓ .mcp.json already exists (not overwriting)");
    return { ok: true, skipped: true };
  }
  try {
    fs.copyFileSync(example, real);
    log?.("  ✓ copied .mcp.json.example → .mcp.json");
    return { ok: true, copied: true };
  } catch (e) {
    err?.(`  ✗ copy failed: ${(e as Error).message}`);
    return { ok: false, error: e as Error };
  }
}

export interface DepSummary {
  installed: string[];
  skipped: string[];
  failed: { step: string; hint: string }[];
}

export interface InstallDependenciesArgs {
  stacks: string[];
  projectRoot: string;
  log?: (msg: string) => void;
  err?: (msg: string) => void;
}

export async function installDependencies(args: InstallDependenciesArgs): Promise<DepSummary> {
  const { stacks, projectRoot, log, err } = args;
  const summary: DepSummary = { installed: [], skipped: [], failed: [] };
  const wantsFrontendDeps = stacks.includes("frontend");

  if (wantsFrontendDeps) {
    log?.("\n── Frontend dependencies (Inspector Clouseau / browser QA) ──");
    log?.("This installs:");
    log?.("  • vercel-labs/agent-browser skill (Claude Code skill)");
    log?.("  • agent-browser CLI (`npm i -g agent-browser`)");

    const yes = await prompts.confirm("Install agent-browser dependencies?", true);
    if (yes) {
      const skill = installAgentBrowserSkill({ projectRoot, log, err });
      if (skill.ok && skill.skipped) summary.skipped.push("agent-browser skill");
      else if (skill.ok) summary.installed.push("agent-browser skill");
      else summary.failed.push({ step: "agent-browser skill", hint: "npx -y skills add vercel-labs/agent-browser" });

      const cli = installAgentBrowserCli({ log, err });
      if (cli.ok && cli.skipped) summary.skipped.push("agent-browser CLI");
      else if (cli.ok) summary.installed.push("agent-browser CLI");
      else summary.failed.push({ step: "agent-browser CLI", hint: cli.needsManual || "npm install -g agent-browser" });
    } else {
      summary.failed.push({ step: "agent-browser skill", hint: "npx -y skills add vercel-labs/agent-browser" });
      summary.failed.push({ step: "agent-browser CLI", hint: "npm install -g agent-browser" });
    }
  }

  if (fs.existsSync(path.join(projectRoot, ".mcp.json.example"))) {
    log?.("\n── MCP setup ──");
    log?.("Copying .mcp.json.example → .mcp.json so you can fill in secrets.");
    const yes = await prompts.confirm("Set up .mcp.json now?", true);
    if (yes) {
      const r = setupMcpJson({ projectRoot, log, err });
      if (r.ok && r.skipped) summary.skipped.push(".mcp.json (already present)");
      else if (r.ok) summary.installed.push(".mcp.json");
      else if (r.reason !== "no-example") summary.failed.push({ step: ".mcp.json", hint: "cp .mcp.json.example .mcp.json" });
    } else {
      summary.failed.push({ step: ".mcp.json", hint: "cp .mcp.json.example .mcp.json" });
    }
  }

  return summary;
}
