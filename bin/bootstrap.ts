#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { detect, FrontendDetection, BackendDetection, AppEntry } from "../lib/detect";
import * as prompts from "../lib/prompts";
import { installSkill, installHooks, installMcp, InstallSkillResult } from "../lib/install";
import { runDiscovery, summarize } from "../lib/discover";
import { installDependencies, DepSummary } from "../lib/post-install";

const log = (msg: string) => process.stdout.write(`${msg}\n`);
const err = (msg: string) => process.stderr.write(`${msg}\n`);

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
const TEMPLATES = path.join(PACKAGE_ROOT, "templates");

function abort(message: string, code = 1): never {
  err(`\n✖ ${message}`);
  process.exit(code);
}

function abortOnInstallFailure(
  result: InstallSkillResult,
  name: string
): { skillName: string; target: string } {
  if (result.ok) return result;
  err(`\n✖ Failed to install ${name}.`);
  err(`The render produced ${result.errors?.length || 0} error(s); nothing was written.`);
  if (result.errors) {
    for (const e of result.errors.slice(0, 15)) {
      const loc = e.file || (e.path ? `CONFIG.${e.path}` : "<config>");
      err(`  [${e.kind}] ${loc}: ${e.message}`);
    }
  }
  err(`\nThis is a bug in the kernel templates or in the config builder.`);
  err(`File a report at https://github.com/sidzan/agent-orchestrator/issues with the above output.`);
  prompts.close();
  process.exit(3);
}

function isProjectRoot(cwd: string): boolean {
  return (
    fs.existsSync(path.join(cwd, "package.json")) ||
    fs.readdirSync(cwd).some((f: string) => f.endsWith(".sln") || f.endsWith(".csproj"))
  );
}

type Stack = "frontend" | "backend";

async function chooseStacks(detection: { frontend: FrontendDetection | null; backend: BackendDetection | null }): Promise<Stack[]> {
  type StackKey = Stack | "both";
  const opts: { key: StackKey; label: string }[] = [];
  if (detection.frontend) opts.push({ key: "frontend", label: "Frontend (React)" });
  if (detection.backend) opts.push({ key: "backend", label: "Backend (C#)" });
  if (detection.frontend && detection.backend)
    opts.push({ key: "both", label: "Both (frontend + backend)" });

  if (opts.length === 0) {
    abort(
      "agent-bootstrap supports React and C# projects only. " +
        "No React deps found in package.json and no *.sln / *.csproj detected."
    );
  }

  if (opts.length === 1) {
    log(`\nDetected stack: ${opts[0].label}`);
    return opts[0].key === "frontend" ? ["frontend"] : ["backend"];
  }

  const picked = await prompts.choice<StackKey>("\nWhich skill(s) should be installed?", opts, opts.length - 1);
  if (picked.key === "both") return ["frontend", "backend"];
  return [picked.key];
}

function micDropAndExit(): never {
  log("\nyour loss! mic drop. bye");
  prompts.close();
  process.exit(2);
}

interface RunPatternDiscoveryArgs {
  cwd: string;
  stacks: Stack[];
  resolvedSkillDir: string;
  fe: FrontendDetection | null;
  be: ConfirmedBackend | null;
}

async function runPatternDiscovery(args: RunPatternDiscoveryArgs): Promise<void> {
  const { cwd, stacks, resolvedSkillDir, fe, be } = args;
  log("\n── Pattern Discovery (required) ──");
  log("This scans your codebase using `claude` (read-only: Read/Glob/Grep)");
  log("to derive project-specific reference docs into the installed skill.");
  log("");
  log("  Estimated:   30–90 seconds, ~5–20K tokens");
  log("  Cost:        billed against your existing Claude Code session");

  const yes = await prompts.confirm("Run pattern discovery?", true);
  if (!yes) micDropAndExit();

  const apps = fe
    ? fe.apps.map((a) => ({ name: a.name, path: a.path }))
    : be
      ? [{ name: be.projectName, path: be.srcPath }]
      : [];

  const result = await runDiscovery({
    stacks,
    projectRoot: cwd,
    skillDir: resolvedSkillDir,
    apps,
    log,
  });

  if (!result.ok) {
    if (result.reason === "no-claude") {
      err("\nclaude CLI not found on PATH.");
      micDropAndExit();
    }
    if (result.reason === "no-entries") {
      log("(no discovery entries for selected stacks — skipping)");
      return;
    }
    err(`\nDiscovery failed: ${result.reason}`);
    if (result.logPath) err(`See ${result.logPath} for details.`);
    if (result.stderr) err(result.stderr.split("\n").slice(0, 10).join("\n"));
    log("\nProceeding with empty references/ — agents will read the codebase directly.");
    return;
  }

  const { derived, fallback, total } = summarize(result);
  log(`\n── Pattern Discovery — results ──`);
  for (const f of derived) log(`  ✓ ${f}  (derived)`);
  for (const f of fallback) log(`  ⚠ ${f}  (fallback — no file written)`);
  log(`\nWrote ${derived.length}/${total} reference file(s) into ${resolvedSkillDir}/references/.`);
}

async function confirmFrontend(fe: FrontendDetection): Promise<FrontendDetection> {
  log("\n── Frontend detection ─────────────────────────");
  log(`Package manager: ${fe.packageManager}`);
  log(`Monorepo:        ${fe.monorepo ? fe.monorepoTool : "no (single-repo)"}`);
  log(`Apps detected:   ${fe.apps.length}`);
  for (const a of fe.apps) {
    log(`  • ${a.name}  (${a.path})  port=${a.port}`);
  }
  let apps = fe.apps;
  if (apps.length > 1) {
    log("\nDeselect any apps you do not want covered:");
    apps = await prompts.multiSelect(
      "  (Enter to accept, or numbers to toggle)",
      apps as unknown as (AppEntry & prompts.SelectableItem)[],
      (a) => `${a.name} — ${a.path} :${a.port}`
    ) as AppEntry[];
  }
  return { ...fe, apps: apps.filter((a) => a.selected !== false) };
}

interface ConfirmedBackend extends BackendDetection {
  commands: { test: string; build: string; lint: string };
}

async function confirmBackend(be: BackendDetection): Promise<ConfirmedBackend> {
  log("\n── Backend detection ─────────────────────────");
  log(`Solution:        ${be.solutionPath || "(none — using .csproj layout)"}`);
  log(`Project name:    ${be.projectName}`);
  log(`src/:            ${be.srcPath}`);
  log(`tests/:          ${be.testsPath || "(none)"}`);
  log(`csproj count:    ${be.csprojCount}`);
  log(`Migration tool:  ${be.migrationTool || "(not auto-detected)"}`);

  let migrationTool = be.migrationTool;
  if (be.needsMigrationToolPrompt) {
    const picked = await prompts.choice<"flyway" | "efcore" | "none">(
      "\nMigration tool?",
      [
        { key: "flyway", label: "Flyway" },
        { key: "efcore", label: "Entity Framework Core" },
        { key: "none", label: "None / other" },
      ],
      2
    );
    migrationTool = picked.key === "none" ? null : picked.key;
  }
  const testCmd = await prompts.text("Test command", be.defaults.testCommand);
  const buildCmd = await prompts.text("Build command", be.defaults.buildCommand);
  const lintCmd = await prompts.text("Lint/format command", be.defaults.lintCommand);
  return {
    ...be,
    migrationTool,
    commands: { test: testCmd, build: buildCmd, lint: lintCmd },
  };
}

interface JiraConfig {
  enabled: boolean;
  baseUrl?: string;
  projectKey?: string;
}
interface SonarConfig {
  enabled: boolean;
  projectKey?: string;
  frontendProjectKey?: string;
  backendProjectKey?: string;
}
interface BrowserQAConfig {
  enabled: boolean;
  authStatePath?: string;
}
interface Integrations {
  jira: JiraConfig;
  sonar: SonarConfig;
  hooks: boolean;
  mcp: boolean;
  browserQA: BrowserQAConfig;
}

async function gatherIntegrations(stacks: Stack[]): Promise<Integrations> {
  log("\n── Integrations ─────────────────────────");
  const jiraEnabled = await prompts.confirm("Enable Jira integration?", true);
  let jira: JiraConfig = { enabled: false };
  if (jiraEnabled) {
    const baseUrl = await prompts.text("  Atlassian base URL", "https://yourco.atlassian.net");
    const projectKey = await prompts.text("  Jira project key", "PROJ");
    jira = { enabled: true, baseUrl, projectKey };
  }

  const sonarEnabled = await prompts.confirm("Enable SonarQube?", true);
  let sonar: SonarConfig = { enabled: false };
  if (sonarEnabled) {
    if (stacks.includes("frontend") && stacks.includes("backend")) {
      const fk = await prompts.text("  Frontend SonarQube project key", "yourco_frontend");
      const bk = await prompts.text("  Backend SonarQube project key", "yourco_backend");
      sonar = { enabled: true, frontendProjectKey: fk, backendProjectKey: bk };
    } else {
      const k = await prompts.text("  SonarQube project key", "yourco_project");
      sonar = { enabled: true, projectKey: k };
    }
  }

  const hooks = await prompts.confirm(
    "Install recommended hooks (lint-on-save, worktree-setup, enforce-task-update)?",
    true
  );
  const mcp = await prompts.confirm("Write .mcp.json.example at repo root?", true);

  let browserQA: BrowserQAConfig = { enabled: false };
  if (stacks.includes("frontend")) {
    const authPath = await prompts.text(
      "  Browser QA auth state path (Inspector Clouseau)",
      "~/.agent-browser"
    );
    browserQA = { enabled: true, authStatePath: authPath };
  }

  return { jira, sonar, hooks, mcp, browserQA };
}

function frontendConfig(fe: FrontendDetection, integrations: Integrations, projectName: string): Record<string, unknown> {
  const a = fe.apps[0];
  return {
    project: { name: projectName, packageManager: fe.packageManager, monorepo: fe.monorepo },
    apps: fe.apps,
    stack: a?.stack || {},
    commands: {
      build: a?.buildCommand || "pnpm build",
      test: a?.testCommand || "pnpm test",
      lint: a?.lintCommand || "pnpm lint",
      typecheck: a?.typecheckCommand || "pnpm typecheck",
      dev: a?.devCommand || "pnpm dev",
    },
    integrations: {
      jira: integrations.jira,
      sonar: integrations.sonar.enabled
        ? { enabled: true, projectKey: integrations.sonar.frontendProjectKey || integrations.sonar.projectKey }
        : { enabled: false },
    },
    browserQA: integrations.browserQA,
  };
}

function backendConfig(be: ConfirmedBackend, integrations: Integrations, projectName: string): Record<string, unknown> {
  return {
    project: { name: projectName, packageManager: "none", monorepo: false },
    apps: [],
    backend: {
      solutionPath: be.solutionPath,
      projectName: be.projectName,
      srcPath: be.srcPath,
      testsPath: be.testsPath,
      csprojCount: be.csprojCount,
      migrationTool: be.migrationTool,
      commands: be.commands,
    },
    commands: {
      test: be.commands.test,
      build: be.commands.build,
      lint: be.commands.lint,
      typecheck: be.commands.build,
      dev: "dotnet run",
    },
    integrations: {
      jira: integrations.jira,
      sonar: integrations.sonar.enabled
        ? { enabled: true, projectKey: integrations.sonar.backendProjectKey || integrations.sonar.projectKey }
        : { enabled: false },
    },
    browserQA: { enabled: false },
  };
}

function postInstallMessage({ installed, deps }: { installed: string[]; deps: DepSummary | null }): void {
  log("\n──────────────────────────────────────────────");
  log("✔ Install complete.");
  for (const i of installed) log(`  • ${i}`);
  if (deps && deps.installed.length) {
    log("\nDependencies installed:");
    for (const d of deps.installed) log(`  ✓ ${d}`);
  }
  if (deps && deps.skipped.length) {
    log("\nDependencies already present (skipped):");
    for (const d of deps.skipped) log(`  • ${d}`);
  }
  if (deps && deps.failed.length) {
    log("\nDependencies you still need to install (run manually):");
    for (const f of deps.failed) log(`  → ${f.step}: ${f.hint}`);
  }
  log("\nNext:");
  log(`  • Edit .mcp.json to fill in secrets (Atlassian token, Bitbucket app password, …)`);
  log(`  • Review .claude/skills/*/references/ — derived from your codebase by claude. Edit by hand if needed.`);
  log(`  • Try it: /implement-app or /implement-backend in Claude Code.`);
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  log("agent-bootstrap — drop a multi-agent orchestration skill into this project.");
  log(`cwd: ${cwd}`);

  if (!isProjectRoot(cwd)) {
    abort("Not a project directory. Run this from the project root (needs package.json or *.sln/*.csproj).");
  }

  const detection = detect(cwd);
  const stacks = await chooseStacks(detection);

  let fe: FrontendDetection | null = null;
  let be: ConfirmedBackend | null = null;
  if (stacks.includes("frontend")) {
    if (!detection.frontend)
      abort("Frontend was selected but no React-style package.json was detected.");
    fe = await confirmFrontend(detection.frontend);
  }
  if (stacks.includes("backend")) {
    if (!detection.backend) abort("Backend was selected but no .sln / .csproj was detected.");
    be = await confirmBackend(detection.backend);
  }

  const integrations = await gatherIntegrations(stacks);
  const projectName = path.basename(cwd);

  const installed: string[] = [];

  if (fe) {
    const cfg = frontendConfig(fe, integrations, projectName);
    log("\n── Installing frontend skill ──");
    const mainResult = abortOnInstallFailure(
      await installSkill({
        projectRoot: cwd,
        templateDir: path.join(TEMPLATES, "frontend", "implement-app"),
        skillName: "implement-app",
        config: cfg,
        log,
      }),
      "implement-app"
    );
    installed.push(`.claude/skills/${mainResult.skillName}`);

    await runPatternDiscovery({
      cwd,
      stacks: ["frontend"],
      resolvedSkillDir: mainResult.target,
      fe,
      be: null,
    });

    for (const sub of ["jira-tracking", "create-pull-request", "sonar-fix"] as const) {
      const enabled =
        sub === "jira-tracking"
          ? cfg.integrations !== undefined && (cfg.integrations as { jira: { enabled: boolean } }).jira.enabled
          : sub === "sonar-fix"
            ? (cfg.integrations as { sonar: { enabled: boolean } }).sonar.enabled
            : true;
      if (!enabled) continue;
      const r = abortOnInstallFailure(
        await installSkill({
          projectRoot: cwd,
          templateDir: path.join(TEMPLATES, "shared", sub),
          skillName: sub,
          config: cfg,
          log,
        }),
        sub
      );
      installed.push(`.claude/skills/${r.skillName}`);
    }
  }

  if (be) {
    const cfg = backendConfig(be, integrations, projectName);
    log("\n── Installing backend skill ──");
    const mainResult = abortOnInstallFailure(
      await installSkill({
        projectRoot: cwd,
        templateDir: path.join(TEMPLATES, "backend", "implement-backend"),
        skillName: "implement-backend",
        config: cfg,
        log,
      }),
      "implement-backend"
    );
    installed.push(`.claude/skills/${mainResult.skillName}`);

    await runPatternDiscovery({
      cwd,
      stacks: ["backend"],
      resolvedSkillDir: mainResult.target,
      fe: null,
      be,
    });

    if (!fe) {
      for (const sub of ["jira-tracking", "create-pull-request", "sonar-fix"] as const) {
        const enabled =
          sub === "jira-tracking"
            ? (cfg.integrations as { jira: { enabled: boolean } }).jira.enabled
            : sub === "sonar-fix"
              ? (cfg.integrations as { sonar: { enabled: boolean } }).sonar.enabled
              : true;
        if (!enabled) continue;
        const r = abortOnInstallFailure(
          await installSkill({
            projectRoot: cwd,
            templateDir: path.join(TEMPLATES, "shared", sub),
            skillName: sub,
            config: cfg,
            log,
          }),
          sub
        );
        installed.push(`.claude/skills/${r.skillName}`);
      }
    }
  }

  if (integrations.hooks) {
    log("\n── Installing hooks ──");
    installHooks({
      projectRoot: cwd,
      templateHooksDir: path.join(TEMPLATES, "hooks"),
      log,
    });
    installed.push(".claude/hooks/");
  }

  if (integrations.mcp) {
    log("\n── Writing .mcp.json.example ──");
    const variant = stacks.includes("frontend") ? "frontend" : "backend";
    installMcp({
      projectRoot: cwd,
      templateMcpDir: path.join(TEMPLATES, "mcp"),
      variant,
      log,
    });
    installed.push(".mcp.json.example");
  }

  const deps = await installDependencies({ stacks, projectRoot: cwd, log, err });

  postInstallMessage({ installed, deps });
  prompts.close();
}

main()
  .then(() => process.exit(0))
  .catch((e: Error) => {
    err(`\nFailed: ${e.message || e}`);
    if (process.env.DEBUG) err(String(e.stack));
    prompts.close();
    process.exit(1);
  });
