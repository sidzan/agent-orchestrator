# Agent Bootstrap — Design Spec

**Date:** 2026-05-06
**Status:** Approved for implementation planning (v2 — post-grilling)
**Package:** `agent-bootstrap` (`sidzan/agent-bootstrap` on GitHub + npm)

---

## Problem

Multi-agent orchestration skills like `implement-app` (frontend, React/TypeScript) and `implement-backend` (C#/.NET) deliver real value, but they are hardwired to one project: app names, ports, pnpm filters, OData patterns, SonarQube keys, Jira keys (`PROJ`), and namespace conventions (`<vendor>_<source-project>-*`) are embedded directly in skill files.

Every new project that wants the same orchestration loop has to copy and hand-edit those files. There is no clean distribution mechanism.

The goal: a single CLI that drops a fresh, project-tailored copy of the orchestrator skill (and its bundled support skills, hooks, and MCP template) into any React or C# project, with project specifics filled in at install time.

---

## Goals

- Personal use across the author's React and C# projects
- Shareable publicly later (other developers on React or C# stacks)
- Zero-config for the common case; integrations (Jira, Sonar, hooks) opt-in via prompts
- Works offline — no AI API call required
- Installed skills are concrete and human-editable (no template markers left behind)

## Non-Goals (v1)

- Stack support outside React (TypeScript) and C#
- A built-in update / reconfigure mechanism (deferred — see TODO)
- Replacing or modifying the original <SourceProject> skills (the local `implement-app/` reference stays gitignored)
- Auto-generating architecture documentation (user edits the EDIT-ME starter references)
- Non-Claude-Code agent harnesses

---

## Reference material

`implement-app/` at this repo's root is a local copy of the original <SourceProject> frontend skill (gitignored). The C# counterpart lives at `/home/sijan/work/<source-project>-backend/.claude/skills/implement-backend/`. Both are sources of truth for gate sequences, personas, and pipeline structure. Generalization for `templates/` derives from these — they are never modified or committed.

---

## Solution overview

A single npm package with two parts:

1. **CLI** (`bin/bootstrap.js`) — Node.js, zero npm dependencies. Three passes: structural inference → confirmation → integration prompts. Then renders templates with install-time substitution and writes concrete files into `.claude/`.
2. **Bundled templates** under `templates/` — frontend orchestrator, backend orchestrator, three shared support skills, three hooks, and per-stack `.mcp.json.example` files.

The CLI is invoked once per project: `npx agent-bootstrap@latest`. All substitution happens during that run; nothing template-shaped is left behind.

---

## Scope: stacks supported

| Stack | Detection signals | Skill installed |
|---|---|---|
| React (TypeScript) | `package.json` with `react` / `react-admin` / `next` deps; lockfile (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`); workspace files for monorepos (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `workspaces` key) | `implement-app` |
| C# | Any `*.sln` OR any `*.csproj` (recursive); secondary probe for migration tool: `flyway.conf` → Flyway, `EntityFrameworkCore` package ref → EF Core, otherwise ask | `implement-backend` |
| Mixed monorepo (both above present in distinct directories) | Both signal sets matched independently | Both skills |
| Anything else | — | **Hard abort** with message: *"agent-bootstrap supports React and C# projects only. Detected: <signals>. Aborting."* |

---

## CLI flow

```
1. Verify cwd is a project root (has package.json OR *.sln / *.csproj). Abort if not.
2. Stack selection prompt:    Install for: [F]rontend / [B]ackend / [Both]?
3. Pass 1 — Structural inference (silent file parsing) for each selected stack.
4. Pass 2 — Confirmation: print inferred values, allow inline edit per section.
5. Pass 3 — Integration prompts:
     - Jira         (Y/n)  → base URL, project key       [shared across stacks]
     - SonarQube    (Y/n)  → project key                  [per-stack if both]
     - Hooks        (Y/n)  → install lint-on-save, worktree-setup, enforce-task-update
     - MCP template (Y/n)  → write .mcp.json.example at repo root
6. Conflict check: if a target skill directory already exists, prompt for a new
   name. Cascade the rename through internal references in the rendered SKILL.md.
7. Render templates with install-time substitution → write concrete files into
   .claude/skills/<name>/, .claude/hooks/, .mcp.json.example as applicable.
8. Print success summary and post-install next steps (see "Post-install output").
```

All prompt inputs default to "yes" or to inferred values. The user presses Enter through the easy path.

### Pass 1 — structural inference

Reads files only. Detects:

| Signal | Source |
|---|---|
| Package manager (frontend) | Lockfile presence |
| Monorepo (frontend) | `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `workspaces` key |
| App names + paths | Glob workspace entries; read each app's `package.json` |
| Ports | Parse `--port NNNN` from each app's `scripts.dev`; default `3000` if missing |
| Frontend commands | `scripts.dev`, `scripts.test`, `scripts.lint`, `scripts.build`, `scripts.typecheck` |
| pnpm filters | `name` field from each app's `package.json` |
| Frontend tech stack | `dependencies` / `devDependencies` keys (`react-admin`, `next`, `vite`, `vitest`, `jest`, `tailwind`, `mui`, …) |
| C# project paths | Any `*.csproj` (recursive); group by directory under `src/` and `tests/` if present |
| Solution file | First `*.sln` at root |
| C# migration tool | `flyway.conf` (root) → Flyway; `EntityFrameworkCore` package in any `.csproj` → EF Core; otherwise ask |
| C# commands | Defaults: `dotnet test`, `dotnet build`, `dotnet format`. User overrides in Pass 2. |

Single-repo frontend (no monorepo signal): one app entry created using root `package.json` with `path: "."`.

### Pass 2 — confirmation

Prints inferred config grouped by section. User accepts each with Enter or types a correction inline. For monorepos: lists discovered apps with checkboxes — user can deselect apps the skill should not cover.

### Pass 3 — integration prompts

```
Add Jira integration?           (Y/n)
  → Atlassian base URL: [https://myco.atlassian.net]
  → Jira project key:   [PROJ]

Add SonarQube?                  (Y/n)             # asked once per stack if Both
  → SonarQube project key: [myco_my-frontend]

Install recommended hooks?      (Y/n)
  → lint-on-save, worktree-setup, enforce-task-update

Write .mcp.json.example?        (Y/n)
```

When an integration is declined, the corresponding gate steps are **omitted from the rendered skill** (install-time conditional rendering, see "Substitution model"). Nothing about Jira / Sonar / browser QA appears in a SKILL.md when the user declined that integration.

---

## Install policy: fresh, rename on conflict

- The CLI **never merges** with or updates an existing installation.
- If `.claude/skills/<skill-name>/` already exists, prompt for a new name (default suggestion: `<name>-v2`). The user's existing skill is untouched.
- A rename cascades through the rendered orchestrator's `SKILL.md` so internal references (`invoke jira-tracking`, etc.) point at the renamed copies the CLI just wrote.
- No `--update` mode in v1. To pull in a newer template, the user re-runs the CLI, which produces a fresh `<name>-v2/` they can hand-merge with their old install.

> **TODO (post-v1):** evaluate an update path. Likely shape: `npx agent-bootstrap@latest --replace` with explicit user confirmation, or per-file diff workflow. Out of scope for v1.

---

## Substitution model: install-time only

All `{{CONFIG.*}}` markers and `{{#if integration.enabled}}…{{/if}}` blocks are rendered **by the CLI**, at install time, into concrete output files. The installed skill contains:

- Real commands (`pnpm run admin`, `dotnet test`)
- Real ports, paths, project keys
- Only the gate steps for integrations the user opted into

No `project.config.json` lives in the user's repo. No template syntax remains in the installed files. This eliminates a class of runtime bugs (Claude forgetting to substitute, conditional blocks mis-rendered) and removes per-invocation token cost.

The user is free to edit installed skill files directly — they read like hand-written content.

### Substitution map (illustrative)

| Template marker | Source |
|---|---|
| `{{CONFIG.apps[0].path}}` | Pass 1 detection / Pass 2 confirmation |
| `{{CONFIG.apps[0].devCommand}}` | `scripts.dev` from `package.json` |
| `{{CONFIG.apps[0].pnpmFilter}}` | `name` from app's `package.json` |
| `{{CONFIG.apps[0].port}}` | Parsed from dev script |
| `{{CONFIG.integrations.jira.projectKey}}` | Pass 3 input |
| `{{CONFIG.integrations.sonar.projectKey}}` | Pass 3 input (per-stack) |
| `{{CONFIG.browserQA.authStatePath}}` | Default `~/.agent-browser/`, prompted in Pass 3 |

### Conditional blocks

Rendered or omitted at install time:

```
{{#if integrations.jira.enabled}} ... G0 Jira step ... {{/if}}
{{#if integrations.sonar.enabled}} ... G7 Sonar gate ... {{/if}}
{{#if browserQA.enabled}} ... Inspector Clouseau gate ... {{/if}}   (frontend always-true)
```

If `integrations.jira.enabled` is false, the rendered SKILL.md contains no reference to Jira, jira-runner, or Atlassian MCP. The `jira-tracking` support skill is also skipped from the install set.

---

## Bundled artifacts

### Skills

Frontend install (`templates/frontend/` + `templates/shared/`):

```
.claude/skills/
├── implement-app/         ← orchestrator (gates G0–G10, teams, pipelines, references, templates)
├── jira-tracking/         ← shared support
├── create-pull-request/   ← shared support
└── sonar-fix/             ← shared support
```

Backend install (`templates/backend/` + `templates/shared/`):

```
.claude/skills/
├── implement-backend/     ← orchestrator (different personas, SQL assets, migration references)
├── jira-tracking/
├── create-pull-request/
└── sonar-fix/
```

Both selected → both orchestrators side by side; the three support skills are written once.

### Inspector Clouseau (browser QA, frontend only)

Always included in the frontend orchestrator. Adds:

- `teams/clouseau.md` persona file
- A G6-ish browser-QA gate in `SKILL.md`
- An auth-state path config (default `~/.agent-browser/`)

`agent-browser` itself is **not bundled** — it is a Vercel-published skill plus a CLI tool. Post-install message instructs the user to run:

```
npx skills add vercel-labs/agent-browser
npm i -g agent-browser
```

### Hooks (opt-in)

`templates/hooks/` → `.claude/hooks/`:

- `lint-on-save.sh`
- `worktree-setup.sh`
- `enforce-task-update.sh`

`cleanup-mcp-containers.sh` and `db-trigger-migration-generator.md` (project-specific) are intentionally excluded.

### MCP template

`templates/mcp/` provides:

- `mcp.json.example.frontend` — Atlassian + Bitbucket + Lokalise
- `mcp.json.example.backend`  — Atlassian + Bitbucket

When "Both" is selected, the union (Atlassian + Bitbucket + Lokalise) is written.

The CLI writes the chosen template to `.mcp.json.example` at the repo root. The user copies to `.mcp.json` and fills in secrets manually.

### Architecture references

Frontend ships starter `references/` (list / detail / form / filters / shared-components / testing) **with `EDIT-ME` framing**. Each begins with:

> *This is a starter pattern document derived from a React-Admin + OData project. Replace the contents with the conventions used in your codebase. The skill instructs agents to read this file before implementing matching feature types — keep that contract, change the contents.*

Backend ships an analogous starter `references/migration-guide.md` (Flyway version OR EF Core version, picked by detection; falls back to a stub if migration tool is "none").

---

## "Both" case: shared vs. per-stack config

| Item | Shared | Per-stack |
|---|---|---|
| Jira base URL + project key | ✓ | |
| Hooks install | ✓ | |
| `.mcp.json.example` | ✓ (union) | |
| App path / port / commands | | ✓ |
| Sonar project key | | ✓ |
| Browser QA auth state | | ✓ (frontend only) |

Shared values are prompted once. Per-stack values are prompted twice with stack-prefixed labels (`Frontend Sonar key:`, `Backend Sonar key:`).

---

## Repo / package layout

```
agent-bootstrap/
├── bin/
│   └── bootstrap.js              ← CLI entry point (≤300 lines, zero npm deps)
├── lib/
│   ├── detect.js                 ← stack detection (React signals, .sln/.csproj, monorepo)
│   ├── prompts.js                ← interactive prompts (readline)
│   ├── substitute.js             ← {{CONFIG.*}} + {{#if}} renderer
│   └── install.js                ← copy + write files
├── templates/
│   ├── frontend/
│   │   └── implement-app/        ← orchestrator + Clouseau persona + EDIT-ME references
│   ├── backend/
│   │   └── implement-backend/    ← orchestrator + EDIT-ME migration guide
│   ├── shared/
│   │   ├── jira-tracking/
│   │   ├── create-pull-request/
│   │   └── sonar-fix/
│   ├── hooks/
│   │   ├── lint-on-save.sh
│   │   ├── worktree-setup.sh
│   │   └── enforce-task-update.sh
│   └── mcp/
│       ├── mcp.json.example.frontend
│       └── mcp.json.example.backend
├── package.json
└── README.md
```

Constraint: `bin/bootstrap.js` stays ≤300 lines. Logic that overflows belongs under `lib/`. Zero external npm dependencies (Node built-ins only: `fs`, `path`, `readline`, `child_process`).

---

## Post-install output

After a successful install, the CLI prints a tailored next-steps block. Example for a frontend install with all integrations enabled:

```
✔ Installed at .claude/skills/implement-app, jira-tracking, create-pull-request, sonar-fix
✔ Wrote .mcp.json.example
✔ Installed hooks: lint-on-save, worktree-setup, enforce-task-update

Next steps:
  1. Install agent-browser skill:  npx skills add vercel-labs/agent-browser
  2. Install agent-browser CLI:    npm i -g agent-browser
  3. Configure MCP:                cp .mcp.json.example .mcp.json   (fill secrets)
  4. Edit references in .claude/skills/implement-app/references/ to match your stack
  5. Try it:                       /implement-app  (in Claude Code)
```

The post-install block is generated from the actual install set (skipped pieces aren't mentioned).

---

## Error handling

| Scenario | Behaviour |
|---|---|
| No `package.json`, no `.sln`, no `.csproj` in cwd | Hard abort: *"Not a project directory. Run from a React or C# project root."* |
| Detected stack is not React or C# | Hard abort with detected-signal summary |
| Workspace glob (frontend) matches no apps | Fall back to single-app mode, warn user |
| Port not parseable from `scripts.dev` | Default to `3000`, flag in Pass 2 for correction |
| `.claude/skills/<name>/` already exists | Prompt for new name (default `<name>-v2`); rename cascades |
| Jira / Sonar opted in but key blank | Treat as opted out, print warning |
| C# migration tool can't be auto-detected | Ask user: *Migration tool? [flyway / efcore / none]* |

---

## Open / deferred items

1. **`--update` workflow** — deferred to post-v1. Today: re-run, get `<name>-v2`, hand-merge.
2. **Stack expansion** — adding Python / Go / Rust later means: new detection branch in `lib/detect.js`, new templates under `templates/<stack>/`, new entry in the stack-selection prompt.
3. **Auth state path schema** — currently a single string for browser QA. If multi-environment (dev / staging) auth becomes common, expand to a map.
4. **Versioning strategy** — npm semver. Major bumps for breaking template changes (gate-sequence reordering, persona renames). Minor for additive (new persona, new hook). Patch for typo fixes. To be formalised in CONTRIBUTING when published.

---

## Manual test matrix (no automated tests in v1)

| Scenario | Expected |
|---|---|
| React monorepo (pnpm + turbo) | Multiple apps detected, deselectable, all rendered into App Parameter Table |
| React single-repo (npm) | One app entry, `path: "."`, no pnpm filter |
| C# repo with `.sln` + Flyway | Backend skill installed; Flyway migration reference selected |
| C# repo with `.csproj` only + EF Core | Backend skill installed; EF Core migration reference selected |
| C# repo with no migration tool | User prompted; "none" option ships stub reference |
| Mixed monorepo (React app + C# `.sln`) | Both skills installed; Jira / hooks / MCP prompted once each |
| Python repo (no React, no C#) | Hard abort with stack-detection message |
| Existing `.claude/skills/implement-app/` | Rename prompt with default `implement-app-v2`; cascade through references |
| Jira declined | No jira-tracking skill installed; no Jira gate steps in SKILL.md; MCP example omits nothing (Atlassian MCP still useful) |
| Sonar declined | No sonar-fix skill installed; no G7 Sonar block in SKILL.md |
| Hooks declined | `.claude/hooks/` not touched |
| MCP template declined | No `.mcp.json.example` written; post-install message skips MCP step |
