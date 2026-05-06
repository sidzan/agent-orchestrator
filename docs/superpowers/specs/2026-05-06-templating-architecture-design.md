# Templating Architecture (v0.3) — Design Spec

**Date:** 2026-05-06
**Status:** Approved (autonomous mode) — supersedes ad-hoc render in v0.2.
**Affects:** `bin/bootstrap.js`, `lib/{substitute,install,discover,detect,prompts}.js`, every file in `templates/`, new `tests/`, new `docs/templating.md`.

---

## Problem

The v0.2 render is held together with reactive patches. Every leak we found (`pnpm` literals, `Resources.ts` mentions, EDIT-ME wording, `<UNSET:...>` sentinels in shipped output) is a symptom of three missing pieces:

1. **No declared variable schema.** The set of `{{CONFIG.*}}` paths is implicit. Templates can reference markers that don't exist; configs can omit values templates need; nobody catches either case until runtime.
2. **No template-authoring contract.** Authors hardcode literals (`pnpm test`, `Flow24`, `apps/admin`) by reflex because nothing flags them.
3. **No render-time audit.** Render emits warning text and continues, shipping broken output to the user.

Result: the project looks half-baked because it is. To ship this as a product (let alone sell it), we need a real template engine: declared schema, lint, atomic render with audit, automated regression.

---

## Goals

- Single source of truth for the config shape.
- Every kernel template is validated against the schema before commit.
- Every install is validated against the schema before any file is written.
- Banned literals (project-shape leaks like `pnpm`, `Flow24`, `Resources.ts`) cannot land in the kernel; CI/pre-commit blocks them.
- Atomic install — partial failure leaves the user's repo untouched.
- Snapshot tests catch render drift across canonical project shapes.

## Non-Goals (v0.3)

- Reformatting or rewriting kernel content beyond fixing what the linter surfaces.
- Adding new orchestrator capabilities (kept stable while infrastructure firms up).
- Rewriting the discovery system. Discovery output is opaque to substitution and stays as-is.

---

## The six pieces

### 1. `lib/schema.js`

Single file enumerating every `CONFIG.*` path the kernel can reference, with:

- `type`: `string | number | boolean | enum | array<...> | object<...>`
- `source`: `cwd-basename | lockfile-detected | workspace-detected | package-json-script | computed | prompted`
- `required`: boolean (or `requiredWhen: <conditional path>`)
- `default`: value (where applicable)
- `description`: one-line human prose

Example:

```js
{
  "project.name":              { type: "string", source: "cwd-basename", required: true },
  "project.packageManager":    { type: "enum",   source: "lockfile-detected", required: true,
                                  values: ["npm","pnpm","yarn","bun","none"] },
  "apps":                      { type: "array",  source: "workspace-detected", required: true,
                                  itemShape: {
                                    "name":             { type: "string", required: true },
                                    "path":             { type: "string", required: true },
                                    "port":             { type: "number", default: 3000 },
                                    "pnpmFilter":       { type: "string", required: false },
                                    "devCommand":       { type: "string", required: true },
                                    "testCommand":      { type: "string", required: true },
                                    "lintCommand":      { type: "string", required: true },
                                    "typecheckCommand": { type: "string", required: true },
                                    "buildCommand":     { type: "string", required: true },
                                  }},
  "commands.test":             { type: "string", source: "computed", required: true,
                                  description: "Project-wide test command (apps[0].testCommand for single-repo)" },
  "commands.lint":             { type: "string", source: "computed", required: true },
  "commands.typecheck":        { type: "string", source: "computed", required: true },
  "commands.build":            { type: "string", source: "computed", required: true },
  "commands.dev":              { type: "string", source: "computed", required: true },
  "integrations.jira.enabled":     { type: "boolean", source: "prompted", required: true },
  "integrations.jira.baseUrl":     { type: "string",  source: "prompted",
                                     requiredWhen: "integrations.jira.enabled" },
  "integrations.jira.projectKey":  { type: "string",  source: "prompted",
                                     requiredWhen: "integrations.jira.enabled" },
  "integrations.sonar.enabled":    { type: "boolean", source: "prompted", required: true },
  "integrations.sonar.projectKey": { type: "string",  source: "prompted",
                                     requiredWhen: "integrations.sonar.enabled" },
  "browserQA.enabled":             { type: "boolean", source: "computed", required: true },
  "browserQA.authStatePath":       { type: "string",  source: "prompted",
                                     requiredWhen: "browserQA.enabled" },
  "backend.solutionPath":      { type: "string", source: "detected", required: false },
  "backend.projectName":       { type: "string", source: "detected", required: false },
  "backend.srcPath":           { type: "string", source: "detected", required: false },
  "backend.testsPath":         { type: "string", source: "detected", required: false },
  "backend.migrationTool":     { type: "enum",   source: "detected-or-prompted",
                                  values: ["flyway","efcore","none"], required: false },
}
```

Exports:

- `SCHEMA` — the declarations
- `validate(config)` — returns `{ ok, errors[], unknownPaths[] }`
- `resolvePath(config, path)` — same as today's substitute, but schema-checked
- `enumeratePaths(text)` — extract every `{{CONFIG.x}}` from a string (used by linter)

### 2. `lib/template-lint.js`

Walks `templates/` recursively. For each file:

- Extracts every `{{CONFIG.*}}` marker. Cross-checks against `SCHEMA`. **Fail** on any path not in the schema.
- Greps for banned literals from a curated list:
  - Package managers: `pnpm test`, `pnpm run`, `npm test`, `yarn test`, `bun test` (catches reflex hardcodes; `pnpm` alone in prose is OK if surrounding text needs it)
  - Test runners: `vitest`, `jest`, `cypress`, `playwright` (when used as commands, not when used as concepts)
  - Source-project leaks: `Flow24`, `flow24`, `Retail24`, `retail24`, `RT24`, `apphuset`, `7peakssoftware`, `ICPlan`, `BackOffice`, `FieldEmployee`, `Customer.Api`, `Resources.ts`, `Resources.WIDGETS`, `ListPageContainer`, `DatagridConfigurable`, `useDataProvider`, `operationCountry`, `_eq` (as a filter suffix)
  - Stack assumptions: `apps/admin`, `packages/ui`, `@yourorg/`, `@flow24/`
- Greps for deprecated markers: `<!-- DISCOVER`, `EDIT-ME`, `<UNSET:`
- An exception list per file (for cases where a literal is genuinely needed — e.g., the post-install message in `bin/` mentions `npm i -g agent-browser` because that's a real command unrelated to the project's package manager).

Returns `{ ok, errors: [{file, line, kind, message}] }`.

CLI: `node lib/template-lint.js` exits 0 or 1.

### 3. `lib/render.js`

Replaces today's `lib/substitute.js` and the render path inside `lib/install.js`. New shape:

```js
const { renderTree, renderFile, RenderError } = require("./render");

const result = renderTree(templateDir, config, { schema: SCHEMA });
// result.files = [{ relativePath: "SKILL.md", content: "..." }, ...]
// result.errors = [...]   (empty on success)
```

Internal flow:

1. Validate `config` against `SCHEMA` first. If invalid → `RenderError` with the missing-or-wrong-typed paths.
2. Walk `templateDir` recursively, in-memory only.
3. For each text file: substitute `{{CONFIG.*}}` and `{{#if}}...{{/if}}`.
4. After substitution, audit each rendered file:
   - **Fail** on any leftover `{{` or `}}` (unsubstituted marker).
   - **Fail** on any `<UNSET:...>` sentinel.
   - **Warn** on banned literals (the lint should have caught these in CI; warning-only at install since user templates may reference real commands intentionally).
5. Return the in-memory file tree. **No disk writes happen here.**

Backwards-compat: `lib/substitute.js` keeps its existing `render()` export, but it becomes a thin wrapper around `renderFile()` so legacy callers work during migration.

### 4. Atomic install pipeline

`lib/install.js` and `bin/bootstrap.js` rework:

```
1. Detect (lib/detect.js)
2. Confirm (interactive)
3. Build config object
4. Validate config against SCHEMA — fail fast
5. Render each component into memory:
   - Frontend kernel (if selected) → in-memory tree
   - Backend kernel (if selected)  → in-memory tree
   - Shared support skills          → in-memory trees
   - Hooks (if opted-in)            → in-memory tree
   - MCP example (if opted-in)      → in-memory tree
6. Audit the combined in-memory tree for any leftover marker / sentinel.
   FAIL → print everything that's wrong, exit nonzero, NOTHING WRITTEN.
7. Write everything atomically. If a write mid-tree fails for IO reasons,
   roll back what was already written.
8. Discovery (Pass 4) — runs against the now-installed orchestrator dir.
9. Post-install summary.
```

The crucial new property: **the user either gets a fully-validated install or no install at all**. No half-rendered files with `<UNSET:...>` markers.

### 5. `tests/snapshot.js` (zero deps)

A small Node test runner (no Jest/Vitest dependency — keeping the zero-dep promise). For each canonical fixture in `tests/fixtures/`:

```
tests/fixtures/
├── npm-single-repo.config.json
├── pnpm-monorepo.config.json
├── dotnet-flyway.config.json
├── dotnet-efcore.config.json
└── snapshots/
    ├── npm-single-repo/    (rendered output)
    ├── pnpm-monorepo/
    ├── ...
```

Run: `node tests/snapshot.js`. Renders templates against each fixture, compares to snapshot, prints a diff if drift detected. CI runs this on every PR. Snapshots updated with `node tests/snapshot.js --update`.

### 6. `docs/templating.md`

Author's guide. Sections:
- **Schema reference** — auto-generated from `lib/schema.js` (one-liner per path)
- **How to use markers** — `{{CONFIG.x}}` and `{{#if x.enabled}}...{{/if}}` syntax
- **Banned literals** — full list with rationale
- **Adding a new variable** — schema → detection → prompts → render
- **Adding a new template file** — where it goes, what markers it can use
- **Adding a new discovery target** — `lib/discover.js` `FRONTEND/BACKEND_DISCOVERIES`

---

## CLI / package.json

```json
{
  "scripts": {
    "lint:templates": "node lib/template-lint.js",
    "test:snapshot":  "node tests/snapshot.js",
    "test:snapshot:update": "node tests/snapshot.js --update",
    "test":           "npm run lint:templates && npm run test:snapshot",
    "start":          "node bin/bootstrap.js"
  }
}
```

`npm test` is the single command CI runs. Pre-commit hook (optional, opt-in by user) runs `npm run lint:templates`.

---

## Migration plan

This is a v0.2 → v0.3 break in template-authoring contract. Existing user installs are unaffected — they're already-rendered files. The break is for *us* / contributors editing templates.

Steps:
1. Ship the new infrastructure (schema, lint, render).
2. Run the lint against current templates. Fix every leak.
3. Land the snapshot tests.
4. Cut a v0.3 tag.

Future kernel edits must pass `npm test` before commit.

---

## Manual test matrix (additions)

| Scenario | Expected |
|---|---|
| Run `npm run lint:templates` against current templates | Initially produces a list of leaks (this is the punch list). After fixes: exits 0. |
| Run `npm run test:snapshot` | All four fixtures render cleanly, match snapshots. |
| Add a new variable to schema, ship a template using it, run lint | Lint passes. |
| Add a new variable to a template WITHOUT updating schema | Lint fails with "unknown CONFIG path". |
| Build a config object missing a required field, run install | Validation fails before any write. Repo unchanged. |
| Run install, simulate a write failure mid-tree | Already-written files are rolled back. |
| Existing v0.2 installs | Untouched (already-rendered files on user disk). |

---

## What's deliberately deferred

- **`{{#each apps as a}}...{{/each}}` loops.** Not in v0.3. The current `{{CONFIG.apps[0].path}}` zero-index pattern stays. Multi-app loops can land later.
- **JSON schema export.** Schema is JS only; if we want to publish a JSON schema for editor autocomplete, that's later.
- **Per-marker filters / formatters** (e.g. `{{CONFIG.project.name | lower}}`). Not in v0.3.
- **`--update` reinstall flow.** Still deferred from earlier specs.
