/**
 * Persona → Claude Code agent mapping.
 *
 * Each entry produces a `.claude/agents/<name>.md` file at install time so
 * that when the orchestrator's SKILL.md says "spawn @indiana", Claude Code
 * recognises the persona as a registered subagent type rather than falling
 * back to general-purpose.
 *
 * The body of each agent file is sourced from the matching team-file in the
 * orchestrator skill's `teams/` directory (frontend) or `references/`
 * (backend), with proper agent frontmatter prepended on copy.
 *
 * Model assignment is part of the kernel methodology (Opus for judgment
 * roles, Sonnet for workers, Haiku for the high-volume Jira mirror).
 */

export interface AgentDef {
  /** Filename (without .md) at .claude/agents/<name>.md and as subagent_type. */
  name: string;
  /** Source team-file relative to the orchestrator template root. */
  sourceFile: string;
  /** One-line description for Claude Code's subagent picker. */
  description: string;
  /** Model tier — opus | sonnet | haiku. */
  model: "opus" | "sonnet" | "haiku";
  /** Optional explicit tool allow-list. Defaults to inheriting parent context. */
  tools?: string;
}

export const FRONTEND_AGENTS: readonly AgentDef[] = [
  {
    name: "indiana",
    sourceFile: "teams/explorer.md",
    description:
      "Senior software engineer / code archaeologist. Use when the orchestrator needs an Exploration Passport: where similar features live in this codebase, the closest existing pattern, gotchas observed in adjacent code. Evidence-based with file paths and line numbers.",
    model: "sonnet",
  },
  {
    name: "the-oracle",
    sourceFile: "teams/decision-maker.md",
    description:
      "Senior decision maker. Use at DM-1 (scope assessment) and DM-2 (plan ratification) gates. Stops bad ideas early and greenlights good ones fast. Returns SCOPE / VERDICT verdicts only.",
    model: "opus",
  },
  {
    name: "gordon",
    sourceFile: "teams/eng-reviewer.md",
    description:
      "Engineering reviewer (high standards, brutally honest). Use to review architecture and design plans before implementation. Returns APPROVE / BLOCK with concrete reasons.",
    model: "opus",
  },
  {
    name: "picasso",
    sourceFile: "teams/design-reviewer.md",
    description:
      "Visual / UI design reviewer. Use when there is rendered UI in scope: visual consistency, spacing, hierarchy, AI slop. Designer's eye, zero tolerance for ugly.",
    model: "opus",
  },
  {
    name: "sheep",
    sourceFile: "teams/implementer.md",
    description:
      "Implementer (no philosophy, just code). Use to execute IMP tasks from the plan exactly as specified. Calls superpowers:executing-plans first, then writes code per assigned task. Forbidden from running tests/lint/typecheck — Sentinel does that at G7.",
    model: "sonnet",
  },
  {
    name: "paranoid-pete",
    sourceFile: "teams/test-writer.md",
    description:
      "Test writer (every edge case is a personal attack). Use during RED phase to write failing tests before implementation. Trusts nothing; covers happy path, errors, edges, race conditions.",
    model: "sonnet",
  },
  {
    name: "sentinel",
    sourceFile: "teams/verifier.md",
    description:
      "Verifier / quality gate (G7). Use after implementation to invoke Skill code-quality and interpret the verdict. Does NOT re-implement rules — only runs audit and reports Health Score.",
    model: "sonnet",
  },
  {
    name: "inspector-clouseau",
    sourceFile: "teams/browser-qa.md",
    description:
      "Browser QA persona. Use when a feature has rendered UI that needs end-to-end verification. Drives a real browser via the agent-browser skill, captures screenshots, asserts on rendered state.",
    model: "sonnet",
  },
  {
    name: "scribe",
    sourceFile: "teams/jira-runner.md",
    description:
      "Jira mirror (single-purpose, runs on Haiku to avoid burning Opus tokens on MCP boilerplate). Use to invoke jira-tracking with a pre-written payload and report the result in one line. NEVER invoke jira-tracking inline on the team lead.",
    model: "haiku",
  },
];

export const BACKEND_AGENTS: readonly AgentDef[] = [
  {
    name: "indiana",
    sourceFile: "references/explorer.md",
    description:
      "Senior software engineer / code archaeologist. Use when the orchestrator needs an Exploration Passport for the C# backend: closest existing handler/feature, where domain types live, the DI registration pattern, migration version state. Evidence-based with paths.",
    model: "sonnet",
  },
  {
    name: "the-oracle",
    sourceFile: "references/decision-maker.md",
    description:
      "Senior decision maker for backend work. Use at DM-1 (scope) and DM-2 (plan ratification) gates. Returns SCOPE / VERDICT verdicts.",
    model: "opus",
  },
  {
    name: "sheep",
    sourceFile: "references/implementer.md",
    description:
      "Backend implementer. Executes IMP tasks per plan: handlers, DI, migrations, controller wiring. Calls superpowers:executing-plans first. Forbidden from running tests/build/format — Sentinel does that at G7.",
    model: "sonnet",
  },
  {
    name: "paranoid-pete",
    sourceFile: "references/test-writer.md",
    description:
      "Backend test writer. Use during RED phase: integration tests + unit tests before implementation. Covers happy path, error paths, multi-API surfaces, transactional behaviour.",
    model: "sonnet",
  },
  {
    name: "sentinel",
    sourceFile: "references/verifier.md",
    description:
      "Backend verifier / G7 gate. Runs build + format + tests via Skill code-quality, interprets verdict, returns Health Score.",
    model: "sonnet",
  },
  {
    name: "scribe",
    sourceFile: "references/jira-runner.md",
    description:
      "Jira mirror for backend pipeline (Haiku, single-purpose). Use to invoke jira-tracking with payloads and report result.",
    model: "haiku",
  },
];

/** Build the agent-file frontmatter + body for a given persona. */
export function renderAgentFile(def: AgentDef, sourceBody: string): string {
  const fm = [
    "---",
    `name: ${def.name}`,
    `description: ${def.description.replace(/\n/g, " ")}`,
    `model: ${def.model}`,
    ...(def.tools ? [`tools: ${def.tools}`] : []),
    "---",
    "",
  ].join("\n");
  return fm + sourceBody.replace(/^---[\s\S]*?---\s*\n/, "").trimStart();
}
