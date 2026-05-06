# Agent Bootstrap — Design Spec

**Date:** 2026-05-06
**Status:** Approved for implementation planning

---

## Problem

`/implement-app` is a highly effective multi-agent orchestration skill (gates G0–G10, named team personas, Jira/SonarQube integration, artifact convention). But it is hardwired to the <source-project> project: specific app names, ports, pnpm filters, OData patterns, and SonarQube keys are embedded directly in the skill files.

The goal is a distribution mechanism that lets any developer drop a project-tailored equivalent of this skill into any codebase — monorepo or single-repo, any stack — without manual editing.

---

## Goals

- Personal use today (other projects the author works on)
- Shareable publicly later (any developer, any stack)
- Zero-config for the common case; opt-in for integrations
- Works offline (no AI API call required for basic scaffold)

## Non-Goals

- Replacing or modifying the existing <source-project> `implement-app` skill
- Supporting non-Claude-Code agent harnesses (out of scope for v1)
- Auto-generating architecture reference docs (user writes those manually)

---

## Solution Overview

A single npm package (`agent-bootstrap`) with two responsibilities:

1. **A Node.js CLI** (`npx agent-bootstrap@latest`) that discovers the project structure and writes a `project.config.json`
2. **A generic core skill** (`core/implement-app/`) that is the project-agnostic version of `implement-app`, copied into `.claude/skills/implement-app/` during bootstrap

The per-project `project.config.json` is the only generated artifact that varies between projects. The core skill files are versioned in the npm package and updated via `npx agent-bootstrap@latest --update`.

---

## Package Structure

```
agent-bootstrap/
├── bin/
│   └── bootstrap.js          ← CLI entry point (Node.js, ~300 lines, zero deps)
├── core/
│   └── implement-app/
│       ├── SKILL.md           ← generic skill with {{CONFIG.*}} references
│       ├── teams/             ← Indiana, Sheep, Pete, Sentinel, Clouseau, Gordon, Oracle, Scribe
│       ├── pipelines/         ← feature-fast, feature-full, bug-fast, bug-full, idea
│       ├── references/        ← task-tracking, arch references (generic)
│       └── templates/         ← generic component/service/test templates
└── package.json
```

Result in target project after bootstrap:

```
.claude/skills/implement-app/
├── SKILL.md
├── teams/
├── pipelines/
├── references/
├── templates/
└── project.config.json       ← generated, project-specific
```

---

## CLI — `bin/bootstrap.js`

### Invocation

```bash
npx agent-bootstrap@latest             # first-time setup
npx agent-bootstrap@latest --update    # re-copy core files, keep config
npx agent-bootstrap@latest --reconfigure  # re-run discovery, merge into config
```

### Flow

```
1. Verify cwd contains package.json → abort with message if not
2. Pass 1: Structural inference (Node.js file parsing, silent)
3. Pass 2: Confirmation prompt (user confirms or edits inferred values)
4. Pass 3: Integration prompts (Jira Y/n, SonarQube Y/n — both default YES)
5. Copy core/implement-app/ → .claude/skills/implement-app/
6. Write .claude/skills/implement-app/project.config.json
7. Print success message
```

### Pass 1 — Structural Inference

Reads files only, no user input:

| Signal | Source |
|--------|--------|
| Package manager | Lockfile presence (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`) |
| Monorepo detection | `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, or `workspaces` key in root `package.json` |
| App names + paths | Glob workspace entries, read each app's `package.json` |
| Ports | Parse `--port NNNN` from each app's `scripts.dev` |
| Commands | `scripts.dev`, `scripts.test`, `scripts.lint`, `scripts.build`, `scripts.typecheck` per app and root |
| pnpm filters | `name` field from each app's `package.json` |
| Tech stack | `dependencies` / `devDependencies` keys (react-admin, next, vite, vitest, jest, tailwind, mui, etc.) |

**Single-repo detection:** if none of the monorepo signals are present, one app entry is created using root `package.json` with `path: "."`.

### Pass 2 — Confirmation Prompt

Prints inferred config as a readable summary. User presses Enter to accept each section or types a correction inline. Sections: Project info → Apps (checkboxes to deselect) → Commands → Stack.

For monorepos: lists all discovered apps with checkboxes. User can deselect apps they don't want the skill to cover.

### Pass 3 — Integration Prompts

```
Add Jira integration? (Y/n)
  → Atlassian base URL: [https://myco.atlassian.net]
  → Jira project key: [PROJ]

Add SonarQube? (Y/n)
  → SonarQube project key: [myco_my-project]
```

Both default to **yes**. If declined, the corresponding config block is set to `enabled: false` and the skill conditionally omits all Jira/Sonar steps at invocation.

---

## `project.config.json` Schema

```json
{
  "project": {
    "name": "my-backoffice",
    "packageManager": "pnpm",
    "monorepo": true
  },
  "apps": [
    {
      "name": "admin",
      "path": "apps/admin",
      "port": 8000,
      "pnpmFilter": "@myco/admin",
      "devCommand": "pnpm run admin",
      "testCommand": "pnpm run test:admin",
      "lintCommand": "pnpm run --filter=@myco/admin lint:fix",
      "typecheckCommand": "pnpm run --filter=@myco/admin typecheck",
      "sonarPathPrefix": "apps/admin/src/"
    }
  ],
  "stack": {
    "framework": "react-admin",
    "buildTool": "vite",
    "testRunner": "vitest",
    "styling": "mui"
  },
  "integrations": {
    "jira": {
      "enabled": true,
      "baseUrl": "https://myco.atlassian.net",
      "projectKey": "PROJ"
    },
    "sonar": {
      "enabled": true,
      "projectKey": "myco_my-backoffice"
    }
  }
}
```

For single-repo projects: `monorepo: false`, single app entry with `path: "."`, `pnpmFilter` omitted.

---

## Generic Core Skill — `core/implement-app/SKILL.md`

### Config Preamble (added at top of SKILL.md)

```
## BEFORE ANYTHING ELSE
Read `project.config.json` in this skill directory.
Substitute all {{CONFIG.*}} references in this skill with the values found there.
If the file is missing, halt and tell the user to run `npx agent-bootstrap@latest`.
```

### Substitution Map

| <SourceProject> hardcoded value | Generic reference |
|------------------------|-------------------|
| `apps/admin/` | `{{CONFIG.apps[0].path}}` |
| `pnpm run admin` | `{{CONFIG.apps[0].devCommand}}` |
| `@<source-project>/admin` | `{{CONFIG.apps[0].pnpmFilter}}` |
| Port `8000` | `{{CONFIG.apps[0].port}}` |
| `PROJ` | `{{CONFIG.integrations.jira.projectKey}}` |
| `<vendor>_<source-project>-backoffice-web` | `{{CONFIG.integrations.sonar.projectKey}}` |
| App Parameter Table | Generated from full `{{CONFIG.apps}}` array |

### Conditional Blocks

Jira-gated sections are wrapped:

```
{{#if CONFIG.integrations.jira.enabled}}
...Step 0.a.i — Jira ticket, jira-runner delegation...
{{/if}}
```

SonarQube gates are wrapped:

```
{{#if CONFIG.integrations.sonar.enabled}}
...G7 SonarQube check, sonar gate steps...
{{/if}}
```

When disabled, Claude skips the block entirely. No jira-runner spawned, no Atlassian MCP calls, no SonarQube MCP calls.

### What Stays Identical

Everything that makes `implement-app` powerful is methodology, not project-specific:

- Gate sequence G0–G10 and their pass/fail conditions
- All team personas (Indiana, Sheep, Pete, Sentinel, Clouseau, Gordon, Oracle, Scribe)
- Artifact file convention (PRD → FEAT → SPEC → ADR, canonical paths, slug naming)
- Rationalization table and red-flag list
- Haiku-model constraint for jira-runner
- `superpowers:executing-plans` contract for every Sheep spawn
- `superpowers:brainstorming` mandatory gates

---

## Update Path

```bash
npx agent-bootstrap@latest --update
```

Re-copies `core/implement-app/` from the new package version into `.claude/skills/implement-app/`, preserving the existing `project.config.json`. All customizations in `project.config.json` survive the update.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| No `package.json` in cwd | Abort with: "Not a project directory. Run this from your project root." |
| Workspace glob matches no apps | Fall back to single-app mode, warn user |
| Port not parseable from dev script | Default to `3000`, flag for manual correction in Pass 2 |
| `.claude/skills/implement-app/` already exists | Prompt: "Skill already installed. Overwrite? (y/N)" |
| Jira/Sonar opted in but no key provided | Write `enabled: false`, print warning to add manually |

---

## Testing the CLI

Manual test matrix (no automated tests for v1):

| Scenario | Expected |
|----------|----------|
| Monorepo (pnpm + turbo) | Multiple apps detected, all listed in Pass 2 |
| Single-repo (npm) | One app entry, `path: "."`, no pnpmFilter |
| Monorepo, user deselects 2 of 3 apps | Config contains only selected app |
| Jira declined | `integrations.jira.enabled: false`, skill skips G0 Jira steps |
| SonarQube declined | `integrations.sonar.enabled: false`, skill skips G7 Sonar gate |
| `--update` with existing config | Config preserved, skill files refreshed |
| `--reconfigure` | Full Pass 1–3 re-runs, new values merged into config |

---

## Open Questions (resolve during implementation)

1. **Package name**: `agent-bootstrap` is a placeholder. Needs an npm-available name.
2. **Config location**: `project.config.json` sits inside `.claude/skills/implement-app/`. Alternative: `.claude/project.config.json` (shared across future skills). Revisit if a second skill is added.
3. **Stack-specific reference docs**: The <source-project> `implement-app` includes OData patterns, React-Admin patterns as `references/`. The generic version omits these. Should bootstrap optionally generate stub reference docs based on detected stack?
4. **Auth state file paths** for browser QA (`~/.agent-browser/*.json`): currently omitted. Add to config schema if Inspector Clouseau is included in the generic skill.
5. **`sonarPathPrefix` placement**: lives in each `apps[]` entry (per-app) rather than inside `integrations.sonar` (global). Correct for multi-app monorepos; confirm this is the right shape for single-repo projects where there is only one app.
