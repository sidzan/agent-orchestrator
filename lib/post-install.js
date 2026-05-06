"use strict";

/**
 * Post-install dependency setup.
 *
 * After the kernel + references/ are written, run the actually-required
 * setup commands instead of printing them as manual "next steps":
 *
 *  - vercel-labs/agent-browser skill  (frontend only — Inspector Clouseau)
 *  - agent-browser global CLI         (frontend only — driver for the skill)
 *  - .mcp.json.example → .mcp.json   (universal — file copy; user fills secrets)
 *
 * Each step is opt-in (prompted, default yes), idempotent (skipped if already
 * present), and falls back to printing the manual command if the automated
 * install fails for any reason. The bootstrap never aborts on a post-install
 * step — the orchestrator skill is already on disk by this point and the user
 * can complete dependencies by hand if needed.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
  });
  return r.status === 0 ? r.stdout.trim().split("\n")[0] : null;
}

function isAgentBrowserCliInstalled() {
  if (!which("agent-browser")) return false;
  const r = spawnSync("agent-browser", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

function isAgentBrowserSkillInstalled(projectRoot) {
  return fs.existsSync(path.join(projectRoot, ".claude", "skills", "agent-browser"));
}

/** Try to detect whether `npm install -g` will need sudo on this system. */
function npmGlobalNeedsSudo() {
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

function runCmd({ cmd, args, label, log, err }) {
  log && log(`  $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: "inherit" });
  if (r.status === 0) {
    log && log(`  ✓ ${label}`);
    return { ok: true };
  }
  err && err(`  ✗ ${label} failed (exit ${r.status})`);
  return { ok: false, status: r.status };
}

/**
 * Install the vercel-labs/agent-browser skill via `npx skills add`.
 * `npx -y` auto-fetches the `skills` command if missing.
 */
function installAgentBrowserSkill({ projectRoot, log, err }) {
  if (isAgentBrowserSkillInstalled(projectRoot)) {
    log && log("  ✓ agent-browser skill already present");
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

/**
 * Install the agent-browser CLI globally. If the global npm prefix isn't
 * writable, fall back to printing a sudo command rather than running sudo
 * ourselves (running sudo from a script is rude).
 */
function installAgentBrowserCli({ log, err }) {
  if (isAgentBrowserCliInstalled()) {
    log && log("  ✓ agent-browser CLI already installed");
    return { ok: true, skipped: true };
  }
  const needsSudo = npmGlobalNeedsSudo();
  if (needsSudo === true) {
    err && err("  ⚠ npm global prefix is not writable. Run manually:");
    err && err("      sudo npm install -g agent-browser");
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

/**
 * Copy .mcp.json.example → .mcp.json so the user has a real config to edit.
 * Idempotent: skip if .mcp.json already exists.
 */
function setupMcpJson({ projectRoot, log, err }) {
  const example = path.join(projectRoot, ".mcp.json.example");
  const real = path.join(projectRoot, ".mcp.json");
  if (!fs.existsSync(example)) {
    return { ok: false, reason: "no-example" };
  }
  if (fs.existsSync(real)) {
    log && log("  ✓ .mcp.json already exists (not overwriting)");
    return { ok: true, skipped: true };
  }
  try {
    fs.copyFileSync(example, real);
    log && log("  ✓ copied .mcp.json.example → .mcp.json");
    return { ok: true, copied: true };
  } catch (e) {
    err && err(`  ✗ copy failed: ${e.message}`);
    return { ok: false, error: e };
  }
}

/**
 * Top-level: prompt + install dependencies for whatever stacks were selected.
 * Returns a summary { installed: string[], skipped: string[], failed: [{step, hint}] }.
 */
async function installDependencies({ stacks, projectRoot, prompts, log, err }) {
  const summary = { installed: [], skipped: [], failed: [] };
  const wantsFrontendDeps = stacks.includes("frontend");

  // ── Frontend: agent-browser ────────────────────────────────────────────
  if (wantsFrontendDeps) {
    log && log("\n── Frontend dependencies (Inspector Clouseau / browser QA) ──");
    log && log("This installs:");
    log && log("  • vercel-labs/agent-browser skill (Claude Code skill)");
    log && log("  • agent-browser CLI (`npm i -g agent-browser`)");

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
      summary.failed.push({ step: "agent-browser CLI",   hint: "npm install -g agent-browser" });
    }
  }

  // ── MCP: copy example to real ─────────────────────────────────────────
  if (fs.existsSync(path.join(projectRoot, ".mcp.json.example"))) {
    log && log("\n── MCP setup ──");
    log && log("Copying .mcp.json.example → .mcp.json so you can fill in secrets.");
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

module.exports = {
  installDependencies,
  installAgentBrowserSkill,
  installAgentBrowserCli,
  setupMcpJson,
  isAgentBrowserCliInstalled,
  isAgentBrowserSkillInstalled,
  npmGlobalNeedsSudo,
};
