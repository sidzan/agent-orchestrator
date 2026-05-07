import * as fs from "fs";
import * as path from "path";

/**
 * Read / merge / write `.claude/settings.json`.
 *
 * The bootstrap installs:
 *   - Hook scripts at .claude/hooks/<name>.sh
 *   - Wires those scripts as PostToolUse / SessionStart / Stop hook entries
 *     in .claude/settings.json
 *   - Optional env block (e.g. CLAUDE_CODE_DEFAULT_MODEL) for the project
 *
 * We never blindly overwrite an existing settings.json. If one is present we
 * read it, deep-merge our additions (idempotent — checks for the same hook
 * command before adding a duplicate), and write back. If it isn't present,
 * we create it with just our additions.
 *
 * If the existing file isn't valid JSON, we abort the merge and print a
 * loud warning rather than silently overwriting the user's broken-but-
 * intentional file.
 */

export interface HookEntry {
  type: "command";
  command: string;
}

export interface HookMatcher {
  matcher?: string;
  hooks: HookEntry[];
}

export interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  env?: Record<string, string>;
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
  };
  [key: string]: unknown;
}

export interface HookPlan {
  /** A short identifier — for `[skipped: already wired]` logs. */
  id: string;
  /** The trigger event Claude Code dispatches. */
  event: "PostToolUse" | "PreToolUse" | "SessionStart" | "Stop" | "CwdChanged" | "WorktreeCreate";
  /** Optional matcher (regex) for tool-name filtering. */
  matcher?: string;
  /** The shell command to run. */
  command: string;
}

export interface MergeArgs {
  projectRoot: string;
  hooks: HookPlan[];
  env?: Record<string, string>;
  permissionsAllow?: string[];
  log?: (msg: string) => void;
  err?: (msg: string) => void;
}

export interface MergeResult {
  ok: boolean;
  created: boolean;
  hooksAdded: string[];
  hooksAlreadyPresent: string[];
  envAdded: string[];
  envAlreadyPresent: string[];
  permissionsAdded: string[];
  warning?: string;
}

function readSettings(file: string): { ok: true; value: ClaudeSettings; existed: boolean } | { ok: false; reason: string } {
  if (!fs.existsSync(file)) return { ok: true, value: {}, existed: false };
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (raw.trim() === "") return { ok: true, value: {}, existed: true };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, reason: "settings.json must be a JSON object" };
    }
    return { ok: true, value: parsed as ClaudeSettings, existed: true };
  } catch (e) {
    return { ok: false, reason: `settings.json is not valid JSON: ${(e as Error).message}` };
  }
}

function hookAlreadyPresent(group: HookMatcher[], plan: HookPlan): boolean {
  for (const m of group) {
    if (m.matcher !== plan.matcher) continue;
    for (const h of m.hooks) {
      if (h.command === plan.command) return true;
    }
  }
  return false;
}

function addHookToGroup(group: HookMatcher[], plan: HookPlan): void {
  // Try to find a matching matcher entry first (to keep the file compact).
  for (const m of group) {
    if (m.matcher === plan.matcher) {
      m.hooks.push({ type: "command", command: plan.command });
      return;
    }
  }
  // No matching matcher — append a new entry.
  const entry: HookMatcher = { hooks: [{ type: "command", command: plan.command }] };
  if (plan.matcher !== undefined) entry.matcher = plan.matcher;
  group.push(entry);
}

export function mergeSettings(args: MergeArgs): MergeResult {
  const { projectRoot, hooks, env, permissionsAllow, log, err } = args;
  const claudeDir = path.join(projectRoot, ".claude");
  const settingsFile = path.join(claudeDir, "settings.json");

  const read = readSettings(settingsFile);
  if (!read.ok) {
    err?.(`  ✗ ${read.reason}`);
    err?.(`  Refusing to overwrite a malformed settings.json. Fix or delete it, then re-run.`);
    return {
      ok: false,
      created: false,
      hooksAdded: [],
      hooksAlreadyPresent: [],
      envAdded: [],
      envAlreadyPresent: [],
      permissionsAdded: [],
      warning: read.reason,
    };
  }

  const settings = read.value;
  const created = !read.existed;

  // ── Hooks ───────────────────────────────────────────────────────────────
  settings.hooks ??= {};
  const hooksAdded: string[] = [];
  const hooksAlreadyPresent: string[] = [];
  for (const plan of hooks) {
    settings.hooks[plan.event] ??= [];
    const group = settings.hooks[plan.event] as HookMatcher[];
    if (hookAlreadyPresent(group, plan)) {
      hooksAlreadyPresent.push(plan.id);
      continue;
    }
    addHookToGroup(group, plan);
    hooksAdded.push(plan.id);
  }

  // ── Env ─────────────────────────────────────────────────────────────────
  const envAdded: string[] = [];
  const envAlreadyPresent: string[] = [];
  if (env && Object.keys(env).length > 0) {
    settings.env ??= {};
    for (const [k, v] of Object.entries(env)) {
      if (k in settings.env) {
        envAlreadyPresent.push(k);
        continue;
      }
      settings.env[k] = v;
      envAdded.push(k);
    }
  }

  // ── Permissions allow-list (additive) ──────────────────────────────────
  const permissionsAdded: string[] = [];
  if (permissionsAllow && permissionsAllow.length > 0) {
    settings.permissions ??= {};
    settings.permissions.allow ??= [];
    for (const rule of permissionsAllow) {
      if (settings.permissions.allow.includes(rule)) continue;
      settings.permissions.allow.push(rule);
      permissionsAdded.push(rule);
    }
  }

  // ── Write back ──────────────────────────────────────────────────────────
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");

  if (created) log?.(`  ✓ created .claude/settings.json`);
  else log?.(`  ✓ merged into existing .claude/settings.json`);
  if (hooksAdded.length) log?.(`    + hooks: ${hooksAdded.join(", ")}`);
  if (hooksAlreadyPresent.length) log?.(`    • hooks already wired: ${hooksAlreadyPresent.join(", ")}`);
  if (envAdded.length) log?.(`    + env: ${envAdded.join(", ")}`);
  if (envAlreadyPresent.length) log?.(`    • env already set: ${envAlreadyPresent.join(", ")}`);
  if (permissionsAdded.length) log?.(`    + permissions: ${permissionsAdded.join(", ")}`);

  return {
    ok: true,
    created,
    hooksAdded,
    hooksAlreadyPresent,
    envAdded,
    envAlreadyPresent,
    permissionsAdded,
  };
}

/**
 * The default hook plan written by the bootstrap. Shell scripts must already
 * exist at .claude/hooks/<name>.sh (installed via lib/install installHooks).
 *
 * `$CLAUDE_PROJECT_DIR` is a Claude Code-provided env var that resolves to
 * the active project root, so the hooks work across worktrees.
 */
export function defaultHookPlan(): HookPlan[] {
  const base = "$CLAUDE_PROJECT_DIR/.claude/hooks";
  return [
    {
      id: "lint-on-save",
      event: "PostToolUse",
      matcher: "Edit|Write|MultiEdit",
      command: `${base}/lint-on-save.sh`,
    },
    {
      id: "worktree-setup",
      event: "SessionStart",
      command: `${base}/worktree-setup.sh`,
    },
    {
      id: "enforce-task-update",
      event: "Stop",
      command: `${base}/enforce-task-update.sh`,
    },
  ];
}
