# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

An npm package (`agent-bootstrap`, published as `sidzan/agent-bootstrap`) that drops a project-tailored multi-agent orchestration skill into any **React (TypeScript)** or **C#** project. Running `npx agent-bootstrap@latest` prompts for stack (frontend / backend / both), discovers project structure, confirms it with the user, and writes a fresh, fully-rendered skill into `.claude/skills/` — no template markers, no runtime config file.

Two orchestrators ship: `implement-app` (frontend, React/TypeScript) and `implement-backend` (C#/.NET). Each comes with three bundled support skills (`jira-tracking`, `create-pull-request`, `sonar-fix`). All internal-project specifics are stripped out and replaced with project values at install time.

The originals (`implement-app/` at this repo root, and `<your private backend skill>`) are gitignored references for the gate sequence, personas, and pipelines. Never commit or modify them.

## Dev Commands

```bash
npm install                        # installs deps + triggers `prepare` → builds dist/
npm run build                      # tsc + chmod +x on bin
npm test                           # typecheck + lint:templates + snapshot tests
node dist/bin/bootstrap.js         # run compiled CLI locally
```

The codebase is **TypeScript** (strict mode, `lib/*.ts` + `bin/*.ts`). Compiled output lives in `dist/` (gitignored — rebuilt by the `prepare` lifecycle hook on `npm install`). The package itself ships zero **runtime** npm dependencies; TypeScript and `@types/node` are devDependencies only, used at build time.

When the package is installed via `npx github:sidzan/agent-orchestrap`, npm runs `prepare` which compiles the TS to `dist/`, and the bin entry runs from there.

No `--update` or `--reconfigure` modes in v1. To pull in newer templates, the user re-runs the CLI; the rename-on-conflict policy produces a fresh `<name>-v2/` for hand-merging. See `docs/design.md` § "Open / deferred items" for the post-v1 update plan.

Manual test matrix (no automated tests in v1) lives at the bottom of `docs/design.md`.

## Architecture

### Source of Truth

| Path | Purpose |
|---|---|
| `bin/bootstrap.ts` | CLI entry point. Runs the 4-pass flow (detect → confirm → integrations → kernel render → pattern discovery). |
| `lib/*.ts` | `detect`, `prompts`, `schema` (declared CONFIG shape), `render` (substitution + audit + atomic writes), `install` (per-skill orchestration), `discover` (claude subprocess + per-stack `FRONTEND_DISCOVERIES` / `BACKEND_DISCOVERIES`), `post-install` (auto-installs agent-browser skill + CLI + .mcp.json), `template-lint` (banned-literals + schema check). |
| `dist/` | Compiled JS — gitignored, rebuilt on every `npm install` via `prepare` hook. |
| `tsconfig.json` | Strict TypeScript settings, `outDir: dist`. |
| `tests/snapshot.js` | Snapshot test driver — imports from `dist/lib/render`. |
| `templates/frontend/implement-app/` | Frontend orchestrator kernel — methodology only (gates, personas incl. Inspector Clouseau, pipelines). No code templates, no shipped reference docs. |
| `templates/backend/implement-backend/` | Backend orchestrator kernel — methodology only (gates, TDD-first personas, persona pointer table). No SQL assets, no shipped migration guide. |
| `templates/shared/` | `jira-tracking/`, `create-pull-request/`, `sonar-fix/` — used by both orchestrators. |
| `templates/hooks/` | `lint-on-save.sh`, `worktree-setup.sh`, `enforce-task-update.sh`. Opt-in. |
| `templates/mcp/` | `mcp.json.example.frontend` (Atlassian + Bitbucket + Lokalise) and `mcp.json.example.backend` (Atlassian + Bitbucket). |
| `implement-app/` | Local private frontend reference. **Gitignored. Never modified, never committed.** |
| `docs/design.md` | Full design spec — authoritative for CLI flow, substitution model, install policy, error handling. |

### CLI flow (4 passes)

1. **Stack selection** — `Frontend / Backend / Both?`
2. **Pass 1 — Structural inference (silent):** lockfiles, workspace files, `package.json` deps, ports from `scripts.dev`, `*.sln` / `*.csproj` recursion, Flyway / EF Core probe.
3. **Pass 2 — Confirmation:** print inferred values, allow inline edits, deselect monorepo apps via checkboxes.
4. **Pass 3 — Integrations:** Jira (Y/n), SonarQube (Y/n), hooks (Y/n), MCP template (Y/n). Defaults: yes.
5. **Render kernel:** install-time substitution renders templates → concrete files written into `.claude/skills/<name>/`.
6. **Pass 4 — Pattern Discovery:** mandatory. Spawns `claude -p` (read-only: Read/Glob/Grep) with the per-stack `{filename, instruction}` list from `lib/discover.js`. Writes each non-FALLBACK entry into `<resolvedSkillDir>/references/`. If `claude` is missing or the user declines → mic-drop exit (`your loss! mic drop. bye`, code 2). If discovery fails mid-run → `references/` left empty/sparse and the install proceeds.
7. **Hooks + MCP example** (optional, prompted in Pass 3).

### Substitution model

**Install-time only.** The CLI substitutes all `{{CONFIG.*}}` markers and renders/omits `{{#if integration.enabled}}…{{/if}}` blocks before writing. The user's repo never contains template syntax, never contains a `project.config.json`. Installed skills read like hand-written content and are safe to edit.

If an integration is declined, its gate steps and its support skill are both omitted from the install set entirely.

### Install policy

- **Fresh install only.** No merging with existing skills.
- **Rename on conflict.** If `.claude/skills/<name>/` exists, prompt for a new name (default `<name>-v2`); the rename cascades through internal references in the rendered orchestrator's `SKILL.md`.
- **Hard abort** if the project is neither React nor C#. Print detected signals and stop.

### Stack scope (v1)

| Stack | Detection | Output |
|---|---|---|
| React (TypeScript) | `package.json` + React deps; lockfile; workspace files for monorepos | `implement-app` + shared support skills |
| C# / .NET | `*.sln` OR any `*.csproj` (recursive); migration tool probed (`flyway.conf` → Flyway, EFCore package → EF Core, otherwise ask) | `implement-backend` + shared support skills |
| Mixed monorepo | Both signal sets matched in distinct directories | Both orchestrators; support skills written once |
| Anything else | — | Hard abort |

### Inspector Clouseau (frontend browser QA)

Always included in `implement-app`. Auth state path (default `~/.agent-browser/`) becomes a substitution value. The `agent-browser` skill itself is **not bundled** — it is Vercel-published. The post-install message instructs the user to run `npx skills add vercel-labs/agent-browser` and `npm i -g agent-browser`.

## Key Constraints

- `bin/bootstrap.js` ≤ 300 lines. Overflow goes to `lib/`.
- Zero npm dependencies — Node.js built-ins only.
- All generalization work happens under `templates/`. The `implement-app/` reference copy at the repo root is never committed or modified.
- The package will be published at `sidzan/agent-bootstrap` on GitHub + npm. Keep skill files free of internal-project specifics — those values are user-supplied at install time.
- v1 supports React + C# only. Adding a new stack means: new branch in `lib/detect.js`, new `templates/<stack>/`, new entry in the stack-selection prompt — but is out of scope for v1.
